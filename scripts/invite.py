#!/usr/bin/env python3
"""Invite people to the hosted Zwischenzug and get a page of QR codes to share. Run on the Mac:

    python3 scripts/invite.py anna@example.com bert@example.com      # invite, 7 days each
    python3 scripts/invite.py --me                                   # a fresh link for the owner (15 min)

Each person gets their own one-time link (the server keeps only a hash). The page lands in
invites/ (gitignored: the links are keys) and opens in the browser. Scan from the screen, or
tap "Copy link" / "Share" to send it by WhatsApp or iMessage.
"""
import datetime
import html
import io
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "invites"
OWNER = "martinkaiser.bln@googlemail.com"


def link_for(email: str, invite: bool) -> str:
    cmd = ["railway", "ssh", "--", "python", "-m", "server.login_link"] + (["--invite"] if invite else []) + [email]
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=120)
    lines = [ln.strip() for ln in out.stdout.splitlines() if ln.strip().startswith("https://")]
    if out.returncode or not lines:
        raise SystemExit(f"could not make a link for {email}:\n{out.stdout}\n{out.stderr}")
    return lines[-1]


def qr_svg(text: str) -> str:
    import qrcode
    import qrcode.image.svg
    buf = io.BytesIO()
    qrcode.make(text, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2).save(buf)
    return buf.getvalue().decode().split("?>", 1)[-1]


def page(rows: list[tuple[str, str, str]]) -> str:
    cards = "".join(
        f'<section><h2>{html.escape(email)}</h2><p>{html.escape(note)}</p><div class="qr">{qr_svg(link)}</div>'
        f'<p class="link">{html.escape(link)}</p>'
        f'<button data-link="{html.escape(link)}" class="copy">Copy link</button> '
        f'<button data-link="{html.escape(link)}" class="share">Share</button></section>'
        for email, link, note in rows)
    made = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Zwischenzug invites</title>
<style>
:root {{ --paper:#f3ead8; --ink:#1c1712; --cover:#3f1a24; --muted:#6b6258; }}
body {{ margin:0; background:var(--cover); color:var(--ink); font:16px/1.45 "Avenir Next",system-ui,sans-serif; }}
main {{ max-width:900px; margin:0 auto; padding:24px 16px; display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px; }}
header {{ max-width:900px; margin:0 auto; padding:24px 16px 0; color:var(--paper); }}
header h1 {{ font:500 26px/1.2 "Iowan Old Style",Georgia,serif; margin:0 0 6px; }}
section {{ background:var(--paper); border-radius:10px; padding:16px; break-inside:avoid; }}
h2 {{ font:600 15px/1.3 inherit; margin:0 0 2px; word-break:break-all; }}
p {{ margin:0 0 8px; color:var(--muted); font-size:13px; }}
.qr svg {{ width:100%; height:auto; display:block; background:#fff; }}
.link {{ word-break:break-all; font-size:11px; }}
button {{ font:inherit; padding:8px 12px; border-radius:8px; border:1px solid #c9c2b2; background:#fff; cursor:pointer; }}
@media print {{ body {{ background:#fff; }} header {{ color:var(--ink); }} button {{ display:none; }} }}
</style></head><body>
<header><h1>Zwischenzug invites</h1><p>Made {made}. Each code works once for that person. Keep this page private.</p></header>
<main>{cards}</main>
<script>
document.querySelectorAll(".copy").forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.link).then(() => b.textContent = "Copied"));
document.querySelectorAll(".share").forEach(b => b.onclick = () => navigator.share
  ? navigator.share({{ title: "Zwischenzug", text: "Your Zwischenzug sign-in link (works once): " + b.dataset.link }})
  : navigator.clipboard.writeText(b.dataset.link).then(() => b.textContent = "Copied"));
</script></body></html>"""


def main() -> None:
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    rows = []
    for a in args:
        if a == "--me":
            rows.append((OWNER, link_for(OWNER, invite=False), "Owner sign-in · valid 15 minutes"))
        else:
            rows.append((a.lower(), link_for(a, invite=True), "Invite · valid 7 days"))
    OUT.mkdir(exist_ok=True)
    path = OUT / f"invites-{datetime.datetime.now():%Y%m%d-%H%M%S}.html"
    path.write_text(page(rows))
    subprocess.run(["open", str(path)])
    print(path)


if __name__ == "__main__":
    main()
