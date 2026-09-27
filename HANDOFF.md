# Handoff — Zwischenzug

Date: 2026-09-21
Repo: https://github.com/kaiser-data/zwischenzug (**public**)
Workspace: `/Users/marty/grok_projects/chess_path_to`
Open: `open index.html` → **Board** or **Drills** tab

This replaces the 2026-09-13 handoff. The dossier exists and trains calculation. Do not restart, rename, or build a chess site.

---

## 1. State right now

| | |
|---|---|
| Last pushed commit | branch `hosted/dossier-split`: game 3 + board navigation tasks 1–4. `main` unchanged at `f6c4a77` |
| **Board navigation** | Done 2026-09-21: clickable steps, progress across reloads, Redo, board orientation. Spec + plan in `docs/superpowers/` |
| Sessions in the repo | `JB2bQpWt` (game 1, won), `XbhWoWMi` (game 2, lost), `qVxKt9G0` (game 3, simul vs GM Rabiega 2026-09-19, drawn) — all three `category: leak`; `6yfxgu80` (game 4, classical OTB 2026-09-27 in Oweide vs Torsten Hannebauer, won in 20, `category: clean`) |
| **Game categories** | Added 2026-09-27: every game session carries `category` (§4); the category decides the follow-up (§5A step 3b). Shown above the board and in the picker's optgroups ("Games · Clean") |
| Private, gitignored | `books/` (Aagaard PDF, page renders, `ch6/check.html`, `ch6/build_sessions.py`), `sessions/private/` (24 drills `aagaard-6-01` … `24` + `bundle.js`) |
| Player's progress | qVxKt9G0 built 2026-09-21, not yet played on the board. Simul date/time: 19.09.2026, start time is a placeholder (19:00) until he confirms. Played through XbhWoWMi. Aagaard ch.6 drills built; he confirmed all 24 transcribed positions match the book. He has not logged any exercise yet. |

Commit rule: only when he says **go** or **push**. Before committing, grep the diff for book content (see §6).

---

## 2. Who and the leak

Martin Kaiser, Dr., GER, FIDE 4689640, standard 2171, Lichess `emperor555`. Hard blitz cap 0–3/day, never trained. ~10 h/week.

**The leak:** he calculates, then stops one ply early. Both games show it from opposite sides:

| Game | What he saw | Where he stopped | Missed |
|---|---|---|---|
| [JB2bQpWt](https://lichess.org/JB2bQpWt) 15+10, 1–0 | `20.a4` | at `…a6`, the reply he **disliked** | `21.Bd7 Bxg2 22.e6!` (the zwischenzug) |
| [XbhWoWMi](https://lichess.org/XbhWoWMi) 15+10, 0–1 | `15.Qg3 Nxf5 gxf5 Bxf5 Bxf5` | at his own recapture, the one he **liked** | ply 5 `…Qxf5` (d7 queen through empty e6) |
| [qVxKt9G0](https://lichess.org/qVxKt9G0) simul 19.09.26, ½–½ | `25…Ra7 26.Re8+ Kf7` | at the reply that **looked fine** (`…Kf7`) | `27.Rc8!` and c6 falls |

Game 2 also: clock 12:05 → 3:26 over moves 22–26 in a level position, then `32.Kg2?? Qg5+` with 1:42 left (Kh1/Kh2/Kf1 draw). Opening was fine (White better through move 13).

His words — keep them in the UI, do not replace them with eval:
- "Red1 is pseudo-activity; Black can put a rook on the file."
- "I didn't play a4 because of a6."
- "a4 is also complicated — you need Bd7, Bxg2."
- Game 2: "I was seeing it but thought I can recapture and win a piece."
- Game 3 (his answer, 2026-09-21): at 25…Ra7 he saw 26.Re8+, held it harmless, and stopped at …Kf7.

Game 3 context (club report, `sc-weisse-dame.de`): Jubiläumssimultan for 75 years SC Weisse Dame, GM Robert Rabiega (DWZ 2421) **17:2 (+15 =4 −0)** over nineteen boards, ~4.5 hours, no clock but move when he arrives, everyone above DWZ 1800 got Black. Martin (listed DWZ 2108) was one of four players who drew; nobody won. **But his draw was offered by the GM in a lost position** (about +5 at move 45; lost from 31…c5) — his words, 2026-09-21: "position at the end was lost, was lucky that the GM offered a draw". The log step tags the game, not the result. Lesson for authoring: the PGN ended at move 45 without a result; ask how a game ended before writing about the ending.

---

## 3. What the app does

One file app: `index.html` + `session-board.js` + `pieces.js` (CBurnett) + `chess.min.js` (chess.js 0.10.3, legal moves only, **not an engine**) + `sessions/bundle.js` + `sessions/private/bundle.js`. Works from `file://`, no fetch.

**Tabs:** Today · Board · Drills · Week · Ladder · Stack · Log · Crush.

**Board tab**
- Game picker (optgroups by `group`, newest first by `date`; `?session=<id>` wins).
- Step types, all schema-driven (§4):
  - default: questions + `mustPlay` on the board, optional `branches[]` (the step's key opens only when every branch is locked; after a lock the board opens the next unplayed branch and names it).
  - `stopPly`: name the reply that stopped you, write the moves after it. Grades "that is ply 1", "you stopped at ply N", mix-up (plays a contrast board + key), illegal / off-line ply. Then the line must be played on the board.
  - `solve`: write the whole line from move one; graded ply by ply against `solve.line` (wrong candidate / stopped at ply N / leaves the line / illegal or ambiguous SAN). First miss auto-logs to the Aagaard log via `logAs`.
- **Use board line** (under the answer box of a `stopPly` / `solve` step): writes the line on the board — moves played plus moves stepped back over — into the answer box as numbered SAN, so nothing is typed twice. The grader is unchanged; a `Show`n or saved line can go in the same way with **Use as answer**. On a miss in a board-entered line the board rewinds to the ply that went wrong and the rest stays ahead (▶), so the position and the message agree. On a pass the line goes on the board by itself — never replayed by hand. Enter in any answer box locks (caught on keydown, since a form with several text boxes has no implicit submit).
- **Auto-check (2026-09-27):** the board grades by itself. A written line (`solve`, `stopPly`, written branch) is graded the moment the board line reaches full length (or matches an accepted line exactly); a played step (`mustPlay`, shown branch) locks when the last move is on the board. **Lock** stays for "I stop here" — stopping early is the leak, so it must be his explicit act — and for question-only steps. Order inside Lock: line → board → branch → questions last ("Line done. Answer the questions, then press Enter or Lock.").
- **Written branches** (`write: true`): the branch button shows only the first `given` ply plus an optional `ask`; he writes the rest (type + Enter, or play it — graded at full length). Status bar shows no "need" for them. Locked branches are saved at once and survive reloads; a session resumes on the first open branch.
- **Spoken / dictated moves (2026-09-27):** every answer box runs through `spokenToSan` first (`window.pathSpokenToSan`): German and English words ("Springer schlägt c3 Schach", "Dame h8", "kurze Rochade", "e8 Dame", "Zeh drei", "knight takes c3") and German SAN letters (Sf3, Lxc6+, Dxg7, Txe8+) become SAN. No mic button: macOS dictation (fn twice) types into the box, on the device. Grading matches loosely — a missing x/+/# is still the move when exactly one legal move fits (`looseMove`). Unknown words stay in the line so the grader calls them illegal instead of silently shortening it.
- **Written branches in games 1–3 (2026-09-27):** JB2bQpWt main/bd4/red1, XbhWoWMi count + trap kg2, qVxKt9G0 punish/trade. Picked by engine check: written only where the continuation is clear; quiet holding lines and the game lines he actually played stay shown. Alternatives added where the engine or the key names an equal move (21.Bc4/Bd3; after 27.Rc8 any defence, incl. 28…Bb5 29.Rb8).
- The solution line stays hidden from the status bar until the written line passes.
- Optional book diagram next to the board (`image`, `caption`, `links[]`), collapsible; open/closed is remembered (`localStorage` `zwischenzug_figure_open`).
- Navigation ⏮ ◀ ▶ ⏭ and keys ← → (step), ↑ start, ↓ end. Back keeps the moves, forward replays; playing the remembered move keeps the rest, any other move drops it. Keys are ignored while typing.
- **Steps:** the strip above the board is clickable — any step, any time, in both directions, and Next no longer waits for a lock. Jumping shows the same empty form a first visit shows; a key still appears only on Lock. **↺ Redo** reopens a locked step (answers and key go, the Aagaard log row stays — one row per drill).
- **Orientation:** ⇅ or `f` turns the board. The side at the bottom comes from the session's `startFen`, so a game played as Black opens from Black's side and does not spin between steps. A manual flip lasts until another session is loaded.
- **Variations:** Save line (+ comment) per `sessionId:stepId`; Show (loads it at the start position to step through), Copy (numbered SAN), Delete; **Copy PGN** merges all lines into main line + side lines with `[SetUp]`/`[FEN]` headers and comments. Verified with python-chess. Board stays playable after Lock.
- **Lichess analysis** link: current board FEN on `lichess.org/analysis/standard/…` (`?color=black` if Black starts). Disabled until Lock — "engine after your own line".

**Drills tab:** every session with a `group` as a mini board + status from the Aagaard log (open / solved = full line on latest attempt / again). Click opens it on the Board (`window.pathOpenSession`).

**Log tab:** session log, slow games (Board sessions append via `pathLogGame`), **Aagaard log** (chapter, exercise, minutes, full / short at ply N / wrong / none, note; summary lists what still needs a drill), JSON export/import of all state.

**Storage:** `store.js` owns the state and the backend. `PathStore.local()` keeps one JSON blob in `localStorage` under `chess_path_to_v1`; reads are synchronous off the cached object, `hydrate()` runs once at boot and `commit()` persists. The page exposes `window.pathStore`. Board progress lives in `state.progress[sessionId]` — `{ at, logged, steps }`, keyed by **step id** so re-authoring a session can only retire an entry, never move a ✓ onto a different step. `window.pathProgress.get/set` is the hook; the session resumes at `at`. Page hooks: `pathLogGame`, `pathLogAagaard`, `pathVariations.get/set`, `pathProgress.get/set`, `pathOpenSession`, `initPathBoard`.

Two behaviours that are not obvious from the call sites:

- **`commit()` does nothing until `hydrate()` has finished** — it returns `false` without writing. A hook that saves before boot completes silently persists nothing, instead of writing a blank state over stored data. A failed read still counts as finished, so a broken backend does not leave the store unable to save.
- **`hydrate()` shape-checks what it loads.** A stored field whose type does not match the blank shape (`null`, an array where an object belongs, a primitive) is dropped and the blank default kept; unknown keys pass through untouched. Corrupt storage is repaired silently rather than raising — so "my edited JSON came back different" is expected, not a bug.

Fixed along the way: board-logged games were overwritten by the next `save(state)` (now writes through the in-memory state).

---

## 4. Session JSON reference

Source of truth: `sessions/<lichessId>.json` (public) or `sessions/private/<id>.json` (book material). After every edit:

```bash
python3 scripts/bundle_sessions.py   # validates, then writes sessions/bundle.js and sessions/private/bundle.js; fails on id clash or any illegal line
```

Session: `id`, `url`, `title`, `date` ("YYYY-MM-DD HH:MM"), `result`, `event`, `startFen`, `logNote`, optional `category` (`leak` | `clean` | `clock` | `gift`, games only — see §5A 3b; labels and follow-up lines live in `CATEGORIES` in `session-board.js`), optional `group`, optional `logAs: {kind: "aagaard", chapter, exercise}`, `steps[]`. A board-logged game carries the category into the Log.

Step: `id`, `name`, `title`, `prompt`, `fen` (full FEN with the real move number), `questions[]`, `key` (HTML shown after Lock), optional `type` (`stopPly` | `solve`), `mustPlay[]`, `branches[]`, `image`, `caption`, `links[] {label, href}`.

- Branch: `id`, `label`, `mustPlay[]`, `key`, optional `write` (bool), `given` (plies shown, default 1), `ask` (short hint after the given moves), `alts[][]` (other accepted full lines; must share the given plies). Use `write` for any line that is his to calculate; keep shown branches for replays. Only lines with one clear continuation belong in `write` — add `alts` where two moves are equally good.
- Question: `name`, `label`, `type` = `text` | `textarea` | `select` | `triple`, optional `hint`, `names`, `options`.
- `stopPly`: `candidate`, `scare` (ply 1), `continue[]`, optional `mixups[] {match[], line[], key}` — `match` is compared with the moves written after the scare; `line` is played from the step `fen`. Add a mix-up only when the engine shows a real difference.
- `solve`: `line[]` (both sides, from the step `fen`), optional `alts[][]` (other accepted lines).

Keys are teaching sentences, never "cp=-17". `session-board.js` stays generic: a new game is new JSON + bundle, zero board JS edits unless a new step *type* is needed. `bundle_sessions.py` now checks every `mustPlay` / `stopPly` / `mixups.line` / `solve.line` / `alts` / branch with python-chess, plus FENs, `category`, `given`, duplicate ids — and refuses to bundle (illegal SAN means Lock never opens). `mixups.match` is compared as text and may be illegal on purpose. `tests/test_sessions.py` runs the same check.

---

## 5. Workflows

### A. He pastes a new Lichess URL (highest priority)

1. `curl -H "Accept: application/x-chess-pgn" "https://lichess.org/game/export/<first 8 chars>?evals=true&clocks=true"`. A 12-char URL is the player-specific link; the game id is the first 8. Refuse blitz as a main session (15+10 and slower is fine).
2. Scan evals **and clocks**. Find the first position that went wrong for *him* — not the opponent's blunder, not the conversion.
3. Ask him (AskUserQuestion) where it felt wrong and what was in his head. His answer changes the session: in game 2 he did not miss the capture, he stopped one ply short.
   **Also ask how it ended** when the PGN is imported, unterminated, or stops in a position the engine calls decisive. A draw offer, a resignation or a flag look the same in a PGN. Game 3's "draw" was the GM's offer at +5 — the first draft praised a defence that never happened.
3b. **Classify the game by its lesson, not its result** — this picks the session shape:

   | `category` | When | Follow-up (steps) |
   |---|---|---|
   | `leak` | He stopped calculating one ply early and it cost something | stop-ply → diagnose → calculate (≥3 branches) → trap/clock → log (step 5 below) |
   | `clean` | Few or no mistakes of his own; the win came from the opponent's errors | **opening** (which opponent move gave the edge; own moves vs the engine's first choice) → **to the last capture** (`solve`: write the winning line to the final capture — he usually stops at the move he likes) → **his best tries** (branches: the opponent's alternatives at the decisive moment, incl. zwischenzug and mate traps) → **if he had defended** (the best defence one move earlier: how much was his) → log. Answer honestly whether it could have been shorter — often it could not |
   | `clock` | The game was decided by time trouble | where the minutes went (clock scan) → the move the clock chose → log |
   | `gift` | The result is better than the position (game 3's offered draw) | the moment it turned → the line that should have ended it → log; never praise the result |

   A won game can be `leak` (game 1). If two fit, pick the one that cost the most. `6yfxgu80` is the template for `clean`.

4. Stockfish offline: `python3 scripts/author_session.py --fen 'FEN' --lines C1,C2,C3 --depth 20 --mpv 5`.
5. Write `sessions/<id>.json`: stop-ply step → diagnose → calculate (≥3 branches: skipped line, the move he played, the sound alternative) → trap/clock step if there was a blunder → log step.
6. Verify lines with python-chess, bundle, test in the browser (§7), then tell him what to do on the board.

### B. Aagaard book drills (next chapter)

Pipeline used for chapter 6; reuse for the next chapter he chooses. Everything stays in `books/` and `sessions/private/`.

1. Render exercise and solution pages: `pdftoppm -f P -l P -r 200 -png -singlefile "<pdf>" books/chN/ex_pP` (PDF page = book page + 1 in this edition).
2. Read the diagrams, write FENs; zoom into ambiguous pieces (black/white queens and bishops) at 400 dpi.
3. Check legality with python-chess and replay the book's main line from each FEN (a transcription error almost always breaks legality). Stockfish top move vs book first move as a second signal.
4. Build a comparison page (like `books/ch6/check.html`: book crop left, transcribed board right, ✓/✗ marks) and **have him confirm** before building drills.
5. Solution lines: read the rendered solution pages, not `pdftotext` (the OCR garbles piece letters). Bold main line only.
6. Adapt `books/ch6/build_sessions.py` → `sessions/private/aagaard-N-NN.json`, then bundle.

Chapter 6 book pages: exercises p.152–153, 157, 159; solutions p.154–156, 158, 160–162. Exercises 6.7 and 6.16 are "hold the balance".

---

## 6. Guardrails

- **Public repo.** Never put book positions, solution lines, diagrams, page text or the PDF into tracked files. Before any commit: `git diff | grep -iE "aagaard-[0-9]|<a known FEN or player name from the book>"` and `git ls-files | grep -E "^books/|^sessions/private/"` must be empty.
- No Stockfish in the page. Engine is an offline authoring tool; the Lichess link opens only after Lock.
- `file://` must keep working; a fresh clone lacks `sessions/private/bundle.js` (harmless 404 in the console) until `bundle_sessions.py` runs.
- Board CSS: squares stay `grid-template-rows: repeat(8, minmax(0, 1fr))`.
- UI copy is English; he writes German or English, answer in the language he used.

---

## 7. How to verify

```bash
cd /Users/marty/grok_projects/chess_path_to
node --check session-board.js
python3 scripts/bundle_sessions.py
open index.html
```

The browser suite lives in `tests/` and runs with `python3 -m pytest` (pytest + Python Playwright, `channel="chrome"`; Node Playwright is not installed). Squares: `#chessBoard button` index `(8 - rank) * 8 + file`. Playwright refuses to click `aria-disabled` links — use `force=True` for the disabled Lichess link. Tests that need `sessions/private/` skip themselves in a checkout without it.

---

## 8. Next (in order)

1. ~~Push~~ done (`1b34264`, 2026-09-13).
2. **He plays 6yfxgu80** (game 4, clean, White, 5 steps: opening after 7…Be6 → 13.Qd4 written to 16…Rxc8 → Black's four tries after 13.Qd4 → 12…Bd7 → log). At the board he saw 13.Qd4 only to Qxg7 / Qxh8+ (his answer, 2026-09-27). Played 2026-09-27 10:00 in Oweide vs Torsten Hannebauer (DWZ ~1950), classical OTB; he resigned after 20.Ng3+.
2b. **He plays qVxKt9G0** on the Board tab (5 steps: stop-ply at move 25 → diagnose → 4 branches → the seventh rank at move 28 → log). It opens from Black's side.
3. **He solves Aagaard 6.1–6.6** on the board (started 2026-09-13); misses show in Log → "to drill on the board" and as "again" in Drills.
4. **`author_session.py --json`**: emit a stop-ply + diagnose + calculate skeleton with lines from PV1, so the next game starts from a draft. Keys still by hand.
5. **Known limits worth fixing only if he hits them:**
   - `solve` accepts only the book's main line; a sound side line he writes counts as leaving the line. Possible fix: optional `solve.alternatives[]`.
   - Variations are per browser (`localStorage`); JSON export is the backup.
   - The Today tab's day texts mention Aagaard ch.6 by hand.

## 9. Do not do

- Crush / tournament calendar, new piece set, chrome or README restyles
- Puzzle Storm / ChessTempo clone, blitz trainer
- Stockfish WASM or an eval bar in the page
- Mining old 10+0 games as "the next session"
- "a4 is best" slogans without the line to the end
