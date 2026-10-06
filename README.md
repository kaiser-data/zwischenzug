# Zwischenzug

The **in-between move** — see it before you recapture. This week that was `22.e6` after `…Bxg2`, not `Kxg2`. The same habit as stopping at `…a6`: the first reply is not the line.

A training dossier for a **2171 FIDE** player who wants the GM title — without building another chess site.

It does four jobs:

1. **Tell you what to train today** (and cap the blitz leak)
2. **Walk a real game** on a proper board, with forms you fill *before* the engine exists
3. **Train calculation by level** — puzzles where you write the whole line, both sides, to the last capture
4. **Keep the title ladder honest** — CM 2200, then FM 2300, then IM/GM norms

Open it:

```bash
open index.html
```

Locally there is no server, no account and no cloud. Sessions live in this browser (`localStorage`). Export JSON from **Log** if you want a backup.

There is also a hosted copy for the owner and a few invited players. It is invite-only, not a public chess site. It adds a login, synced progress, voice on the phone, and engine sentences after Lock (see [Hosted](#hosted)).

---

## Screenshots

**Today** — Saturday protocol, blitz cap, the week’s slow-work checklist.

![Today tab](docs/screenshots/today.png)

**Board** — Lichess-green board, CBurnett Staunton pieces, last-move tint, legal-move dots. The game is [JB2bQpWt](https://lichess.org/JB2bQpWt) (15+10, you White). Eval stays hidden until you lock the form. On a desktop the board grows with the window (520–980 px).

![Board session](docs/screenshots/board.png)

**Week** — ten-hour plan and the 12-week blocks.

![Week tab](docs/screenshots/week.png)

---

## Why this exists

[Kaiser, Martin, Dr.](https://ratings.fide.com/profile/4689640) (GER, FIDE 4689640) is **2171 standard**, untitled. Lichess [`emperor555`](https://lichess.org/@/emperor555) has **12,241 blitz** games (peak 2319 in 2020, now ~2085) and **zero classical**.

GM is **2500 + three GM norms** ([FIDE Title Regulations B.01](https://handbook.fide.com/chapter/B012024)). That is +329 rating and a tournament life. This app does not grant that. It stops spending the week on 3-minute games and puts the hours on calculation, endgames, and slow play.

The next stamp is **CM 2200**, then **FM 2300**.

## Locked rules

| | |
|---|---|
| Hours | ~10 / week (8–12 band) |
| Blitz | 0 preferred, **cap 3**, never before calculation |
| Phase | Train first. Crush (opens, norms) later |
| Engine | After you have written your own line. Never in the browser |

## What you actually train with

The dossier does **not** replace these. It opens them.

| Job | Tool |
|---|---|
| Calculation book | Aagaard, *Grandmaster Preparation: Calculation* |
| Rated tactics | [ChessTempo mixed, untimed](https://chesstempo.com/chess-tactics/) |
| Endgames | de la Villa *100 Endgames You Must Know* / Chessable + [Lichess practice](https://lichess.org/practice) |
| Slow games | Lichess **15+10 or 30+20** only |
| Analysis | [Lichess analysis](https://lichess.org/analysis) — notes first |
| Openings | Chessable, tiny repertoire, no tourism |

## Tabs

| Tab | What |
|---|---|
| **Today** | Weekday protocol + blitz counter |
| **Board** | Slow games as sessions (diagnose → trap → hunt), and today's training by level |
| **Drills** | Aagaard chapter positions to solve on the board (private, see below) |
| **Week** | 10-hour split and 12-week blocks |
| **Ladder** | CM / FM / IM / GM from FIDE B.01 |
| **Stack** | The existing software, with how to use it here |
| **Log** | Sessions and slow games |
| **Crush** | Tournament volume — parked until the leak is closed |

## Board session (a slow game)

You were worse after **19…Qa5**. You played **20.Red1**. He took on **a2** and the queen died to **Ra1–Ra3**.

The session forces the honest order:

1. **Diagnose** the worse position (candidates, a4 vs Red1)
2. **Trap** — play `…Qxa2` then `Ra1` on the board
3. **Hunt** — `Ra3`, then tag **calculation**, not “clean”

Each slow game is one JSON file in `sessions/`. The board is generic.

## Training by level

Each day a few positions near your level, from **3353 Lichess puzzles** (CC0) rated 700–2999. Only lines of at least five plies count, so there is something to calculate. There are no one-movers and no short mates.

- Write the whole line, both sides, to the last capture, then **Lock**. Stopping one ply early is the leak this trains.
- Right on the first try: level **+40**. A miss on the way: **−40**.
- **3, 5 or 10** a day; **Easier · At level · Harder** picks around level −200 / 0 / +200.
- A missed position comes back as **Again** two days later, until it is right on the first try. Repeats do not move the level.

## Voice

Say moves instead of typing them: hold 🎤 (or `v`), or turn on 🎧 for hands-free listening. English or German (`Springer schlägt c3`), a square alone when only one piece can go there, and commands like *back / zurück*, *done / fertig* (= Lock), *next / weiter*. Unsure sounds are ignored, never forced into a move.

On the Mac, run `python3 scripts/voice_server.py` (whisper.cpp on 127.0.0.1:8766). The hosted copy runs the same model on the server. The model is a fine-tuned `openai/whisper-tiny` (MIT), trained on synthetic voices plus the owner's own recordings from **Board → Train the voice model**. Without it in the cache, the server falls back to [atamano/whisper-chess-tiny](https://huggingface.co/atamano/whisper-chess-tiny) (CC BY-NC-SA 4.0), downloaded on first start. Models and recordings stay in `~/.cache/zwischenzug/voice/` and are never committed. The pipeline lives in `scripts/voice_ft/`.

## Hosted

`hosted.js`, `web/` and `server/` act only on https; `file://` keeps working without them.

- **Site:** Netlify, built by `scripts/build_site.py`. The build refuses to ship any private drill position.
- **API:** FastAPI on Railway (`server/`). It provides invite-only login (one-time links, signed cookie), progress sync, voice, the private drill bundle (owner only), and `/api/check` — after Lock only, answering in sentences, never a raw eval.

## Private material

The repo is public. Book positions, solutions and text (`books/`, `sessions/private/`) are gitignored and never go into tracked files or onto Netlify. Locally they load from `sessions/private/bundle.js`; hosted, only the owner gets them from the API.

## Next work

Claude (or any agent): read **[`CLAUDE.md`](CLAUDE.md)** first, then [`HANDOFF.md`](HANDOFF.md). The gap is calculation depth (he stopped at `…a6`), not more UI. When a new slow-game URL arrives, author `sessions/<id>.json` and bundle — do not edit `session-board.js` for that game.

## Files

```
index.html                  the app
session-board.js            generic board (loads PATH_SESSIONS), voice, voice drill
training.js                 training by level
store.js                    progress in localStorage (+ sync when hosted)
sessions/<lichessId>.json   slow games (source of truth)
sessions/bundle.js          packed for file:// — run scripts/bundle_sessions.py
sessions/puzzles.js         Lichess puzzles — run scripts/build_puzzles.py
chess.min.js                legal moves
pieces.js                   CBurnett SVGs
hosted.js, web/             hosted page only
server/                     hosted API (FastAPI)
scripts/author_session.py   Stockfish offline → SAN tree / stub JSON
scripts/bundle_sessions.py  json → bundle.js
scripts/build_puzzles.py    Lichess puzzle DB → puzzles.js
scripts/build_site.py       dist/ for Netlify, with the private-material guard
scripts/voice_server.py     local speech server for 🎤 / 🎧
scripts/voice_ft/           speech model: dataset, training on Modal, eval, upload
tests/                      pytest + Playwright
```

Add a new slow game: write `sessions/<lichessId>.json`, then `python3 scripts/bundle_sessions.py`. Open `index.html?session=<id>#session`. No edit to `session-board.js`.

Tests: `python3 -m pytest`.

## Attribution

Title thresholds: FIDE Handbook B.01 (2024). Player card: ratings.fide.com/4689640. Lichess stats: emperor555, retrieved 2026-09-12. Puzzles: [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0). Pieces: [CBurnett](https://github.com/lichess-org/lila/tree/master/public/piece/cburnett) (public domain); board colours Lichess green (`#eeeed2` / `#769656`). Move generation: [chess.js 0.10.3](https://github.com/jhlywa/chess.js) (MIT). Speech: [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and `openai/whisper-tiny` (MIT). Methods: Aagaard *Calculation*, de la Villa *100 Endgames*, Kuljasevic workbook vol. 3. Details in [`REFERENCES.md`](REFERENCES.md).

This is not a FIDE application.
