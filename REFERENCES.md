# Attribution

What was taken, from where. Not a reading list.

### FIDE Qualification Commission (2024) — title thresholds and norm definition

> FIDE Title Regulations effective from 1 January 2024.  
> https://handbook.fide.com/chapter/B012024

**Used in:** `index.html` (Ladder, Crush), this plan.

**What is taken.** Open titles: CM ≥ 2200, FM ≥ 2300 (rating only, ≥30 rated games for ratings after 1 July 2017). IM ≥ 2400 and GM ≥ 2500 plus norms covering at least 27 games. GM performance ≥ 2600 vs opponents averaging ≥ 2380; IM performance ≥ 2450 vs ≥ 2230. Direct-from-handbook wording of those thresholds.

**What is NOT taken.** Annex tables for every round-count, application forms, women’s titles.

### FIDE Ratings — player card

> Kaiser, Martin, Dr. FIDE ID 4689640. Snapshot retrieved 2026-09-12.  
> https://ratings.fide.com/profile/4689640

**Used in:** identity plate, rating 2171, federation GER, birth year 1983, no title, rapid/blitz inactive.

**What is taken.** Published September 2026 list values as displayed on that date.

### Lichess — emperor555

> https://lichess.org/@/emperor555 and `/api/user/emperor555`, `/api/user/emperor555/rating-history`, `/@/emperor555/perf/blitz`  
> Retrieved 2026-09-12.

**Used in:** diagnosis (12,241 blitz, peak 2319 on 16 Apr 2020, rapid peak 2354, 0 classical, puzzle 2159, ~53 days play time).

**What is taken.** Public rating, game counts, peak, play-time. Not game PGNs (export was rate-limited).

### Aagaard, Jacob — calculation techniques

> *Grandmaster Preparation: Calculation.* Quality Chess. Contents and method as stated on publisher/review pages (candidates, combinational vision, prophylaxis, comparison, elimination, intermediate moves, imagination, traps). Foreword by Boris Gelfand. Method lineage: Mark Dvoretsky.

**Used in:** calculation block of the week (candidate-move work, untimed, write lines).

**What is NOT taken.** Exercise positions (copyright). The dossier points at the book; it does not reproduce puzzles.

### de la Villa, Jesús — practical endgames

> *100 Endgames You Must Know.* Also as Chessable MoveTrainer course.

**Used in:** endgame block recommendation.

**What is NOT taken.** Position list or solutions.

### Kuljasevic, Davorin — 2100–2400 self-study methods

> *The How to Study Chess on Your Own Workbook — Volume 3* (exercises for ~2100–2400): deep analysis, simulation, endgame analysis/simulation.

**Used in:** Saturday deep-work protocol and Phase 1 “train then crush” framing.

### Existing software roles (2026 tool landscape)

Roles assigned from comparison roundups (Be Good at Chess, Chessiverse / IM John Bartholomew review, CheckmateX puzzle comparison, Dark Squares endgame tools, ChessAtlas repertoire comparison):

| Job | Tool assigned |
|---|---|
| Free analysis + studies | Lichess |
| Serious rated tactics | ChessTempo mixed, untimed |
| Opening/endgame drilling | Chessable |
| Mac database (if needed) | Lichess studies first; ChessX / SCID vs. PC; ChessBase is Windows |

**What is NOT taken.** Affiliate rankings, product scores, or “best app of 2026” lists as facts.

### chess.js 0.10.3 — move generation on the session board

> Jeff Hlywa, chess.js, MIT. Vendored at `chess.min.js` (UMD build).

**Used in:** `session.html` only, to legalise clicks. Not used as an engine.

**What is NOT taken.** Any evaluation or opening book.

## Training positions

- Lichess puzzle database, https://database.lichess.org/#puzzles — CC0. `scripts/build_puzzles.py` picks the long-line puzzles into `sessions/puzzles.js` (id, rating, position after the first move, solution in SAN).
