#!/usr/bin/env python3
"""Build the hosted site into dist/ for Netlify: public files only, /api proxied to Railway.

    python3 scripts/build_site.py [--api https://api-production-3edf.up.railway.app]
    netlify deploy --prod --dir dist

The private Aagaard bundle is never copied: the hosted page loads it from /api/drills/bundle.js,
which only the owner's session can open. The build refuses if anything private reaches dist/.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
API = "https://api-production-3edf.up.railway.app"
# Public by design (it is in every Google sign-in page); set GOOGLE_CLIENT_ID or pass --google-client-id.
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
FILES = ["chess.min.js", "store.js", "pieces.js", "session-board.js", "hosted.js", "session.html",
         "sessions/bundle.js"]
WEB = ["manifest.webmanifest", "icon.svg"]
PRIVATE = ROOT / "sessions" / "private" / "bundle.js"


def page() -> str:
    html = (ROOT / "index.html").read_text()
    private = '<script src="sessions/private/bundle.js"></script>'
    board = '<script src="session-board.js"></script>'
    assert private in html and board in html, "index.html script tags changed — update build_site.py"
    # Owner only: for anyone else this request answers 401/403 and the page simply has no drills.
    html = html.replace(private, '<script src="config.js"></script>\n<script src="hosted.js"></script>\n'
                                 '<script src="/api/drills/bundle.js"></script>')
    head = ('<link rel="manifest" href="/manifest.webmanifest">\n<meta name="theme-color" content="#1d1b16">\n'
            '<link rel="icon" href="/icon.svg">\n<link rel="apple-touch-icon" href="/icon-192.png">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n</head>')
    html = html.replace("</head>", head, 1)
    sw = "<script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');</script>\n</body>"
    return html.replace("</body>", sw, 1)


def private_marks() -> set[str]:
    """Strings that only the private drills contain: their ids and every FEN board in them."""
    if not PRIVATE.exists():
        return set()
    text = PRIVATE.read_text()
    marks = set(re.findall(r'"id":\s*"([^"]+)"', text))
    marks |= {m.split()[0] for m in re.findall(r'"(?:startFen|fen)":\s*"([^"]+)"', text)}
    return marks


def check(dist: pathlib.Path) -> None:
    marks = private_marks()
    public = (ROOT / "sessions" / "bundle.js").read_text()
    marks = {m for m in marks if m not in public}  # a game position may also open a drill; only private-only marks count
    for f in dist.rglob("*"):
        rel = str(f.relative_to(dist))
        if "private" in rel or rel.startswith("books"):
            sys.exit(f"refusing: private path in dist: {rel}")
        if f.is_file() and f.suffix in (".js", ".html", ".json", ".webmanifest"):
            text = f.read_text(errors="ignore")
            hit = next((m for m in marks if m in text), None)
            if hit:
                sys.exit(f"refusing: private drill content ({hit[:24]}…) found in {rel}")
    print(f"checked dist/ against {len(marks)} private marks: clean")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--api", default=API)
    p.add_argument("--google-client-id", default=GOOGLE_CLIENT_ID)
    a = p.parse_args()
    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "sessions").mkdir(parents=True)
    for f in FILES:
        shutil.copy2(ROOT / f, DIST / f)
    for f in WEB:
        shutil.copy2(ROOT / "web" / f, DIST / f)
    for size in (192, 512):
        subprocess.run(["sips", "-s", "format", "png", "-z", str(size), str(size), str(ROOT / "web" / "icon.svg"),
                        "--out", str(DIST / f"icon-{size}.png")], check=True, capture_output=True)
    (DIST / "index.html").write_text(page())
    (DIST / "config.js").write_text(f"window.PATH_GOOGLE_CLIENT_ID = {json.dumps(a.google_client_id)};\n")
    version = hashlib.sha256(b"".join((DIST / f).read_bytes() for f in FILES + ["index.html", "config.js"])).hexdigest()[:12]
    (DIST / "sw.js").write_text((ROOT / "web" / "sw.js").read_text().replace("__BUILD__", version))
    (DIST / "_redirects").write_text(f"/api/*  {a.api.rstrip('/')}/api/:splat  200\n")
    (DIST / "_headers").write_text("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n"
                                   "  Permissions-Policy: microphone=(self)\n/sw.js\n  Cache-Control: no-cache\n")
    check(DIST)
    print(f"dist/ built ({version}), /api → {a.api}, Google sign-in {'on' if a.google_client_id else 'off'}")


if __name__ == "__main__":
    main()
