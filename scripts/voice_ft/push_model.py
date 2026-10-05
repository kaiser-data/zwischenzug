#!/usr/bin/env python3
"""Put our speech model on the hosted server (owner only), checked end to end.

    python3 scripts/voice_ft/push_model.py                        # ~/.cache/zwischenzug/voice/zz-chess-tiny.bin
    python3 scripts/voice_ft/push_model.py --model runs/tiny-b/ggml-model.bin
    python3 scripts/voice_ft/push_model.py --remove               # back to atamano's models

Signs in with a fresh one-time owner link (`railway ssh -- python -m server.login_link`), then PUTs the
file straight to Railway with its sha256. The server keeps the old model unless the new one arrives
whole and whisper-cli runs with it. (`railway ssh ... < file` does not pass stdin: it left 0 bytes.)
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import os
import subprocess
import sys
import urllib.parse
from pathlib import Path

API = os.environ.get("ZZ_API", "https://api-production-3edf.up.railway.app")
OWNER = os.environ.get("ZZ_OWNER", "martinkaiser.bln@googlemail.com")
VOICE = Path.home() / ".cache" / "zwischenzug" / "voice"


def owner_cookie() -> str:
    out = subprocess.run(["railway", "ssh", "--", "python", "-m", "server.login_link", OWNER],
                         check=True, capture_output=True, text=True, timeout=120).stdout
    link = next(w for w in out.split() if "/api/auth/verify?t=" in w)
    token = urllib.parse.parse_qs(urllib.parse.urlparse(link).query)["t"][0]
    api = urllib.parse.urlparse(API)
    conn = http.client.HTTPSConnection(api.netloc, timeout=30)
    conn.request("GET", "/api/auth/verify?t=" + urllib.parse.quote(token))
    r = conn.getresponse()
    cookie = next((v.split(";")[0] for k, v in r.getheaders() if k.lower() == "set-cookie" and v.startswith("zz_session=")), "")
    if not cookie:
        raise SystemExit(f"sign-in failed ({r.status} → {r.getheader('location')})")
    return cookie


def call(method: str, path: str, cookie: str, body: bytes = b"", headers: dict | None = None) -> tuple[int, str]:
    api = urllib.parse.urlparse(API)
    conn = http.client.HTTPSConnection(api.netloc, timeout=600)
    conn.request(method, path, body=body or None, headers={"Cookie": cookie, **(headers or {})})
    r = conn.getresponse()
    return r.status, r.read().decode()


def fetch(path: str, cookie: str) -> bytes:
    api = urllib.parse.urlparse(API)
    conn = http.client.HTTPSConnection(api.netloc, timeout=600)
    conn.request("GET", path, headers={"Cookie": cookie})
    r = conn.getresponse()
    body = r.read()
    if r.status != 200:
        raise SystemExit(f"GET {path}: {r.status} {body[:200]!r}")
    return body


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--model", default=str(VOICE / "zz-chess-tiny.bin"),
                   help="path, absolute or under ~/.cache/zwischenzug/voice/ft/")
    p.add_argument("--remove", action="store_true")
    a = p.parse_args()
    cookie = owner_cookie()
    if a.remove:
        print(*call("DELETE", "/api/voice/model", cookie))
        return
    path = Path(a.model)
    if not path.is_absolute() and not path.exists():
        path = VOICE / "ft" / path
    body = path.read_bytes()
    sha = hashlib.sha256(body).hexdigest()
    print(f"uploading {path} ({len(body) / 1e6:.1f} MB, sha256 {sha[:16]}…)")
    status, text = call("PUT", "/api/voice/model", cookie, body,
                        {"X-Sha256": sha, "Content-Type": "application/octet-stream"})
    print(status, text)
    sys.exit(0 if status == 200 else 1)


if __name__ == "__main__":
    main()
