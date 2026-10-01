# Zwischenzug on the phone — hosted PWA, voice backend, engine check, invite-only login

Date: 2026-10-01 · Approach A (one Railway service, Netlify static) · approved by Martin ("go")

## Goal

Martin trains on his phone, mouse-free and keyboard-free: he analyses a step freely on the board
by voice, **submits his line**, and only then hears where it stopped too early. A few invited people
can use the same app with the public games. `file://` on the Mac keeps working exactly as today.

The leak stays the product: the engine never says "a4 is best". It reads his submitted line to the
last capture and names the ply where he stopped ("your line ends on …Bxf5 — but …Qxf5 takes back").

## Overview

```
phone / Mac browser ── https://<site>.netlify.app ──┬─ static: index.html, session-board.js, public sessions,
                                                    │          manifest, service worker   (Netlify)
                                                    └─ /api/*  → rewrite (same origin) → Railway service
Railway service (Docker, Python FastAPI)
  /api/auth/*      magic link (Resend) + Google ID token, email allowlist, session cookie
  /api/voice/*     today's voice_server.py logic (whisper.cpp + chess models, grammar pass, samples)
  /api/check       Stockfish on a submitted line → teaching sentences, never an eval number
  /api/drills      private Aagaard bundle — owner only
  /api/progress    PathStore state per user (Postgres)
Railway Postgres   users, login tokens, progress
Railway volume     models, samples, private drill bundle
```

`/api` is proxied through Netlify (`_redirects`: `/api/*  https://<railway>/api/:splat  200`) so the
session cookie is **first-party** — Safari/iOS blocks third-party cookies, a cross-site cookie would
silently log him out on the iPhone.

## Units

### 1. `server/` — the Railway service (new, public code, no secrets, no book content)

- `app.py` FastAPI app, mounts the routers, CORS off (same origin via proxy), health at `/api/health`.
- `auth.py`
  - Allowlist: env `ALLOWED_EMAILS` (comma-separated, lowercased), `OWNER_EMAIL`. Never in the repo.
  - Magic link: `POST /api/auth/request {email}` → if allowlisted, store a random token (sha256 in DB,
    15 min, single use) and mail `https://<site>/api/auth/verify?t=…` through Resend. The reply is the
    same whether or not the email is allowed (no list probing). Rate limit 3 requests / email / 15 min.
  - `GET /api/auth/verify?t=` → consume token, set cookie `zz_session` (signed, HttpOnly, Secure,
    SameSite=Lax, 30 days), redirect to `/`. First successful login creates the user row = "activation".
  - Google: page uses Google Identity Services button → `POST /api/auth/google {credential}` → verify
    the ID token (google-auth: audience = our client id, `email_verified`), same allowlist, same cookie.
  - `GET /api/auth/me` → `{email, owner}` or 401. `POST /api/auth/logout`.
  - Every other router depends on `current_user`; owner-only routes on `owner`.
- `voice.py` — moves `transcribe / grammar / spoken / samples` out of `scripts/voice_server.py` into
  `server/voicecore.py`, imported by both the local stdlib server (unchanged CLI, unchanged port 8766)
  and the Railway router. Endpoints keep their shapes under `/api/voice/` (`/transcribe`, `/sample`,
  `/samples`, `/health`). Samples go to the volume per user (`samples/<user-hash>/<lang>/`).
  Limits: body 5 MB, 60 requests/min/user.
- `engine.py` — `POST /api/check {fen, line: [SAN…], step_id?}`, logged-in users only.
  1. Replay the line with python-chess; an illegal ply → 400 with the ply index.
  2. Stockfish (UCI subprocess, one pooled process, `movetime` 300 ms per probe, line ≤ 30 plies,
     20 checks/min/user) on each position of the line.
  3. Two findings, each a sentence built from moves, never a number:
     - **Stopped early** — the final position is not quiet: the side to move has a capture or check
       that the engine prefers and that changes the material count by ≥ 2 pawns in its main line.
       "Your line stops after 15…Bxf5. It isn't over: 16.Qxf5 takes back — calculate to the last capture."
     - **First turn that drops** — the first ply of *his* side where the engine's best line beats his
       move by ≥ 1.5 pawns (threshold, not shown). "After 20.a4 a6 your line stops — but White is not
       done: 21.Bd7 Bxg2 22.e6!" (the engine's move at that ply + its next 2 plies, SAN).
  4. Reply `{sentences: [...], quiet: bool, plies_checked: n}`. Authored keys of a session stay the
     first thing he reads; the check is shown under them.
- `drills.py` — `GET /api/drills/bundle.js` (owner only) streams the private bundle from the volume;
  `PUT /api/drills/bundle.js` (owner only) replaces it. Uploaded from the Mac by `scripts/push_drills.py`.
- `progress.py` — `GET /api/progress` / `PUT /api/progress` the whole PathStore state as jsonb, with
  `updated_at`; a PUT carrying an older `base_updated_at` than the row returns 409 + server state.
- `Dockerfile` — python:3.12-slim + ffmpeg + stockfish (apt) + whisper.cpp built from source
  (pinned tag); models downloaded at first start onto the volume (CC BY-NC-SA, personal use, never in
  the image or repo). `requirements.txt`: fastapi, uvicorn, python-chess, google-auth, itsdangerous,
  psycopg[binary], httpx.

### 2. Web app changes (`index.html`, `session-board.js`, `store.js`) — still one code path

- **Mode detection:** `window.PATH_HOSTED = location.protocol === "https:"`. On `file://` nothing
  changes: local voice server at 127.0.0.1:8766, localStorage only, private bundle from disk, no login.
- **Hosted:** `PATH_VOICE_URL = "/api/voice"`; login screen when `/api/auth/me` is 401 (email field +
  Google button); owner gets the private bundle via `<script src="/api/drills/bundle.js">` injected
  after login; others never request it.
- **Store:** `PathStore.remote()` — backend that reads `/api/progress` (falls back to the localStorage
  copy offline) and writes both localStorage and the server; on 409 it merges per step (`progress`
  keys: newer `updated` wins) and retries once.
- **Submit line = Lock.** "submit / abgeben / fertig / done" locks the step as today; in hosted mode
  Lock then calls `/api/check` with the step's FEN + his written line and shows the sentences under
  the key. Voice-only: the sentences are also spoken (`speechSynthesis`, EN/DE from the voice toggle).
- **Voice-only run:** everything already works by voice (moves, back, next, redo, flip, lock). Added:
  "submit/abgeben" alias, "read/vorlesen" repeats the step's question + check aloud, Screen Wake Lock
  while 🎧 is on. Text questions: phone keyboard dictation (the chess model hears moves only).
- **Mobile layout:** one column under 700 px — board full width (square, max 100vw − 16 px), step
  question, answer box, then keys; the step list becomes a horizontal strip; 🎤/🎧 as a fixed bottom
  bar with 56 px targets; no hover-only controls. Desktop layout unchanged.
- **iOS:** MediaRecorder gives mp4/aac — server ffmpeg already normalises; hands-free WAV path unchanged.

### 3. PWA + deploy (`scripts/build_site.py`, Netlify)

- `build_site.py` copies the public files into `dist/` (gitignored): `index.html`, `session.html`,
  JS, `sessions/bundle.js`, `pieces.js`, plus `manifest.webmanifest`, `sw.js`, icons, `_redirects`,
  `_headers` (CSP: self + accounts.google.com). It **refuses** to build if anything under
  `sessions/private/` or `books/` would end up in `dist/` (checked by path and by grepping for
  `aagaard` in the bundled sessions).
- `sw.js`: cache-first for the static shell + public sessions (offline board works); never caches
  `/api/*`; version string from the build so a deploy replaces the cache.
- Deploy: `netlify deploy --prod --dir dist` from the Mac (not a git-linked build, so the repo layout
  is irrelevant to Netlify). Railway: `railway up` from `server/`, env vars set in Railway from Infisical.

## Secrets (Infisical → Railway env, never in repo or chat)

`ALLOWED_EMAILS`, `OWNER_EMAIL`, `SESSION_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, `GOOGLE_CLIENT_ID`,
`DATABASE_URL` (Railway Postgres). Martin supplies: Resend account + verified sender domain, Google
OAuth client (authorised origin = the Netlify URL).

## Error handling

- Railway down → hosted page still opens from the service worker; 🎤 greyed with "voice server
  unreachable", Lock works without the check ("engine check unavailable — your line is saved").
- Session expired mid-training → the next API call returns 401 → a small "sign in again" bar, the
  written line stays in the store (saved locally first).
- Engine probe timeout → that finding is dropped, the other is still returned.
- Mail send failure → the page says "could not send — try Google or again later"; logged server side.

## Testing

- `tests/test_server_auth.py` (FastAPI TestClient, fake mailer, fake Google verifier): allowlisted vs
  not (same reply), token single use + expiry, cookie set, owner vs invited on `/api/drills`.
- `tests/test_server_check.py` (real Stockfish): game 2 `15.Qg3 Nxf5 gxf5 Bxf5 Bxf5` → "stops early",
  names `…Qxf5`; game 1 `20.a4 a6` position → names `21.Bd7`; a quiet line → `quiet: true`; illegal ply → 400.
- `tests/test_voice_server.py` keeps passing against the refactored `voicecore` (local server).
- `tests/test_build_site.py`: `dist/` contains no private path and no `aagaard` string.
- Browser tests (existing harness): 390×844 viewport layout, hosted mode with a mocked `/api`,
  submit-by-voice → check sentences rendered.
- Live check after deploy: login by mail and by Google on the iPhone, voice move round trip time,
  one submitted line checked.

## Out of scope (this spec)

Open registration, payments, Stockfish in the browser, eval numbers in the UI, voice model retraining
(HANDOFF §3), Voice v2 matcher (separate, still open), merging `hosted/dossier-split` into `main`.

## Build order

1. `voicecore` refactor + `server/` with voice + health, Dockerfile, run in Docker locally (nothing
   deployed before auth exists). 2. Auth + allowlist + Postgres, first Railway deploy. 3. `/api/check` + tests on games 1–2.
4. Web: hosted mode, login, remote store, submit→check, spoken read-back. 5. Mobile layout + PWA +
   `build_site.py` + Netlify. 6. Drill upload, live phone test, HANDOFF.
