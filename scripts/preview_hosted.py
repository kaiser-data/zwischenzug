#!/usr/bin/env python3
"""Try the hosted site on this Mac before deploying: the real server, the real sign-in, a guest.

    python3 scripts/preview_hosted.py            # builds dist/, serves http://localhost:8790
    python3 scripts/preview_hosted.py --fresh    # forget the preview's progress and sign-ins first

Prints one-time sign-in links: the owner, and an invited guest (default: nico) who sees only
Training and the games written for that player in sessions/players.js. Open the guest link in a
private window (or another browser) to see it as they will. Voice uses the Mac's cached models,
the engine check uses the local Stockfish. Nothing touches Railway or Cloudflare; the data lives
in ~/.cache/zwischenzug/preview/.
"""
import argparse
import hashlib
import pathlib
import secrets
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
DATA = pathlib.Path.home() / ".cache" / "zwischenzug" / "preview"
PORT = 8790
OWNER = "martinkaiser.bln@googlemail.com"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--player", default="nico", help="the player id in sessions/players.js to preview")
    p.add_argument("--fresh", action="store_true", help="start with no progress and no sign-ins")
    a = p.parse_args()

    import uvicorn
    from fastapi.responses import Response
    from fastapi.staticfiles import StaticFiles

    from server.app import create_app
    from server.auth import INVITE_TTL, LINK_TTL, new_link
    from server.settings import Settings

    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_site.py")], check=True, cwd=ROOT,
                   stdout=subprocess.DEVNULL)
    if a.fresh and DATA.exists():
        shutil.rmtree(DATA)
    (DATA / "private").mkdir(parents=True, exist_ok=True)
    private = ROOT / "sessions" / "private" / "bundle.js"
    if private.exists():
        shutil.copy2(private, DATA / "private" / "bundle.js")
    secret_file = DATA / "secret"
    if not secret_file.exists():
        secret_file.write_text(secrets.token_urlsafe(48))

    guest = f"{a.player}@preview.local"
    site = f"http://localhost:{PORT}"
    settings = Settings(data_dir=DATA, allowed=frozenset(), owner=OWNER, secret=secret_file.read_text(),
                        site_url=site, stockfish=shutil.which("stockfish") or "/opt/homebrew/bin/stockfish",
                        secure_cookie=False)
    app = create_app(settings)
    db = app.state.db
    db.add_invite(guest, OWNER)

    # The preview guest's address is not in the public players.js; add its hash only here.
    players = (ROOT / "dist" / "sessions" / "players.js").read_text()
    digest = hashlib.sha256(guest.encode()).hexdigest()

    @app.get("/sessions/players.js")
    def players_js():
        js = players + f'\nif (window.PATH_PLAYERS["{a.player}"]) window.PATH_PLAYERS["{a.player}"].emails.push("{digest}");\n'
        return Response(js, media_type="text/javascript", headers={"Cache-Control": "no-store"})

    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="site")

    print(f"\nZwischenzug preview on {site}  (Ctrl-C stops it)\n", flush=True)
    print(f"  Guest ({a.player}) — open in a private window:\n  {new_link(db, site, guest, INVITE_TTL)}\n")
    print(f"  Owner (you), 15 minutes:\n  {new_link(db, site, OWNER, LINK_TTL)}\n", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
