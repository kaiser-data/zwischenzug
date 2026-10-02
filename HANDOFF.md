# Handoff — Zwischenzug

Date: 2026-10-03
Repo: https://github.com/kaiser-data/zwischenzug (**public**)
Workspace: `/Users/marty/grok_projects/chess_path_to`
Open: `open index.html` → **Board** or **Drills** tab · hosted: **https://zwischenzug.netlify.app**

This replaces the 2026-09-21 handoff (voice sections in §3 added 2026-09-27/28, hosted version + training by level + invites 2026-10-01, voice speed + fine-tune pipeline 2026-10-02/03). The dossier exists and trains calculation. Do not restart or rename. Hosting it for him and a few invited players was his request on 2026-10-01; it is not a public chess site.

---

## 1. State right now

| | |
|---|---|
| **Voice** | Done 2026-09-27/28 (§3): push-to-talk 🎤, hands-free 🎧 remembered across reloads, grammar second pass, spoken navigation (weiter / vorher / nochmal / drehen / fertig / stop), misheard moves refused with a tone and never written, sequences kept as far as legal, ambiguity named, voice drill + opt-in samples. Server: `python3 scripts/voice_server.py` (127.0.0.1:8766). **Voice v2 speed half built + deployed 2026-10-02/03** (§3 "Voice v2 — as built"): one round trip (free + grammar at once), no ffmpeg for 16 kHz WAV, `-nf`, 500 ms cut with hysteresis, short words **no/nein = take back, yes/ja = Lock**. Server worst case 2.2 s → 0.7 s on the M2. Not yet tried by him. Still open from v2: fuzzy piece words, nearest legal move, two-rook letter. **Fine-tuning on Modal**: pipeline in `scripts/voice_ft/`, CPU dry run passed, full dataset built, GPU run waits for his OK (§3) |
| Last pushed commit | `20c6564` on `hosted/dossier-split`, handoff commit after it local until he says push (2026-10-02: `7285edd` voice faster, `20c6564` fine-tune scripts). Deployed: Railway (`railway up`, build not confirmed live from here — voice needs login) and Netlify (sw `877eacbb1e89`, built with `training.js` as committed). **Uncommitted:** `training.js` (3/5/10 a day + misses come back after 2 days, not yet tested) and two new tests appended to `tests/test_training.py` (count, misses come back) — written, never run; see §8 item 00a. `main` unchanged at `f6c4a77` — merge only when he asks |
| **Hosted (2026-10-01)** | **https://zwischenzug.netlify.app** (Netlify site `zwischenzug`, team kaiser-data) → `/api/*` proxied same-origin to Railway project `zwischenzug`, service `api`, **https://api-production-3edf.up.railway.app**, volume `/data` (SQLite `zz.db`, speech models, samples per user, `private/bundle.js`). §3 "Hosted". Works on his iPhone (sign-in confirmed by him, "works nice"). Not yet confirmed on the phone: mic (EN and DE), thumb dock, sync, Training. Test invitee `test1@zwischenzug.test` invited 2026-10-01 (link on his Mac in `invites/`, unused) |
| **Training by level** | Live 2026-10-01: `sessions/puzzles.js` (684 Lichess puzzles, CC0, built by `scripts/build_puzzles.py` from `~/.cache/zwischenzug/puzzles/lichess_db_puzzle.csv.zst`) → `training.js` makes "Today · 3 positions near <level>" (group Training, `solve` steps, `state.training` {level, days, done}, synced). Right on the first try +40, a miss −40 (800–2800). Rating set once above the board. Invitees land on it |
| **Board navigation** | Done 2026-09-21: clickable steps, progress across reloads, Redo, board orientation. Spec + plan in `docs/superpowers/` |
| Sessions in the repo | `JB2bQpWt` (game 1, won), `XbhWoWMi` (game 2, lost), `qVxKt9G0` (game 3, simul vs GM Rabiega 2026-09-19, drawn) — all three `category: leak`; `6yfxgu80` (game 4, classical OTB 2026-09-27 in Oweide vs Torsten Hannebauer, won in 20, `category: clean`) |
| **Game categories** | Added 2026-09-27: every game session carries `category` (§4); the category decides the follow-up (§5A step 3b). Shown above the board and in the picker's optgroups ("Games · Clean") |
| Private, gitignored | `books/` (Aagaard PDF, page renders, `ch6/check.html`, `ch6/build_sessions.py`), `sessions/private/` (24 drills `aagaard-6-01` … `24` + `bundle.js`) |
| Player's progress | 2026-09-28: first voice-drill result reported as "28/20" ("quite good") — unclear, ask for the exact score (likely N of 20) before using it as the retraining baseline. Opened on Aagaard 6.1 to solve 6.1–6.6 by voice. qVxKt9G0 built 2026-09-21, not yet played on the board. Simul date/time: 19.09.2026, start time is a placeholder (19:00) until he confirms. Played through XbhWoWMi. Aagaard ch.6 drills built; he confirmed all 24 transcribed positions match the book. He has not logged any exercise yet. |

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
- **Spoken / dictated moves (2026-09-27):** every answer box runs through `spokenToSan` first (`window.pathSpokenToSan`): German and English words ("Springer schlägt c3 Schach", "Dame h8", "kurze Rochade", "e8 Dame", "Zeh drei", "knight takes c3") and German SAN letters (Sf3, Lxc6+, Dxg7, Txe8+) become SAN. No mic button: macOS dictation (fn twice) types into the box, on the device. Grading matches loosely — a missing x/+/# is still the move when exactly one legal move fits (`looseMove`). Unknown words stay in the line so the grader calls them illegal instead of silently shortening it. **The board follows the box** (debounced 250 ms): every move typed or dictated appears on the board as it arrives; commands **zurück / back / undo** drop the last move, **reset / zurücksetzen / von vorne / clear** empty the line. A move that is illegal or not understood with more after it is named ("The board stops before …"); a still-arriving last word is not. At full length the line is graded by itself. Lock cancels a pending follow so it cannot wipe the grade's message.
- **Voice 🎤 (2026-09-27):** `python3 scripts/voice_server.py` (stdlib, **127.0.0.1:8766** — 8765 is taken by an unrelated `http.server` on this Mac) → hold 🎤 or `v`, say one move, let go. Chrome records webm/opus → server (ffmpeg → 16 kHz) → `whisper-cli` with **atamano/whisper-chess-tiny** (EN) or `-de` (DE; toggle EN/DE next to 🎤, `localStorage` `zwischenzug_voice_lang`). ~0.35 s round trip on the M2. Model is **CC BY-NC-SA 4.0**: downloaded on first start to `~/.cache/zwischenzug/voice/`, never into the repo. Text goes through `spokenToSan`: on a written step it is merged into the answer box (so back/reset act on what is written) and the board follows; otherwise the move is played on the board. Server off → 🎤 greyed, press says how to start it. Page override for tests: `window.PATH_VOICE_URL`. Measured 2026-09-27 on synthetic voices (optimistic: the model is also trained on synthetic speech): EN 13/13 and 11/13, DE 11/13 single moves right; general Whisper base 4–6/13. macOS dictation on his real voice: ~3/13 — it drops the file letter of about half the squares. Jetson STT is CPU-only at RTF ~2 (GPU wheel broken), so the Mac is the right place. Verified end to end with Chrome's fake-mic WAV (`--use-file-for-fake-audio-capture`). **Hands-free 🎧 (`l`):** loudness-based utterance cutting in the page (`makeSegmenter`: speech = clearly above an adaptive noise floor, ends after 700 ms quiet, 300 ms pre-roll, ignores < 250 ms, cuts at 4 s), WAV per utterance, transcribed strictly in order. Spoken commands: back/zurück, reset, **done/fertig = Lock**, stop. Tests: synthetic tone segmentation, and a real fake-mic run (`fake_mic_browser` fixture) that puts Ne2 on the board with no button.
- **Voice, level 0 + drill (2026-09-28):** every recording (🎤 or 🎧) goes through `utterance()` → `recognise()`: free transcription first; if the text looks like a move (`CHESSY`) but is not legal in `positionNow()` (end of the written line, else the board), the same audio is sent again with `&moves=<legal SAN>` and the server holds whisper to a GBNF of exactly those moves in the model's own wording (`spoken()` in `voice_server.py`: EN "knight takes C. three", DE "springer schlägt c drei"). Noise and commands never get the second pass, so no move is forced out of silence. Live check: "to E. seven" → "king E. seven".
  **Samples** (`~/.cache/zwischenzug/voice/samples/<lang>/` + `manifest.jsonl` {file, label SAN, heard, source}): `POST /sample`, `GET /samples`. Sources: `drill` (Board → *Train the voice model*: shows a random legal move from the session's positions, he says it, recording saved with that label, score shown — the baseline on his voice), and opt-in (`zwischenzug_voice_keep`) `spoken` (a voice move not taken back within 5 s) and `correction` (after "back", the misheard recording labelled with the move he said next). Commands also: skip/weiter in the drill.
  **Retraining path (not started — needs his samples first):** (1) run the drill until ~200–300 samples per language; the drill score is the baseline. (2) Fine-tune `openai/whisper-tiny` or `-base` (MIT; avoids the NC-SA of atamano's weights) on synthetic speech (`say` voices × SAN spoken forms) plus his samples, target text = the model's wording or SAN. Local M2/MPS is enough for tiny; Modal (profile `kaiser-data`, A10G, well under $1/run) for base/small — follow the `modal-gpu-sweeps` skill (smoke run first). (3) Convert HF → ggml with whisper.cpp `models/convert-h5-to-ggml.py`, evaluate old vs new on a held-out 20 % of his samples, switch only if better. Ask before any paid run.
- **Mouse-free session (2026-09-28):** 🎧 is remembered (`localStorage` `zwischenzug_voice_listen`): once on, it comes back after a reload or a new session as soon as the voice server answers, until he says stop or presses it off (a crashed server does not forget it). Chrome holds audio opened at page load until the first click or key, so the page asks for one; after that nothing. Spoken navigation: **next/weiter/nächster** = next step, and on the last step the next unfinished session of the same group (Aagaard drills in id order, games newest first); **previous/vorher**; **redo/nochmal** reopens a locked step; **flip/drehen**. In the voice drill, next/weiter still means skip. Questions (text fields) still need typing or macOS dictation — the chess model hears moves, not sentences.
- **Voice error handling (2026-09-28):** a spoken move is checked against `positionNow()` before it goes anywhere (`legalPrefix`): what is not legal never enters the answer box or the board — low double tone, "✗ … Say it again", nothing to take back. A sequence in one breath is taken as far as it is legal ("did not get Kh5, say it again"). An ambiguous move names both ("which one: Nbd2 or Nfd2?"); "Springer b d2" answers it. A move that went in gets a short high tick (`cue`, Web Audio, quiet; echo cancellation and `MIN_MS` keep it out of the mic). The grammar second pass wins only when it gets more legal plies than the free hearing, so a sequence is never cut to one move. With samples on, a rejected recording + the move said next is saved as a `correction`. Limit: a deliberately illegal reply for a mix-up must be typed — voice only takes legal moves.
- **Voice v2 — asked 2026-09-28, NOT built yet (measurements + plan only, no repo code changed).** His request: listening more stable and faster; short commands ("undo", "no"); similar-sounding words understood; take the legal moves into account and use the nearest one; with two rooks, ask for / accept the extra letter.
  **His 20 real drill samples** (`~/.cache/zwischenzug/voice/samples/en/manifest.jsonl`, all `drill`) show what fails on his voice: `Rd8` → "Oak D. eight", `Rac1` → "Whook A. C. one", `Kc8` → "Kings C. eight", `Nd3` → "night this way", `Nb3` → "night B. three". So: piece words get mangled (fuzzy aliases fix most), squares mostly survive. Samples carry no FEN — **add `fen` to `/sample`** so future samples can be replayed in their real position.
  **Latency measured (M2, 2 s clip):** `whisper-cli` total ≈ 250–350 ms, of which **load ≈ 150 ms every call** (model reloaded per request), encode ≈ 110 ms, decode ≈ 30 ms; plus an ffmpeg spawn; plus a whole second sequential call when the grammar pass runs. The biggest wait is before any of that: `LISTEN.SILENCE_MS` 700 ms. `-bs 1 -bo 1` saves nothing on tiny; `-ng` (CPU) is slower (0.58 s); `-ac 512` slower. `whisper-server` keeps the model warm but has **no per-request grammar**.
  **Tried and dropped: ONNX + scoring every legal move acoustically** (int8 ONNX of both atamano models via `huggingface_hub` → HF cache; prototype in `~/.cache/zwischenzug/voice/dev/proto.py`, `run.py`). Free decode works (encode 165 ms + greedy 46 ms, "G. five" correct), and forced scoring separates well (right move −0.1 vs others −31…−38), but batched scoring costs ~45 ms per candidate over the full 1500-frame encoder output, ~9 ms trimmed to 300 frames → too slow for ~35 legal moves × spelling variants. Would need a KV-cached prefix trie; not worth it now. The DE repo has no safetensors (only ggml + ONNX).
  **Plan (in order):**
  1. *Server* (`voice_server.py`): when `moves` is given, run the free and the grammar whisper **concurrently** (two subprocesses) and return both texts in one reply → one round trip, latency ≈ one pass. Skip ffmpeg when the body is already 16 kHz mono WAV (page downsamples). Add `-nf` (no temperature fallback: stops slow spikes on noise). Grammar: disambiguation file gets the model's dot ("rook A. D. one"), and also allow the short form ("rook D. one") so an ambiguous pair comes back as a question instead of a forced guess; add command words to the grammar.
  2. *Client* (`session-board.js`, ideally the pure matching in a new `voice-match.js` loaded before it so node/pytest can test it): fuzzy word map (oak/whook/brook/rock/look → rook, kings → king, night(s) → knight, edit distance ≤ 1–2 for unknown words); **short undo words** no / nein / nope / oops / wrong / falsch / undo / back / zurück (only as a whole ≤ 2-word utterance, and only when it is not a legal move); **nearest legal move on text**: legal move → symbols [piece, dis-file/rank, x, file, rank], weighted edit distance to the heard symbols (b/c/d/e/g confusable, missing "takes" cheap, unknown word ≈ 0.7), accept only with a clear margin, else "which one: X or Y?"; combine with the grammar hearing (agree → take; disagree → text-nearest if clear, else ask). **Two rooks:** "which rook: a or f?" and keep the options pending; the next utterance may be just the letter ("a" / "A." / "f"). **Held piece:** an utterance that is only a piece ("rook") is kept ~2 s and joined with the next one, so a pause inside a move does not lose it.
  3. *Segmenter*: hysteresis (start above floor×3.5, stay in speech above floor×2) so soft endings don't cut; `SILENCE_MS` 700 → ~500; `MIN_MS` 250 → ~180 so "no" gets through; downsample to 16 kHz in the page; one failed request must not stop 🎧 (re-check `/health`, stop only if the server is really gone — today any error calls `listenStop()`).
  4. *Eval before/after*: replay his 20 samples in real session positions (all FENs from `sessions/**/*.json` where the label is legal; script drafted as `~/.cache/zwischenzug/voice/dev/collect.py`, not yet run — he interrupted it) → free vs grammar vs new matcher accuracy + ms. Synthesize command words with `say` to see what the chess model writes for "no", "undo", "back", "nein" (it is trained on moves only — check before trusting a command word). Then pytest, `graphify update .`, HANDOFF.
- **Voice v2 — as built 2026-10-02/03** (his words: "the speed of recognizing chess moves still quite slow", "not understanding my back or no", "really short easy recognizable code words").
  *Server* (`server/voicecore.py`, both servers): `transcribe_both()` runs the free and the grammar whisper in two threads on one prepared WAV → `/transcribe?...&moves=<legal>&both=1` returns `{text, grammar, ms}`; `/health` says `"both": true`. `is_wav16k()` skips ffmpeg. `-nf` on every call. Measured on the M2 (Daniel voice, 20 legal moves, Mac busy): old path (ffmpeg + free + second request) median 2179 ms → 723 ms.
  *Page* (`session-board.js`): `recognise()` sends the moves up front only when `/health` said `both` (an old server would otherwise answer with the held hearing alone), picks the free hearing unless it is move-like and illegal, falls back to the old second request otherwise. `to16k()` box-downsamples before `wavBlob` (146 KB → 48 KB). Segmenter: `SILENCE_MS` 500, `MIN_MS` 180, hysteresis (start > floor×3.5, stay > floor×2). A failed request no longer calls `listenStop()`: it re-checks `/health` first.
  *Command words, measured* (7 macOS EN voices through the current EN model, `-nf`): back 2/7 (else "A. eight", "B. eight", "E. two" — squares!), undo 0/7, redo 0/7, flip 1/7, previous 2/7, cancel 2/7, done 4/7, reset 5/7, again 5/7, wrong 5/7, no 6/7, yes 7/7, stop 7/7, next 7/7, bravo 6/7, zero 4/7. So `SPOKEN.undo` += no/nope/wrong/oops/nein/falsch, `SPOKEN.done` += yes/ja; LISTEN_HINT names them. German words not yet measured (he stopped that run). prev / redo / flip still need better words — or the fine-tune.
  *Fine-tune pipeline* (`scripts/voice_ft/`, data + models in `~/.cache/zwischenzug/voice/ft/` and Modal volume `zz-voice-ft`, never the repo): `make_dataset.py` — macOS `say` (28 EN + 9 DE voices; German voices also read the English text, nearest to his accent), random-game positions (captures/checks favoured, 15 % castling, 8 % two moves), targets in `voicecore.spoken` wording, ~1400 EN + 1100 DE command clips; voices Moira, Rishi, Sandy (US), Shelley (DE) / Sandy (DE) held out as eval. Full run took ~45 min on the Mac → `ft/data/` (train 12 835 / eval 1 622 clips, 422 MB); `--small` = 4 %, in `ft/small/`. `train_modal.py` — `openai/whisper-tiny` (MIT), one model EN+DE, A10G, bf16, 2000 steps × 64, lr 5e-5, augmentation (speed, level, noise 5–35 dB SNR, dull mic, padding), his clips from `real.npz` ×8 if present, best eval checkpoint → whisper.cpp ggml via `convert-h5-to-ggml.py` v1.9.1; flags `--upload <dir>`, `--dry-run` (CPU, 3 steps), `--skip-existing`, `--set lr=…`; writes `runs/<run>/{ggml-model.bin, metrics.json, run.json (cost), misses.json}` and downloads them. **Wave 0 done** (CPU dry run, 58 s, < 1 ¢, export loads in whisper-cli). `eval_local.py` — whisper-cli exactly as the server runs it; baseline on the small held-out set: **current model 58 %** (EN moves 17/30, DE moves 17/29).
  *Not yet:* the GPU run (≈ $0.30–0.50, ask first); a `real.npz` builder from his drill samples (add `fen` to `/sample` first); German command-word probe; switching the server to a new model only if `eval_local.py` says it is better on held-out voices **and** his samples.
  *Nebius* (he has credits): CLI installed at `~/.nebius/bin/nebius`, profiles `zz`/`zz2` both logged in as martinkaiser.bln@googlemail.com with **no tenant** — credits are likely on another login or on Token Factory, which fine-tunes text LLMs only (no Whisper). Modal used instead (profile `kaiser-data`).
- **Hosted (2026-10-01).** Spec `docs/superpowers/specs/2026-10-01-mobile-pwa-voice-design.md`, plan + as-built notes `docs/superpowers/plans/2026-10-01-backend-service.md`.
  *Backend* `server/` (FastAPI, one process): `voicecore.py` (shared with `scripts/voice_server.py`, which still runs locally on 8766), `auth.py` (invite-only: one-time links, owner `/api/auth/invite`, optional mail via Resend and Google — both off: no `RESEND_API_KEY` / `GOOGLE_CLIENT_ID`), `engine.py` + `/api/check` (Stockfish depth 16, Threads 1, fresh game per call → same line, same sentence; "stopped early" = the unbroken capture/check run right after his last ply swings material ≥ 2), `drills.py` (owner only), `progress.py` (409 on stale base). Railway env: `SESSION_SECRET` (generated into Railway, never shown), `OWNER_EMAIL=martinkaiser.bln@googlemail.com` (googlemail = gmail everywhere), `SITE_URL`, `MAIL_FROM`, `RAILWAY_DOCKERFILE_PATH=server/Dockerfile` (without it Railway ignored the Dockerfile and served index.html via Caddy). `.railwayignore` keeps books/, sessions/, tests/ out of the upload. Deploy: `railway up --detach` from the repo root. Measured on Railway: voice ~420 ms (grammar ~640 ms), check 0.2–0.3 s.
  *Sign-in and invites (no mail, no Google — both are coded but off):* one-time links only; the server keeps a sha256, so a link can never be shown twice — always make a new one. Cookie `zz_session` 30 days.
  - **Workflow:** `python3 scripts/invite.py anna@x.de bert@y.org` → per person `railway ssh -- python -m server.login_link --invite <email>` (adds to `invites` table, link valid 7 days) → local page `invites/invites-<stamp>.html` (gitignored: links are keys) with one QR + "Copy link" / "Share" per person, opened in the browser, printable. `--me` = a 15-minute link for the owner. A new device or lost link: run it again for the same email; progress stays (keyed by email).
  - On the phone: signed-in owner → footer "invite someone" → same thing (`POST /api/auth/invite`, owner only), QR drawn with qrcodejs from cdnjs.
  - Access = `OWNER_EMAIL` / `ALLOWED_EMAILS` env **or** a row in `invites`. There is **no revoke yet** (proposed: `invite.py --remove` deleting the row; the cookie then fails on the next request because access is checked every time).
  - First visit: `/welcome.html` (once, `localStorage` `zz_welcome_seen`), then Today. Invitees (`zz_role` guest) see only the Board tab; no dossier, no voice drill.
  *Site:* `python3 scripts/build_site.py && netlify deploy --prod --dir dist --site f13fe0d3-4e74-4efb-8071-6da1baf24a78 --no-build`. The build copies public files + `web/` (manifest, `sw.js` offline shell, `hosted.css`, `welcome.html`, icon), swaps the private bundle tag for `/api/drills/bundle.js`, and **refuses** if any private drill id or FEN reaches `dist/`. `hosted.js` acts only on https: login gate, `PATH_VOICE_URL=/api/voice`, `PATH_REMOTE_STORE` (store.js `remote`: localStorage first, then `/api/progress`, merge on conflict), `PATH_AFTER_LOCK` hook (session-board.js, generic) → engine sentences under the key, spoken while 🎧 is on. Phone (< 720 px): thumb dock (◀ ▶ 🎤 🎧 EN Lock), question under the board. Invitees see only the Board tab (no dossier); first visit → `/welcome.html` (game 2, …Qxf5 stamped).
  *Private drills on the volume:* copied 2026-10-01 over `railway ssh` (sha256 matches the local bundle). After rebuilding `sessions/private/bundle.js`, copy it again the same way (or `scripts/push_drills.py` with a session cookie).
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

000. **Voice on the phone** (signed in via a fresh `invite.py --me` QR 2026-10-03): 🎧, a move, "no", "yes" on a written step. Ask whether it feels faster and what was misheard. Confirm Railway runs the new build (`railway service status --json`).
000a. **Fine-tune:** the full synthetic set is ready in `~/.cache/zwischenzug/voice/ft/data/` (2026-10-03: train 12 835 clips / 204 min, eval 1 622 clips / 26 min on held-out voices, 43 dropped, 422 MB). Next: `modal run scripts/voice_ft/train_modal.py --upload data --run tiny-a` — **ask before** (≈ $0.30–0.50), then `eval_local.py --data data --model current --model runs/tiny-a/ggml-model.bin`. His own clips: the hosted drill saves them per user on the Railway volume (reading it was blocked by permissions — ask him); or he records ~300 in the Mac drill.
00. **He tests on the iPhone:** the test invitee QR (private Safari tab or a second device: welcome → Today, board only), mic in **EN and DE** (DE model is on the server but only EN was measured there), thumb dock, Mac ↔ phone sync, Training + "Set rating". Ask what broke.
00a. **Finish training extras** (written, uncommitted, untested in `training.js`): a day count of 3 / 5 / 10 (`t.perDay`, links in the level bar) and repeats (`t.missed[id] = date`; a miss comes back as "Again" ≥ 2 days later, at most a third of the day; right on the first try removes it; repeats never move the level; `PathTraining._today` hook for tests). Run the two appended tests (`test_count_per_day`, `test_a_miss_comes_back_two_days_later_and_leaves_when_right`), fix what fails, then run `python3 -m pytest`, `build_site.py`, Netlify deploy, commit, ask "push?".
00b. **Invite admin:** `invite.py --remove <email>` (revoke) and `--list` (who is invited, last login from `users`). Offered to him, not yet asked for.
00c. Voice v2 (item 0) goes into `server/voicecore.py`, so the local server and Railway both get it; redeploy Railway after.
0. **Rest of Voice v2** (§3 "Voice v2" step 2: fuzzy piece words, nearest legal move, two-rook letter, held piece; step 4 eval on his samples). Speed half done 2026-10-02.
1. **Read his results** from Aagaard 6.1–6.6 (Log → Aagaard log; Drills tab shows open / solved / again) and his voice experience: what was misheard, whether the tones and "say it again" worked, whether pauses cut moves right (`LISTEN.SILENCE_MS`, 500 ms since 2026-10-02, is the knob). Ask the exact voice-drill score.
1b. After every finished feature: report unpushed commits and ask "push?" — he checks GitHub (2026-09-28: "seit gestern keine commits auf github").
2. **He plays 6yfxgu80** (game 4, clean, White, 5 steps: opening after 7…Be6 → 13.Qd4 written to 16…Rxc8 → Black's four tries after 13.Qd4 → 12…Bd7 → log). At the board he saw 13.Qd4 only to Qxg7 / Qxh8+ (his answer, 2026-09-27). Played 2026-09-27 10:00 in Oweide vs Torsten Hannebauer (DWZ ~1950), classical OTB; he resigned after 20.Ng3+.
2b. **He plays qVxKt9G0** on the Board tab (5 steps: stop-ply at move 25 → diagnose → 4 branches → the seventh rank at move 28 → log). It opens from Black's side.
3. **He solves Aagaard 6.1–6.6** on the board (started 2026-09-13); misses show in Log → "to drill on the board" and as "again" in Drills.
4. **`author_session.py --json`**: emit a stop-ply + diagnose + calculate skeleton with lines from PV1, so the next game starts from a draft. Keys still by hand.
5. **Known limits worth fixing only if he hits them:**
   - `solve` accepts the main line plus authored `solve.alts`; a sound side line nobody authored still counts as leaving the line.
   - Voice takes only legal moves: a deliberately illegal reply for a mix-up must be typed. Text questions need typing or macOS dictation.
   - Voice retraining (§3 "Retraining path") waits for ~200–300 of his samples per language; ask before any paid Modal run.
   - Variations are per browser (`localStorage`); JSON export is the backup.
   - The Today tab's day texts mention Aagaard ch.6 by hand.

### Hosted deploy cheat sheet

- Backend: `railway up --detach` (repo root; project `zwischenzug`, service `api`). Wait: `railway service status --json` → SUCCESS. Logs: `railway logs`. Shell: `railway ssh -- <cmd>`.
- Netlify CLI must be on the account **martinkaiser.bln@googlemail.com** (`netlify switch`, interactive — he runs it); on martinkaiser.ai@gmail.com the deploy says "Project not found". Production deploys from here are blocked by the permission classifier: build `dist/`, then he runs the deploy with `!`. Build with uncommitted files stashed (`git stash push -- <files>`), since `build_site.py` copies the working tree.
- Site: `python3 scripts/build_site.py && netlify deploy --prod --dir dist --site f13fe0d3-4e74-4efb-8071-6da1baf24a78 --no-build`. Draft first (drop `--prod`) and check at 390×844 with `/api/auth/me` mocked via Playwright `page.route` — that is how every hosted change on 2026-10-01 was checked.
- Private drills after a rebuild: `B=$(gzip -9c sessions/private/bundle.js | base64 | tr -d '\n'); railway ssh -- "echo $B | base64 -d | gunzip > /data/private/bundle.js"`, compare sha256.
- Puzzles: re-download the CSV (≈ 300 MB) only when wanted; `python3 scripts/build_puzzles.py` (~3 min) is deterministic.
- Never install server deps into the global Python without pinning: `requests` must stay 2.32.4 (snowflake-cli).

## 9. Do not do

- Crush / tournament calendar, new piece set, chrome or README restyles
- Puzzle Storm / ChessTempo clone, blitz trainer
- Stockfish WASM or an eval bar in the page
- Mining old 10+0 games as "the next session"
- "a4 is best" slogans without the line to the end
