# Backend Service (Railway) Implementation Plan — Plan 1 of 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One FastAPI service under `server/` that does invite-only login (magic link + Google), voice transcription, a Stockfish check of a submitted line, the owner-only drill bundle and per-user progress — testable locally, deployable to Railway.

**Architecture:** `server/voicecore.py` holds the voice logic moved out of `scripts/voice_server.py` (the local stdlib server keeps working and imports it). `server/app.py` builds the FastAPI app from a `Settings` object; mailer, Google verifier and engine are injectable so tests run without network. Storage is SQLite + files on one data directory (`ZZ_DATA`, a Railway volume in production). Plan 2 (web app, PWA, Netlify) consumes the HTTP API defined here.

**Tech Stack:** Python 3.12, FastAPI 0.115, uvicorn, python-chess 1.11, itsdangerous, google-auth + requests, httpx (Resend API + TestClient), SQLite (stdlib), Stockfish (UCI), whisper.cpp `whisper-cli` 1.9.1, ffmpeg.

Spec: `docs/superpowers/specs/2026-10-01-mobile-pwa-voice-design.md` (SQLite on the volume replaces Postgres — one service, same code in tests and production).

## Global Constraints

- Public repo: no emails, secrets, book positions or drill content in any tracked file. Allowlist and keys come from env only.
- Keys/sentences are teaching sentences, never raw eval numbers. `/api/check` replies never contain a number of pawns or centipawns.
- The engine runs only on a submitted line (`POST /api/check`), never before.
- `file://` + `python3 scripts/voice_server.py` (127.0.0.1:8766) must keep working unchanged; `tests/test_voice_server.py` must pass unchanged.
- Every route except `/api/health` and `/api/auth/*` requires a logged-in, allowlisted user. `/api/drills/*` requires the owner.
- The magic-link request reply is identical for allowed and unknown emails.
- Cookie: `zz_session`, HttpOnly, Secure, SameSite=Lax, 30 days.
- Voice model CC BY-NC-SA: downloaded at runtime into the data dir, never into the image or repo.
- Commit only on Martin's go — the executor commits per task locally; nothing is pushed or deployed without asking.

## File Structure

```
server/__init__.py        empty
server/voicecore.py       spoken/grammar/transcribe/samples (moved from scripts/voice_server.py)
server/settings.py        Settings dataclass from env
server/db.py              SQLite: users, login_tokens, progress
server/ratelimit.py       in-memory sliding window
server/auth.py            allowlist, magic link, Google, session cookie, current_user/owner deps
server/mailer.py          Resend sender + FakeMailer
server/voice_api.py       /api/voice/*
server/engine.py          check_line(): Stockfish → teaching sentences
server/check_api.py       /api/check
server/drills.py          /api/drills/bundle.js (owner)
server/progress.py        /api/progress
server/app.py             create_app(settings, mailer=None, google_verify=None, engine=None)
server/requirements.txt
server/Dockerfile
server/railway.toml
scripts/voice_server.py   keeps Handler/main, imports from server.voicecore
scripts/push_drills.py    uploads sessions/private/bundle.js to the owner endpoint
tests/server_fixtures.py  shared TestClient fixtures
tests/test_server_auth.py, test_server_check.py, test_server_voice.py, test_server_data.py
```

---

### Task 1: Move voice logic into `server/voicecore.py`

**Files:**
- Create: `server/__init__.py`, `server/voicecore.py`, `server/requirements.txt`
- Modify: `scripts/voice_server.py`
- Test: `tests/test_voice_server.py` (unchanged, must stay green), `tests/test_server_voice.py` (new, pure part)

**Interfaces:**
- Produces: `server.voicecore` with `CACHE: Path`, `MODELS: dict`, `MAX_BODY: int`, `SAMPLES: Path`, `SAN: re.Pattern`, `spoken(san, lang) -> list[str]`, `grammar(moves, lang) -> str`, `model_path(lang) -> Path`, `transcribe(audio: bytes, lang: str, moves: list[str] | None = None) -> str`, `save_sample(audio, lang, label, heard, source, root: Path = SAMPLES) -> dict`, `sample_stats(root: Path = SAMPLES) -> dict`, `valid_label(label: str) -> bool`.
- `scripts/voice_server.py` still exposes `CACHE`, `Handler`, `ThreadingHTTPServer` (the existing test loads it by path).

- [ ] **Step 1: Write the failing test** — `tests/test_server_voice.py`

```python
from server import voicecore


def test_spoken_forms_and_grammar():
    assert voicecore.spoken("Nxc3", "en")[0] == "knight takes C. three"
    assert voicecore.spoken("Nxc3", "de")[0] == "springer schlägt c drei"
    g = voicecore.grammar(["Nxc3", "O-O"], "en")
    assert g.startswith("root ::=") and '"castles kingside"' in g


def test_labels():
    assert voicecore.valid_label("Rac1") and voicecore.valid_label("O-O+")
    assert not voicecore.valid_label("hello")


def test_cache_dir_follows_env(monkeypatch, tmp_path):
    import importlib
    monkeypatch.setenv("ZZ_VOICE_DIR", str(tmp_path))
    mod = importlib.reload(voicecore)
    assert mod.CACHE == tmp_path and mod.SAMPLES == tmp_path / "samples"
    monkeypatch.delenv("ZZ_VOICE_DIR")
    importlib.reload(voicecore)
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m pytest tests/test_server_voice.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 3: Create the module**

`server/__init__.py`: empty file.

`server/voicecore.py`: move from `scripts/voice_server.py`, verbatim, the block from `CACHE = …` through the end of `sample_stats()` (constants `CACHE`, `MODELS`, `MAX_BODY`, `SAMPLES`, `WORDS`, `SAN`, functions `spoken`, `grammar`, `WHISPER`, `FFMPEG`, `model_path`, `transcribe`, `save_sample`, `sample_stats`) plus the imports they use, with exactly these changes:

```python
"""Speech-to-move core shared by the local server (scripts/voice_server.py) and the hosted API.

Model: atamano/whisper-chess-tiny (EN) / -de (DE). CC BY-NC-SA 4.0 — personal use; downloaded into
the cache dir on first use, never into the repo or an image.
"""
from __future__ import annotations

import datetime
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

CACHE = Path(os.environ.get("ZZ_VOICE_DIR") or Path.home() / ".cache" / "zwischenzug" / "voice")
# ... MODELS, MAX_BODY unchanged ...
SAMPLES = CACHE / "samples"
# ... WORDS, SAN, spoken, grammar unchanged ...
WHISPER = os.environ.get("WHISPER_CLI") or shutil.which("whisper-cli") or "/opt/homebrew/bin/whisper-cli"
FFMPEG = os.environ.get("FFMPEG") or shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
# ... model_path, transcribe unchanged ...


def valid_label(label: str) -> bool:
    return bool(SAN.match(label)) or label.rstrip("+#") in ("O-O", "O-O-O")


def save_sample(audio: bytes, lang: str, label: str, heard: str, source: str, root: Path | None = None) -> dict:
    """One of his recordings with the move it meant, for measuring and later fine-tuning."""
    folder = (root or SAMPLES) / lang
    # ... rest of the body unchanged ...


def sample_stats(root: Path | None = None) -> dict:
    out = {}
    for manifest in (root or SAMPLES).glob("*/manifest.jsonl"):
        # ... rest unchanged ...
```

(`root: Path | None = None` with `root or SAMPLES` instead of a default bound at import, so a reload with a new `ZZ_VOICE_DIR` is honoured.)

`scripts/voice_server.py`: delete the moved block and its now-unused imports (`datetime`, `re`, `shutil`, `tempfile`, `urllib.request`), and after the remaining imports add:

```python
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.voicecore import (CACHE, FFMPEG, MAX_BODY, MODELS, WHISPER, model_path,  # noqa: E402,F401
                              sample_stats, save_sample, transcribe, valid_label)
```

In `Handler.do_POST` replace `if not SAN.match(label) and label.rstrip("+#") not in ("O-O", "O-O-O"):` with `if not valid_label(label):`. Leave the docstring, `Handler`, `main` otherwise unchanged.

`server/requirements.txt`:

```
fastapi==0.115.14
uvicorn[standard]==0.34.0
python-chess==1.11.2
itsdangerous==2.2.0
google-auth==2.38.0
requests==2.32.3
httpx==0.28.1
```

- [ ] **Step 4: Install and run both test files**

Run: `python3 -m pip install -q -r server/requirements.txt && python3 -m pytest tests/test_server_voice.py tests/test_voice_server.py -q`
Expected: all pass (the model-dependent tests may SKIP only if the model is missing — on this Mac they run).

- [ ] **Step 5: Commit**

```bash
git add server/__init__.py server/voicecore.py server/requirements.txt scripts/voice_server.py tests/test_server_voice.py
git commit -m "Move the voice core into server/ so the hosted service can share it"
```

---

### Task 2: Settings, SQLite store, rate limiter

**Files:**
- Create: `server/settings.py`, `server/db.py`, `server/ratelimit.py`
- Test: `tests/test_server_data.py`

**Interfaces:**
- Produces:
  - `Settings(data_dir: Path, allowed: frozenset[str], owner: str, secret: str, site_url: str, google_client_id: str, resend_key: str, mail_from: str, stockfish: str, secure_cookie: bool = True)`; `Settings.from_env() -> Settings`; `Settings.is_allowed(email) -> bool`.
  - `Db(path: Path)` with `.touch_user(email) -> None`, `.add_token(email, token_hash, expires: float) -> None`, `.take_token(token_hash, now: float) -> str | None` (single use), `.recent_tokens(email, since: float) -> int`, `.get_progress(email) -> tuple[dict, float] | None`, `.put_progress(email, state: dict, base: float | None, now: float) -> tuple[bool, dict, float]` (False + current row on conflict).
  - `RateLimit(limit: int, per_seconds: float)` with `.hit(key: str, now: float | None = None) -> bool` (True = allowed).

- [ ] **Step 1: Write the failing test** — `tests/test_server_data.py`

```python
from server.db import Db
from server.ratelimit import RateLimit
from server.settings import Settings


def test_settings_from_env(monkeypatch, tmp_path):
    monkeypatch.setenv("ZZ_DATA", str(tmp_path))
    monkeypatch.setenv("ALLOWED_EMAILS", " A@x.de, b@y.org ")
    monkeypatch.setenv("OWNER_EMAIL", "A@X.de")
    monkeypatch.setenv("SESSION_SECRET", "s" * 32)
    monkeypatch.setenv("SITE_URL", "https://zz.example/")
    s = Settings.from_env()
    assert s.is_allowed("a@x.de") and s.is_allowed("B@Y.org") and not s.is_allowed("c@z.com")
    assert s.owner == "a@x.de" and s.site_url == "https://zz.example"
    assert s.is_allowed(s.owner)


def test_owner_is_always_allowed_and_secret_required(monkeypatch, tmp_path):
    monkeypatch.setenv("ZZ_DATA", str(tmp_path))
    monkeypatch.setenv("ALLOWED_EMAILS", "")
    monkeypatch.setenv("OWNER_EMAIL", "o@x.de")
    monkeypatch.setenv("SESSION_SECRET", "short")
    import pytest
    with pytest.raises(SystemExit):
        Settings.from_env()


def test_tokens_are_single_use_and_expire(tmp_path):
    db = Db(tmp_path / "zz.db")
    db.add_token("a@x.de", "h1", expires=100.0)
    assert db.take_token("h1", now=50.0) == "a@x.de"
    assert db.take_token("h1", now=50.0) is None
    db.add_token("a@x.de", "h2", expires=100.0)
    assert db.take_token("h2", now=101.0) is None
    assert db.recent_tokens("a@x.de", since=0.0) == 2


def test_progress_conflict(tmp_path):
    db = Db(tmp_path / "zz.db")
    assert db.get_progress("a@x.de") is None
    ok, state, at = db.put_progress("a@x.de", {"progress": {"s": 1}}, base=None, now=10.0)
    assert ok and at == 10.0
    ok, state, at = db.put_progress("a@x.de", {"progress": {"s": 2}}, base=5.0, now=11.0)
    assert not ok and state == {"progress": {"s": 1}} and at == 10.0
    ok, _, at = db.put_progress("a@x.de", {"progress": {"s": 2}}, base=10.0, now=12.0)
    assert ok and db.get_progress("a@x.de") == ({"progress": {"s": 2}}, 12.0)


def test_rate_limit_window():
    rl = RateLimit(2, 60)
    assert rl.hit("k", 0) and rl.hit("k", 1) and not rl.hit("k", 2)
    assert rl.hit("k", 61) and rl.hit("other", 2)
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m pytest tests/test_server_data.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.db'`

- [ ] **Step 3: Implement**

`server/settings.py`:

```python
"""Everything the service reads from the environment. Nothing here is ever committed with values."""
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path


def _emails(raw: str) -> frozenset[str]:
    return frozenset(e.strip().lower() for e in raw.split(",") if e.strip())


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    allowed: frozenset[str]
    owner: str
    secret: str
    site_url: str
    google_client_id: str = ""
    resend_key: str = ""
    mail_from: str = ""
    stockfish: str = "stockfish"
    secure_cookie: bool = True

    def is_allowed(self, email: str) -> bool:
        email = email.strip().lower()
        return email == self.owner or email in self.allowed

    @classmethod
    def from_env(cls) -> "Settings":
        secret = os.environ.get("SESSION_SECRET", "")
        if len(secret) < 32:
            raise SystemExit("SESSION_SECRET must be at least 32 characters")
        data = Path(os.environ.get("ZZ_DATA") or "/data")
        data.mkdir(parents=True, exist_ok=True)
        return cls(
            data_dir=data,
            allowed=_emails(os.environ.get("ALLOWED_EMAILS", "")),
            owner=os.environ.get("OWNER_EMAIL", "").strip().lower(),
            secret=secret,
            site_url=os.environ.get("SITE_URL", "").rstrip("/"),
            google_client_id=os.environ.get("GOOGLE_CLIENT_ID", ""),
            resend_key=os.environ.get("RESEND_API_KEY", ""),
            mail_from=os.environ.get("MAIL_FROM", ""),
            stockfish=os.environ.get("STOCKFISH") or shutil.which("stockfish") or "/usr/games/stockfish",
            secure_cookie=os.environ.get("INSECURE_COOKIE") != "1",
        )
```

`server/db.py`:

```python
"""SQLite on the data volume: users, one-time login tokens, progress. One file, one writer process."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path

SCHEMA = """
create table if not exists users (email text primary key, created real not null, last_login real not null);
create table if not exists login_tokens (hash text primary key, email text not null, created real not null,
                                         expires real not null, used integer not null default 0);
create table if not exists progress (email text primary key, state text not null, updated real not null);
"""


class Db:
    def __init__(self, path: Path):
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.lock = threading.Lock()
        with self.lock:
            self.conn.executescript(SCHEMA)

    def _run(self, sql: str, args: tuple = ()) -> list[tuple]:
        with self.lock, self.conn:
            return self.conn.execute(sql, args).fetchall()

    def touch_user(self, email: str) -> None:
        now = time.time()
        self._run("insert into users values (?, ?, ?) on conflict(email) do update set last_login = ?",
                  (email, now, now, now))

    def add_token(self, email: str, token_hash: str, expires: float) -> None:
        self._run("insert into login_tokens (hash, email, created, expires) values (?, ?, ?, ?)",
                  (token_hash, email, time.time(), expires))

    def take_token(self, token_hash: str, now: float) -> str | None:
        with self.lock, self.conn:
            row = self.conn.execute("select email, expires, used from login_tokens where hash = ?",
                                    (token_hash,)).fetchone()
            if not row or row[2] or row[1] < now:
                return None
            self.conn.execute("update login_tokens set used = 1 where hash = ?", (token_hash,))
            return row[0]

    def recent_tokens(self, email: str, since: float) -> int:
        return self._run("select count(*) from login_tokens where email = ? and created >= ?", (email, since))[0][0]

    def get_progress(self, email: str) -> tuple[dict, float] | None:
        rows = self._run("select state, updated from progress where email = ?", (email,))
        return (json.loads(rows[0][0]), rows[0][1]) if rows else None

    def put_progress(self, email: str, state: dict, base: float | None, now: float) -> tuple[bool, dict, float]:
        with self.lock, self.conn:
            row = self.conn.execute("select state, updated from progress where email = ?", (email,)).fetchone()
            if row and (base is None or base < row[1]):
                return False, json.loads(row[0]), row[1]
            self.conn.execute("insert into progress values (?, ?, ?) on conflict(email) do update "
                              "set state = excluded.state, updated = excluded.updated",
                              (email, json.dumps(state), now))
            return True, state, now
```

`server/ratelimit.py`:

```python
"""Sliding-window limiter, in memory: the service runs as one process."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimit:
    def __init__(self, limit: int, per_seconds: float):
        self.limit, self.per = limit, per_seconds
        self.hits: dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def hit(self, key: str, now: float | None = None) -> bool:
        now = time.time() if now is None else now
        with self.lock:
            q = self.hits[key]
            while q and q[0] <= now - self.per:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True
```

- [ ] **Step 4: Run tests**

Run: `python3 -m pytest tests/test_server_data.py -q`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add server/settings.py server/db.py server/ratelimit.py tests/test_server_data.py
git commit -m "Add the service's settings, SQLite store and rate limiter"
```

---

### Task 3: Auth — allowlist, magic link, Google, session cookie

**Files:**
- Create: `server/mailer.py`, `server/auth.py`, `server/app.py`, `tests/server_fixtures.py`
- Test: `tests/test_server_auth.py`

**Interfaces:**
- Consumes: `Settings`, `Db`, `RateLimit` (Task 2).
- Produces:
  - `Mailer` protocol: `.send(to: str, subject: str, text: str) -> None`; `ResendMailer(key, sender)`; `FakeMailer` with `.sent: list[tuple[str, str, str]]`.
  - `create_app(settings, mailer=None, google_verify=None, engine=None) -> FastAPI`; `app.state.settings`, `.db`, `.mailer`, `.google_verify: Callable[[str], dict]` (returns token claims), `.engine`.
  - Deps in `server.auth`: `current_user(request) -> str` (email, 401 otherwise), `owner_user(request) -> str` (403 for non-owner).
  - Routes: `POST /api/auth/request {email}` → 200 `{"sent": true}` always; `GET /api/auth/verify?t=` → 303 to `/` + cookie, or 303 to `/?login=expired`; `POST /api/auth/google {credential}` → 200 `{email, owner}` + cookie, 403 not allowed, 401 bad token; `GET /api/auth/me` → `{email, owner}` / 401; `POST /api/auth/logout` → 200, cookie cleared; `GET /api/health` → `{"ok": true}`.
  - Module-level `server.app:app` built from `Settings.from_env()` lazily (only when imported by uvicorn).
  - Fixtures in `tests/server_fixtures.py`: `settings` (tmp data dir, allowed `friend@x.de`, owner `owner@x.de`, `secure_cookie=False`), `mailer` (FakeMailer), `client` (TestClient), `login(client, email)` helper.

- [ ] **Step 1: Write fixtures and the failing test**

`tests/server_fixtures.py`:

```python
import re

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.mailer import FakeMailer
from server.settings import Settings

OWNER, FRIEND, STRANGER = "owner@x.de", "friend@x.de", "stranger@x.de"


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path, allowed=frozenset({FRIEND}), owner=OWNER, secret="k" * 40,
                    site_url="https://zz.test", google_client_id="cid", secure_cookie=False)


@pytest.fixture
def mailer():
    return FakeMailer()


def fake_google(credential: str) -> dict:
    if not credential.startswith("ok:"):
        raise ValueError("bad token")
    return {"email": credential[3:], "email_verified": True, "aud": "cid"}


@pytest.fixture
def client(settings, mailer):
    return TestClient(create_app(settings, mailer=mailer, google_verify=fake_google))


def login(client, mailer, email):
    client.post("/api/auth/request", json={"email": email})
    link = re.search(r"https://zz\.test(/api/auth/verify\?t=\S+)", mailer.sent[-1][2]).group(1)
    return client.get(link, follow_redirects=False)
```

`tests/test_server_auth.py`:

```python
from server_fixtures import FRIEND, OWNER, STRANGER, client, login, mailer, settings  # noqa: F401


def test_health_is_open(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_request_reply_does_not_reveal_the_list(client, mailer):
    a = client.post("/api/auth/request", json={"email": STRANGER})
    b = client.post("/api/auth/request", json={"email": FRIEND})
    assert a.status_code == b.status_code == 200 and a.json() == b.json() == {"sent": True}
    assert [m[0] for m in mailer.sent] == [FRIEND]


def test_magic_link_logs_in_once(client, mailer):
    r = login(client, mailer, FRIEND.upper())
    assert r.status_code == 303 and r.headers["location"] == "/"
    assert "zz_session" in r.cookies or "zz_session" in client.cookies
    assert client.get("/api/auth/me").json() == {"email": FRIEND, "owner": False}
    link = r.request.url.path + "?" + r.request.url.query.decode() if isinstance(r.request.url.query, bytes) else str(r.request.url)
    client.cookies.clear()
    again = client.get(link, follow_redirects=False)
    assert again.headers["location"] == "/?login=expired"
    assert client.get("/api/auth/me").status_code == 401


def test_request_is_rate_limited(client, mailer):
    for _ in range(5):
        client.post("/api/auth/request", json={"email": FRIEND})
    assert len(mailer.sent) == 3


def test_google_login(client):
    assert client.post("/api/auth/google", json={"credential": "garbage"}).status_code == 401
    assert client.post("/api/auth/google", json={"credential": "ok:" + STRANGER}).status_code == 403
    r = client.post("/api/auth/google", json={"credential": "ok:" + OWNER})
    assert r.json() == {"email": OWNER, "owner": True}
    assert client.get("/api/auth/me").json()["owner"] is True


def test_unverified_google_email_is_refused(client, settings):
    client.app.state.google_verify = lambda c: {"email": FRIEND, "email_verified": False}
    assert client.post("/api/auth/google", json={"credential": "x"}).status_code == 401


def test_removed_from_list_loses_access(client, mailer, settings):
    login(client, mailer, FRIEND)
    from dataclasses import replace
    client.app.state.settings = replace(settings, allowed=frozenset())
    assert client.get("/api/auth/me").status_code == 401


def test_logout(client, mailer):
    login(client, mailer, FRIEND)
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401
```

Add to `tests/conftest.py` (top, after imports) so the fixtures module is importable:

```python
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m pytest tests/test_server_auth.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.app'`

- [ ] **Step 3: Implement**

`server/mailer.py`:

```python
"""Sends the login link. Resend in production, a list in tests."""
from __future__ import annotations

import httpx


class ResendMailer:
    def __init__(self, key: str, sender: str):
        self.key, self.sender = key, sender

    def send(self, to: str, subject: str, text: str) -> None:
        r = httpx.post("https://api.resend.com/emails", timeout=15,
                       headers={"Authorization": f"Bearer {self.key}"},
                       json={"from": self.sender, "to": [to], "subject": subject, "text": text})
        r.raise_for_status()


class FakeMailer:
    def __init__(self):
        self.sent: list[tuple[str, str, str]] = []

    def send(self, to: str, subject: str, text: str) -> None:
        self.sent.append((to, subject, text))
```

`server/auth.py`:

```python
"""Invite-only login: an allowlisted email gets a one-time link, or signs in with Google.
Both end in the same signed session cookie. The allowlist is checked on every request,
so removing an email from ALLOWED_EMAILS locks that person out at once."""
from __future__ import annotations

import hashlib
import logging
import secrets
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel

from server.ratelimit import RateLimit

COOKIE = "zz_session"
MAX_AGE = 30 * 24 * 3600
LINK_TTL = 15 * 60
log = logging.getLogger("zz.auth")
router = APIRouter(prefix="/api/auth")


def _signer(request: Request) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(request.app.state.settings.secret, salt="zz-session")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _session(request: Request, email: str, response):
    s = request.app.state.settings
    request.app.state.db.touch_user(email)
    response.set_cookie(COOKIE, _signer(request).dumps(email), max_age=MAX_AGE, httponly=True,
                        secure=s.secure_cookie, samesite="lax", path="/")
    return response


def current_user(request: Request) -> str:
    raw = request.cookies.get(COOKIE)
    try:
        email = _signer(request).loads(raw, max_age=MAX_AGE) if raw else None
    except BadSignature:
        email = None
    if not email or not request.app.state.settings.is_allowed(email):
        raise HTTPException(401, "sign in")
    return email


def owner_user(request: Request) -> str:
    email = current_user(request)
    if email != request.app.state.settings.owner:
        raise HTTPException(403, "owner only")
    return email


class EmailIn(BaseModel):
    email: str


class GoogleIn(BaseModel):
    credential: str


_per_email = RateLimit(3, LINK_TTL)
_per_ip = RateLimit(20, 3600)


@router.post("/request")
def request_link(body: EmailIn, request: Request):
    email = body.email.strip().lower()
    s = request.app.state.settings
    ip = request.client.host if request.client else "?"
    if s.is_allowed(email) and _per_ip.hit(ip) and _per_email.hit(email):
        token = secrets.token_urlsafe(32)
        request.app.state.db.add_token(email, _hash(token), time.time() + LINK_TTL)
        link = f"{s.site_url}/api/auth/verify?t={token}"
        try:
            request.app.state.mailer.send(email, "Zwischenzug — sign in",
                                          f"Open this link to sign in (valid 15 minutes, once):\n\n{link}\n")
        except Exception:  # noqa: BLE001 — mail errors must not reveal whether the email is listed
            log.exception("login mail to %s failed", email)
    return {"sent": True}


@router.get("/verify")
def verify(t: str, request: Request):
    email = request.app.state.db.take_token(_hash(t), time.time())
    if not email or not request.app.state.settings.is_allowed(email):
        return RedirectResponse("/?login=expired", status_code=303)
    return _session(request, email, RedirectResponse("/", status_code=303))


@router.post("/google")
def google(body: GoogleIn, request: Request):
    try:
        claims = request.app.state.google_verify(body.credential)
    except Exception:  # noqa: BLE001
        raise HTTPException(401, "Google sign-in failed")
    if not claims.get("email_verified"):
        raise HTTPException(401, "Google email not verified")
    email = claims["email"].strip().lower()
    s = request.app.state.settings
    if not s.is_allowed(email):
        raise HTTPException(403, "this email is not invited")
    return _session(request, email, JSONResponse({"email": email, "owner": email == s.owner}))


@router.get("/me")
def me(request: Request):
    email = current_user(request)
    return {"email": email, "owner": email == request.app.state.settings.owner}


@router.post("/logout")
def logout():
    r = JSONResponse({"ok": True})
    r.delete_cookie(COOKIE, path="/")
    return r


def google_verifier(client_id: str):
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    def verify(credential: str) -> dict:
        return id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
    return verify
```

The rate limiters are module-level, so tests would leak state between each other: make them per app instead. In `request_link` use `request.app.state.link_email_limit` and `request.app.state.link_ip_limit` instead of `_per_email` / `_per_ip`, delete the two module-level lines, and create them in `create_app` (below).

`server/app.py`:

```python
"""The hosted Zwischenzug service. uvicorn server.app:app"""
from __future__ import annotations

from fastapi import FastAPI

from server import auth
from server.db import Db
from server.mailer import ResendMailer
from server.ratelimit import RateLimit
from server.settings import Settings


def create_app(settings: Settings, mailer=None, google_verify=None, engine=None) -> FastAPI:
    app = FastAPI(title="Zwischenzug", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.db = Db(settings.data_dir / "zz.db")
    app.state.mailer = mailer or ResendMailer(settings.resend_key, settings.mail_from)
    app.state.google_verify = google_verify or auth.google_verifier(settings.google_client_id)
    app.state.engine = engine
    app.state.link_email_limit = RateLimit(3, auth.LINK_TTL)
    app.state.link_ip_limit = RateLimit(20, 3600)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    app.include_router(auth.router)
    return app


def __getattr__(name: str):
    # `uvicorn server.app:app` builds the real app from the environment; tests never touch this.
    if name == "app":
        global app
        app = create_app(Settings.from_env())
        return app
    raise AttributeError(name)
```

- [ ] **Step 4: Run tests; fix the one awkward line**

The `link = …` line in `test_magic_link_logs_in_once` is over-clever; replace it with `link = str(r.request.url).replace("http://testserver", "")` before running.

Run: `python3 -m pytest tests/test_server_auth.py -q`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add server/mailer.py server/auth.py server/app.py tests/server_fixtures.py tests/test_server_auth.py tests/conftest.py
git commit -m "Add invite-only login: one-time mail link or Google, same allowlist"
```

---

### Task 4: Engine check — the line to the last capture

**Files:**
- Create: `server/engine.py`, `server/check_api.py`
- Modify: `server/app.py` (include router, build engine)
- Test: `tests/test_server_check.py`

**Interfaces:**
- Consumes: `current_user` (Task 3), `RateLimit`.
- Produces:
  - `Engine(path: str, movetime: float = 0.3)` with `.analyse(board) -> list[chess.Move]` (PV), `.close()`; thread-safe (one lock).
  - `check_line(engine, fen: str, line: list[str]) -> dict` → `{"sentences": [str], "quiet": bool, "plies_checked": int}`; raises `IllegalPly(index: int, san: str)`.
  - `numbered(board, moves) -> str` e.g. `"16.Qxf5 Rab1"` / `"15…Bxf5 16.Bxf5"`.
  - Route `POST /api/check {fen, line}` → 200 dict above, 400 `{"detail": {"ply": i, "san": s}}`, 429 over 20/min/user, 503 if no engine.

Rules (spec §1 engine.py, tuned on games 1–2):
1. **Stopped early:** from the line's end position, follow the engine PV (≤ 8 plies) to its last capture. If the mover's material (from the side that started the line) changes by ≥ 2 → sentence `"Your line stops after {last ply}. It isn't over: {pv up to last capture} — calculate to the last capture."`, `quiet = False`.
2. **Line goes on:** otherwise, if the end position has the starting side to move → `"After {last ply} it is your move again: the engine continues {first 3 PV plies}."`; if the opponent is to move → `"After {last ply} the engine answers {first 3 PV plies}."` `quiet = True`.
3. Empty line → 400. Line > 30 plies → 400.

Verified with Stockfish 19 at 0.3 s (2026-10-01): game 2 end `…Bxf5 Bxf5` → PV `Qxf5`, material +2 → −1; game 1 `20.a4 a6` → PV `Bd7 …`; `20.Red1` → PV `Rfd8 …`.

- [ ] **Step 1: Write the failing test** — `tests/test_server_check.py`

```python
import shutil

import pytest

from server.engine import Engine, IllegalPly, check_line, numbered
from server_fixtures import FRIEND, client, login, mailer, settings  # noqa: F401

SF = shutil.which("stockfish")
GAME2 = "r4rk1/pppq1ppp/2nn2b1/3p1NB1/3P2P1/2PB1P2/P1P4P/R3QRK1 w - - 5 15"
GAME1 = "r4rk1/p3ppbp/1p4p1/qB1bP3/8/7P/PB2QPP1/1R2R1K1 w - - 2 20"
needs_sf = pytest.mark.skipif(not SF, reason="stockfish missing")


@pytest.fixture(scope="module")
def engine():
    e = Engine(SF)
    yield e
    e.close()


def test_numbered():
    import chess
    b = chess.Board(GAME2)
    b.push_san("Qg3")
    assert numbered(b, [b.parse_san("Nxf5")]) == "15…Nxf5"
    assert numbered(chess.Board(GAME2), [chess.Board(GAME2).parse_san("Qg3")]) == "15.Qg3"


@needs_sf
def test_game2_stops_one_ply_early(engine):
    r = check_line(engine, GAME2, ["Qg3", "Nxf5", "gxf5", "Bxf5", "Bxf5"])
    assert r["quiet"] is False and r["plies_checked"] == 5
    assert "17.Bxf5" in r["sentences"][0] and "17…Qxf5" in r["sentences"][0]
    assert "last capture" in r["sentences"][0]


@needs_sf
def test_game1_line_goes_on_with_bd7(engine):
    r = check_line(engine, GAME1, ["a4", "a6"])
    assert r["quiet"] is True and "21.Bd7" in r["sentences"][0]


@needs_sf
def test_red1_rook_on_the_file(engine):
    r = check_line(engine, GAME1, ["Red1"])
    assert "20…Rfd8" in r["sentences"][0]


@needs_sf
def test_never_a_number_of_pawns(engine):
    for line in (["Qg3", "Nxf5", "gxf5", "Bxf5", "Bxf5"], ["Qg3"]):
        text = " ".join(check_line(engine, GAME2, line)["sentences"])
        assert "pawn" not in text and "+" not in text.replace("+ ", "") or "#" in text
        assert not any(tok.replace(".", "").replace("-", "").isdigit() and "." in tok and len(tok) <= 5
                       for tok in text.split() if tok[0] in "+-0")


def test_illegal_ply(engine if SF else None):
    pass


@needs_sf
def test_illegal_ply_is_named(engine):
    with pytest.raises(IllegalPly) as e:
        check_line(engine, GAME2, ["Qg3", "Qg3"])
    assert e.value.index == 1 and e.value.san == "Qg3"


@needs_sf
def test_check_route(client, mailer, engine):
    client.app.state.engine = engine
    assert client.post("/api/check", json={"fen": GAME2, "line": ["Qg3"]}).status_code == 401
    login(client, mailer, FRIEND)
    r = client.post("/api/check", json={"fen": GAME2, "line": ["Qg3", "Nxf5", "gxf5", "Bxf5", "Bxf5"]})
    assert r.status_code == 200 and r.json()["quiet"] is False
    bad = client.post("/api/check", json={"fen": GAME2, "line": ["Kh8"]})
    assert bad.status_code == 400 and bad.json()["detail"]["ply"] == 0
    assert client.post("/api/check", json={"fen": GAME2, "line": []}).status_code == 400
```

Delete the placeholder `test_illegal_ply(engine if SF else None)` function before running — it is not valid Python in a signature; only `test_illegal_ply_is_named` stays. Simplify `test_never_a_number_of_pawns` to the plain assertion that matters:

```python
@needs_sf
def test_never_a_number_of_pawns(engine):
    import re
    for line in (["Qg3", "Nxf5", "gxf5", "Bxf5", "Bxf5"], ["Qg3"]):
        text = " ".join(check_line(engine, GAME2, line)["sentences"])
        assert "pawn" not in text and not re.search(r"[+-]\d+\.\d", text) and "cp" not in text
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m pytest tests/test_server_check.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'server.engine'`

- [ ] **Step 3: Implement**

`server/engine.py`:

```python
"""After he submits a line: does it stop one ply early? Sentences only — never an eval number.

The leak this serves: he calculates, then stops at the recapture he likes (game 2: ...Bxf5 Bxf5,
missed ...Qxf5) or at the reply he dislikes (game 1: 20.a4 a6, missed 21.Bd7)."""
from __future__ import annotations

import threading

import chess
import chess.engine

VALUE = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
MAX_PLIES = 30
PV_PLIES = 8
SWING = 2


class IllegalPly(ValueError):
    def __init__(self, index: int, san: str):
        super().__init__(f"ply {index} ({san}) is not legal")
        self.index, self.san = index, san


class Engine:
    def __init__(self, path: str, movetime: float = 0.3):
        self.path, self.movetime = path, movetime
        self.lock = threading.Lock()
        self.proc = chess.engine.SimpleEngine.popen_uci(path)

    def analyse(self, board: chess.Board) -> list[chess.Move]:
        with self.lock:
            try:
                info = self.proc.analyse(board, chess.engine.Limit(time=self.movetime))
            except chess.engine.EngineTerminatedError:
                self.proc = chess.engine.SimpleEngine.popen_uci(self.path)
                info = self.proc.analyse(board, chess.engine.Limit(time=self.movetime))
        return list(info.get("pv", []))[:PV_PLIES]

    def close(self) -> None:
        self.proc.quit()


def material(board: chess.Board, side: chess.Color) -> int:
    return sum(VALUE[p.piece_type] * (1 if p.color == side else -1) for p in board.piece_map().values())


def numbered(board: chess.Board, moves: list[chess.Move]) -> str:
    """SAN with move numbers from `board` on: "15.Qg3 Nxf5 16.gxf5", "15…Nxf5 16.gxf5"."""
    b, out = board.copy(), []
    for i, m in enumerate(moves):
        san = b.san(m)
        if b.turn == chess.WHITE:
            out.append(f"{b.fullmove_number}.{san}")
        else:
            out.append(f"{b.fullmove_number}…{san}" if i == 0 else san)
        b.push(m)
    return " ".join(out)


def check_line(engine: Engine, fen: str, line: list[str]) -> dict:
    if not line or len(line) > MAX_PLIES:
        raise IllegalPly(0 if not line else MAX_PLIES, "" if not line else line[MAX_PLIES])
    board = chess.Board(fen)
    side = board.turn
    for i, san in enumerate(line):
        try:
            move = board.parse_san(san)
        except ValueError:
            raise IllegalPly(i, san)
        before = board.copy()
        board.push(move)
    last = numbered(before, [move])
    if board.is_game_over():
        return {"sentences": [f"Your line ends after {last}: the game is over there."], "quiet": True,
                "plies_checked": len(line)}

    pv = engine.analyse(board)
    last_capture, b = 0, board.copy()
    for i, m in enumerate(pv):
        if b.is_capture(m):
            last_capture = i + 1
        b.push(m)
    after = board.copy()
    for m in pv[:last_capture]:
        after.push(m)
    if last_capture and abs(material(after, side) - material(board, side)) >= SWING:
        sentence = (f"Your line stops after {last}. It isn't over: {numbered(board, pv[:last_capture])}"
                    " — calculate to the last capture.")
        return {"sentences": [sentence], "quiet": False, "plies_checked": len(line)}

    goes_on = numbered(board, pv[:3])
    if board.turn == side:
        sentence = f"After {last} it is your move again: the engine continues {goes_on}."
    else:
        sentence = f"After {last} the engine answers {goes_on}."
    return {"sentences": [sentence], "quiet": True, "plies_checked": len(line)}
```

`server/check_api.py`:

```python
"""POST /api/check — only ever called after he has submitted (locked) his line."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from server.auth import current_user
from server.engine import IllegalPly, check_line
from server.ratelimit import RateLimit

router = APIRouter(prefix="/api")


class LineIn(BaseModel):
    fen: str
    line: list[str]


@router.post("/check")
def check(body: LineIn, request: Request, email: str = Depends(current_user)):
    limit: RateLimit = request.app.state.check_limit
    if not limit.hit(email):
        raise HTTPException(429, "too many checks — one per submitted line")
    engine = request.app.state.engine
    if engine is None:
        raise HTTPException(503, "engine check unavailable — your line is saved")
    try:
        return check_line(engine, body.fen, body.line)
    except IllegalPly as e:
        raise HTTPException(400, {"ply": e.index, "san": e.san})
    except ValueError:
        raise HTTPException(400, {"ply": 0, "san": "", "error": "bad position"})
```

`server/app.py` — add imports `from server import auth, check_api` and `from server.engine import Engine`; in `create_app`, replace `app.state.engine = engine` with:

```python
    if engine is None and settings.stockfish and Path(settings.stockfish).exists():
        engine = Engine(settings.stockfish)
    app.state.engine = engine
    app.state.check_limit = RateLimit(20, 60)
```

(add `from pathlib import Path`), and `app.include_router(check_api.router)` after the auth router. In `tests/server_fixtures.py` the `settings` fixture passes `stockfish=""` so the shared fixture never starts a process; `test_check_route` sets `client.app.state.engine` itself.

- [ ] **Step 4: Run tests**

Run: `python3 -m pytest tests/test_server_check.py -q`
Expected: 7 passed. If `test_game1_line_goes_on_with_bd7` fails because Stockfish prefers another move at 0.3 s, print the PV, do **not** loosen the test silently — report it.

- [ ] **Step 5: Commit**

```bash
git add server/engine.py server/check_api.py server/app.py tests/test_server_check.py tests/server_fixtures.py
git commit -m "Check a submitted line to the last capture, in sentences"
```

---

### Task 5: Voice, drills and progress routes

**Files:**
- Create: `server/voice_api.py`, `server/drills.py`, `server/progress.py`, `scripts/push_drills.py`
- Modify: `server/app.py`
- Test: `tests/test_server_voice.py` (append), `tests/test_server_data.py` (append)

**Interfaces:**
- Consumes: `voicecore` (Task 1), `current_user`, `owner_user` (Task 3), `Db.get_progress/put_progress` (Task 2).
- Produces (Plan 2 relies on these exact shapes):
  - `GET /api/voice/health` → `{"ok": true, "langs": ["de","en"]}` (logged in).
  - `POST /api/voice/transcribe?lang=en|de[&moves=a,b]` raw audio body → `{"text", "ms"}`; 400 bad lang/empty, 413 > 5 MB, 429 > 60/min/user.
  - `POST /api/voice/sample?lang=&label=&heard=&source=` → `{"saved", "stats"}`; samples under `<data>/samples/<sha256(email)[:12]>/<lang>/`.
  - `GET /api/voice/samples` → stats for this user.
  - `GET /api/drills/bundle.js` (owner) → `application/javascript`, 404 if not uploaded; `PUT /api/drills/bundle.js` (owner) raw body ≤ 5 MB.
  - `GET /api/progress` → `{"state": {...}|null, "updated": float|null}`; `PUT /api/progress {state, base}` → 200 `{"updated"}` or 409 `{"state", "updated"}`.
  - `scripts/push_drills.py --site URL --cookie VALUE` uploads `sessions/private/bundle.js`.

- [ ] **Step 1: Write the failing tests** (append)

`tests/test_server_voice.py`:

```python
import shutil
import subprocess

import pytest

from server_fixtures import FRIEND, client, login, mailer, settings  # noqa: F401,E402

HAVE = all(shutil.which(t) for t in ("whisper-cli", "ffmpeg", "say")) and \
    (voicecore.CACHE / "whisper-chess-tiny-en.bin").exists()


def test_voice_needs_login_and_checks_input(client, mailer):
    assert client.get("/api/voice/health").status_code == 401
    login(client, mailer, FRIEND)
    assert client.get("/api/voice/health").json() == {"ok": True, "langs": ["de", "en"]}
    assert client.post("/api/voice/transcribe?lang=xx", content=b"abc").status_code == 400
    assert client.post("/api/voice/transcribe?lang=en", content=b"").status_code == 400
    assert client.post("/api/voice/transcribe?lang=en", content=b"x" * (5 * 1024 * 1024 + 1)).status_code == 413
    assert client.post("/api/voice/sample?lang=en&label=hello", content=b"abc").status_code == 400


@pytest.mark.skipif(not HAVE, reason="model or whisper-cli/ffmpeg/say missing")
def test_hosted_transcribe_and_per_user_samples(client, mailer, settings, tmp_path):
    login(client, mailer, FRIEND)
    aiff = tmp_path / "m.aiff"
    subprocess.run(["say", "-v", "Samantha", "-o", str(aiff), "knight takes c3"], check=True)
    r = client.post("/api/voice/transcribe?lang=en", content=aiff.read_bytes())
    assert r.status_code == 200 and "knight" in r.json()["text"].lower()
    s = client.post("/api/voice/sample?lang=en&label=Nxc3&heard=x&source=drill", content=aiff.read_bytes())
    assert s.status_code == 200
    assert client.get("/api/voice/samples").json()["en"]["count"] == 1
    assert not (voicecore.SAMPLES / "en" / s.json()["saved"]).exists()
    assert list((settings.data_dir / "samples").glob("*/en/*.wav"))
```

`tests/test_server_data.py`:

```python
from server_fixtures import FRIEND, OWNER, client, login, mailer, settings  # noqa: F401,E402


def test_drills_are_owner_only(client, mailer):
    login(client, mailer, FRIEND)
    assert client.get("/api/drills/bundle.js").status_code == 403
    assert client.put("/api/drills/bundle.js", content=b"x").status_code == 403
    client.cookies.clear()
    login(client, mailer, OWNER)
    assert client.get("/api/drills/bundle.js").status_code == 404
    assert client.put("/api/drills/bundle.js", content=b"window.PATH_PRIVATE = {};").status_code == 200
    r = client.get("/api/drills/bundle.js")
    assert r.status_code == 200 and r.text == "window.PATH_PRIVATE = {};"
    assert r.headers["content-type"].startswith("application/javascript")
    assert r.headers["cache-control"] == "private, no-store"


def test_progress_round_trip_and_conflict(client, mailer):
    assert client.get("/api/progress").status_code == 401
    login(client, mailer, FRIEND)
    assert client.get("/api/progress").json() == {"state": None, "updated": None}
    first = client.put("/api/progress", json={"state": {"progress": {"a": 1}}, "base": None}).json()["updated"]
    stale = client.put("/api/progress", json={"state": {"progress": {"a": 2}}, "base": first - 1})
    assert stale.status_code == 409 and stale.json()["state"] == {"progress": {"a": 1}}
    ok = client.put("/api/progress", json={"state": {"progress": {"a": 2}}, "base": first})
    assert ok.status_code == 200
    assert client.get("/api/progress").json()["state"] == {"progress": {"a": 2}}
```

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m pytest tests/test_server_voice.py tests/test_server_data.py -q`
Expected: new tests FAIL with 404 on `/api/voice/health`, `/api/drills/bundle.js`, `/api/progress`.

- [ ] **Step 3: Implement**

`server/voice_api.py`:

```python
"""Hosted twin of scripts/voice_server.py: same answers, behind login, samples per user."""
from __future__ import annotations

import hashlib
import subprocess
import time

from fastapi import APIRouter, Depends, HTTPException, Request

from server import voicecore
from server.auth import current_user

router = APIRouter(prefix="/api/voice")


def _user_samples(request: Request, email: str):
    return request.app.state.settings.data_dir / "samples" / hashlib.sha256(email.encode()).hexdigest()[:12]


async def _audio(request: Request, lang: str, email: str) -> bytes:
    if lang not in voicecore.MODELS:
        raise HTTPException(400, f"lang must be one of {sorted(voicecore.MODELS)}")
    if not request.app.state.voice_limit.hit(email):
        raise HTTPException(429, "too many recordings — slow down")
    audio = await request.body()
    if not audio:
        raise HTTPException(400, "send one short recording (≤ 5 MB)")
    if len(audio) > voicecore.MAX_BODY:
        raise HTTPException(413, "send one short recording (≤ 5 MB)")
    return audio


@router.get("/health")
def health(email: str = Depends(current_user)):
    return {"ok": True, "langs": sorted(voicecore.MODELS)}


@router.post("/transcribe")
async def transcribe(request: Request, lang: str = "en", moves: str = "", email: str = Depends(current_user)):
    audio = await _audio(request, lang, email)
    start = time.time()
    try:
        text = voicecore.transcribe(audio, lang, [m for m in moves.split(",") if m] or None)
    except (subprocess.SubprocessError, OSError) as e:
        raise HTTPException(500, f"transcription failed: {e}")
    return {"text": text, "ms": round((time.time() - start) * 1000)}


@router.post("/sample")
async def sample(request: Request, lang: str = "en", label: str = "", heard: str = "", source: str = "drill",
                 email: str = Depends(current_user)):
    if not voicecore.valid_label(label):
        raise HTTPException(400, "label must be one SAN move")
    audio = await _audio(request, lang, email)
    root = _user_samples(request, email)
    try:
        row = voicecore.save_sample(audio, lang, label, heard, source, root=root)
    except (subprocess.SubprocessError, OSError) as e:
        raise HTTPException(500, f"could not save: {e}")
    return {"saved": row["file"], "stats": voicecore.sample_stats(root).get(lang)}


@router.get("/samples")
def samples(request: Request, email: str = Depends(current_user)):
    return voicecore.sample_stats(_user_samples(request, email))
```

Note: the 413 test sends > 5 MB in one body; `_audio` reads it fully first. Acceptable for one user; Plan 2 never sends more than one utterance.

`server/drills.py`:

```python
"""The private Aagaard bundle lives only on the volume and only the owner can load it."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from server.auth import owner_user

router = APIRouter(prefix="/api/drills")
MAX = 5 * 1024 * 1024


def _path(request: Request):
    return request.app.state.settings.data_dir / "private" / "bundle.js"


@router.get("/bundle.js")
def get_bundle(request: Request, email: str = Depends(owner_user)):
    path = _path(request)
    if not path.exists():
        raise HTTPException(404, "no drills uploaded — run scripts/push_drills.py")
    return Response(path.read_bytes(), media_type="application/javascript",
                    headers={"Cache-Control": "private, no-store"})


@router.put("/bundle.js")
async def put_bundle(request: Request, email: str = Depends(owner_user)):
    body = await request.body()
    if not body or len(body) > MAX:
        raise HTTPException(400, "bundle missing or over 5 MB")
    path = _path(request)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return {"bytes": len(body)}
```

`server/progress.py`:

```python
"""His PathStore state per user. Last writer wins only if it saw the latest version (409 otherwise)."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from server.auth import current_user

router = APIRouter(prefix="/api")


class ProgressIn(BaseModel):
    state: dict
    base: float | None = None


@router.get("/progress")
def get_progress(request: Request, email: str = Depends(current_user)):
    row = request.app.state.db.get_progress(email)
    return {"state": row[0], "updated": row[1]} if row else {"state": None, "updated": None}


@router.put("/progress")
def put_progress(body: ProgressIn, request: Request, email: str = Depends(current_user)):
    ok, state, updated = request.app.state.db.put_progress(email, body.state, body.base, time.time())
    if not ok:
        return JSONResponse({"state": state, "updated": updated}, status_code=409)
    return {"updated": updated}
```

`server/app.py` — import `check_api, drills, progress, voice_api`; in `create_app` add `app.state.voice_limit = RateLimit(60, 60)` and include `voice_api.router`, `drills.router`, `progress.router`. Also point the voice cache at the volume when running hosted: at the top of `create_app`:

```python
    import os
    os.environ.setdefault("ZZ_VOICE_DIR", str(settings.data_dir / "voice"))
```

— no: `voicecore.CACHE` is bound at import. Instead set `ZZ_VOICE_DIR=/data/voice` in the Dockerfile (Task 6) and leave `create_app` alone; samples already go to `settings.data_dir / "samples"` via `root`.

`scripts/push_drills.py`:

```python
#!/usr/bin/env python3
"""Upload the private Aagaard bundle to the hosted service (owner only). It never goes to Netlify or git.

    python3 scripts/push_drills.py --site https://<site> --cookie '<zz_session value from the browser>'
"""
import argparse
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent

p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
p.add_argument("--site", required=True)
p.add_argument("--cookie", required=True)
a = p.parse_args()
body = (ROOT / "sessions" / "private" / "bundle.js").read_bytes()
req = urllib.request.Request(a.site.rstrip("/") + "/api/drills/bundle.js", data=body, method="PUT",
                             headers={"Cookie": f"zz_session={a.cookie}", "Content-Type": "application/javascript"})
with urllib.request.urlopen(req, timeout=30) as r:
    print(r.status, r.read().decode())
```

- [ ] **Step 4: Run the whole server suite + the old voice tests**

Run: `python3 -m pytest tests/test_server_*.py tests/test_voice_server.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/voice_api.py server/drills.py server/progress.py server/app.py scripts/push_drills.py tests/test_server_voice.py tests/test_server_data.py
git commit -m "Serve voice, owner-only drills and progress from the hosted service"
```

---

### Task 6: Container and Railway config (built, not deployed)

**Files:**
- Create: `server/Dockerfile`, `server/railway.toml`, `server/.dockerignore`
- Test: a local uvicorn smoke run (no Docker on this Mac — Railway builds the image)

**Interfaces:**
- Produces: an image that runs `uvicorn server.app:app --host 0.0.0.0 --port $PORT`, with `whisper-cli`, `ffmpeg`, `stockfish` on PATH, `ZZ_DATA=/data`, `ZZ_VOICE_DIR=/data/voice`; health check `/api/health`. Build context = repo root (so `server/` is a package).

- [ ] **Step 1: Write the files**

`server/Dockerfile`:

```dockerfile
FROM python:3.12-slim AS whisper
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential cmake ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch v1.9.1 https://github.com/ggml-org/whisper.cpp /src \
 && cmake -S /src -B /src/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF \
 && cmake --build /src/build -j --target whisper-cli

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg stockfish \
 && rm -rf /var/lib/apt/lists/*
COPY --from=whisper /src/build/bin/whisper-cli /usr/local/bin/whisper-cli
WORKDIR /app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server/ server/
ENV ZZ_DATA=/data ZZ_VOICE_DIR=/data/voice STOCKFISH=/usr/games/stockfish WHISPER_CLI=/usr/local/bin/whisper-cli
CMD ["sh", "-c", "uvicorn server.app:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]
```

`server/railway.toml`:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "server/Dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 60
restartPolicyType = "ON_FAILURE"
```

`server/.dockerignore` is ignored when the context is the repo root; create `/.dockerignore` at the repo root instead:

```
*
!server/
server/__pycache__
```

- [ ] **Step 2: Local smoke run with the same env the container uses**

```bash
ZZ_DATA=$(mktemp -d) SESSION_SECRET=$(python3 -c "print('x'*40)") OWNER_EMAIL=owner@x.de SITE_URL=http://127.0.0.1:8099 INSECURE_COOKIE=1 \
  python3 -m uvicorn server.app:app --port 8099 &
sleep 2; curl -s 127.0.0.1:8099/api/health; curl -s -o /dev/null -w "%{http_code}\n" 127.0.0.1:8099/api/auth/me; kill %1
```

Expected: `{"ok":true}` then `401`.

- [ ] **Step 3: Grep the diff for anything private before committing**

Run: `git diff --cached --stat; git diff --cached | grep -i -E "aagaard|@gmail|@googlemail|resend_|re_[A-Za-z0-9]{10}" || echo clean`
Expected: `clean`

- [ ] **Step 4: Commit**

```bash
git add server/Dockerfile server/railway.toml .dockerignore
git commit -m "Package the service for Railway: whisper.cpp, ffmpeg, Stockfish"
```

- [ ] **Step 5: Stop — deployment needs Martin**

Report to Martin and ask before deploying. Deploy steps (run only on his go):
1. `railway init` (or link his existing project), add a volume mounted at `/data`.
2. Set env from Infisical (`keys` CLI, see `api-keys` skill): `SESSION_SECRET`, `ALLOWED_EMAILS`, `OWNER_EMAIL`, `SITE_URL` (the Netlify URL from Plan 2), `GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, `MAIL_FROM`.
3. `railway up` from the repo root; `curl https://<railway-domain>/api/health` → `{"ok":true}`.

---

## Self-review notes (done while writing)

- Spec coverage: auth (Task 3), voice (1, 5), check (4), drills (5), progress (5, SQLite instead of Postgres — spec note), Docker/Railway (6), secrets (6 step 5). Web/PWA/Netlify/push-to-site = Plan 2.
- Test fixes flagged inline (Task 3 step 4 `link`, Task 4 placeholder test) are part of the steps — apply them, do not skip.
- Names used across tasks: `create_app`, `current_user`, `owner_user`, `check_limit`, `voice_limit`, `link_email_limit`, `link_ip_limit`, `Engine`, `check_line`, `IllegalPly(index, san)`, `numbered`, `valid_label`, `save_sample(..., root=)`, `sample_stats(root)` — consistent.
