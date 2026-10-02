# Claude — proceed from here

You are continuing **Zwischenzug** (`kaiser-data/zwischenzug`, **public repo**).
Do **not** restart. Do **not** rename. Hosted for him + invitees since 2026-10-01 (HANDOFF §3 "Hosted") — still not a public chess site.

**Read `HANDOFF.md` first** — full state, schema, workflows, verification (2026-09-13).

Martin (FIDE 2171, Lichess `emperor555`) trains calculation here. When he pastes a Lichess URL, that slow game becomes the next session (HANDOFF §5A). Between games he solves Aagaard chapter drills on the Board / Drills tabs (HANDOFF §5B).

Local: `/Users/marty/grok_projects/chess_path_to` · Open: `open index.html`

---

## The leak (keep it in every feature)

He calculates, then **stops one ply early**: at the reply he dislikes (game 1: `20.a4 …a6`, missed `21.Bd7 Bxg2 22.e6!`) or at the recapture he likes (game 2: `15.Qg3 Nxf5 gxf5 Bxf5 Bxf5`, missed `…Qxf5`). Training that says "a4 is best" is surface. Training that makes him write the line to the last capture is the product.

His words — use them, don't replace them:
- "Red1 is pseudo-activity; Black can put a rook on the file."
- "I didn't play a4 because of a6."
- "a4 is also complicated — you need Bd7, Bxg2."
- "I was seeing it but thought I can recapture and win a piece."

## Locked constraints

- Hard blitz cap 0–3/day. Never train blitz; never author a blitz game as a session.
- Train first, crush later. No tournament calendar.
- Compose Lichess / Chessable / ChessTempo / Aagaard. No puzzle engine.
- **No Stockfish in the browser.** Author offline (`/opt/homebrew/bin/stockfish`). The hosted server's `/api/check` runs only after Lock and answers in sentences. The Lichess analysis link opens only after Lock.
- `file://` must work. Sessions are bundled JS, not `fetch()`. Hosted extras live in `hosted.js` / `web/` / `server/` and act only on https.
- **Public repo:** `books/` and `sessions/private/` are gitignored. Book positions, solutions, diagrams and text never go into tracked files or onto Netlify (`build_site.py` refuses). Check the diff before every commit.
- Keys are teaching sentences, never raw eval.
- `session-board.js` stays generic: a new game = new JSON + `python3 scripts/bundle_sessions.py`. Verify every line with python-chess.
- Commit only when he says **go** / **push**.

## Next

0. Voice: he tries the faster voice + "no"/"yes" on the phone; fine-tune GPU run on Modal waits for his OK (HANDOFF §8 000/000a, §3 "Voice v2 — as built").
1. He solves Aagaard 6.1–6.6 on the Board / Drills tabs; read his Aagaard log results when he reports.
2. New Lichess URL → HANDOFF §5A.
3. `scripts/author_session.py --json` → draft session skeleton (keys still by hand).
4. Next Aagaard chapter only when he asks → HANDOFF §5B.

## Not yet

Crush / calendar · new piece set, README restyle · Puzzle Storm / ChessTempo clone · Stockfish WASM · old 10+0 games as sessions.
