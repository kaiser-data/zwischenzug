#!/usr/bin/env python3
"""Upload the private Aagaard bundle to the hosted service (owner only). It never goes to Netlify or git.

    python3 scripts/push_drills.py --site https://<site> --cookie '<zz_session cookie value>'
"""
import argparse
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--site", required=True)
    p.add_argument("--cookie", required=True)
    a = p.parse_args()
    body = (ROOT / "sessions" / "private" / "bundle.js").read_bytes()
    req = urllib.request.Request(a.site.rstrip("/") + "/api/drills/bundle.js", data=body, method="PUT",
                                 headers={"Cookie": f"zz_session={a.cookie}",
                                          "Content-Type": "application/javascript"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(r.status, r.read().decode())


if __name__ == "__main__":
    main()
