# Dossier Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the page being one person's dossier. Every personal fact becomes profile data with a placeholder, every derived number is computed from the player's rating, and Martin's own text moves out of markup into a seed file he imports.

**Architecture:** One `state.profile` object, persisted by the existing storage layer. Three kinds of content: generic fact stays in markup, derived numbers are computed, personal prose becomes an editable block with a placeholder. One shared editable-block helper serves every tab, so the mechanism is written once.

**Tech Stack:** Vanilla ES5-style browser JS, no build step, no npm. `store.js` for persistence. pytest 9.0.2 + Python Playwright 1.59.0.

## Global Constraints

- `file://` must keep working. Every test loads `file:///…/index.html`.
- No build step, no `package.json`, no bundler, no framework.
- **`session-board.js` must NOT be modified.** If a task appears to need it, stop and report.
- **Public repo.** No book position, FEN, solution line or page text from the Aagaard book in any tracked file.
- All writes go through the existing hooks and `save()` / `store.commit()`. Do not touch `localStorage` directly.
- Browser JS style matches `index.html`'s inline script.
- Commit after every task. Do not push; the owner's push is gated by a content scan.
- The suite is at 24 tests. It must never go down.

## The rule this plan implements

**A new profile is empty, with placeholders. Nothing is pre-filled on anyone's behalf.** Martin is not special-cased in code: he is a user with a filled-in dossier, seeded from a file he imports like anyone could.

## Content classification (the whole job, decided up front)

| Location | Content | Treatment |
|---|---|---|
| `index.html:351-357` header | Name, FIDE id, federation, rating, Lichess handle | **Profile fields**, placeholders when empty |
| `index.html:468-476` ladder table | CM/FM/IM/GM thresholds and norm requirements | **Generic fact** — unchanged |
| `index.html:471-474` "You" column | `+29`, `+129`, `+229`, `+329` | **Computed**: `threshold - ratingStandard`; `—` when no rating |
| `index.html:477` | "K-factor at 2171 is 20 (under 2400)" | **Computed**: rating < 2400 → 20, else 10 |
| `index.html:478` | "Honest ceiling talk: 43, 2171 …" | **Editable block** `ladder.reality` |
| `index.html:486-496` stack table | Tool recommendations | **Generic fact** — unchanged |
| `index.html:491` | "Zero classical games on this account today." | **Generic** — reword to "The only online games that count." |
| `index.html:497` | FIDE card link to `4689640` | **Profile field** `fideId`; row hidden when empty |
| `index.html:581-582` | Crush intro prose | **Editable block** `crush.intro` |
| `index.html:583-589` | The five-point first-year list | **Generic fact**, except point 5's "at 2171 … when 2350 is real" → computed |
| `index.html:590` | "Lichess rapid already peaked 2354 …" | **Editable block** `crush.closing` |
| `index.html:608-609` | `CAP = 3`, `WEEK_TARGET = 600` | **Profile fields**, same defaults |
| `index.html:612+` `PROTOCOL` | Weekly plan, incl. "Aagaard ch.6 — next six exercises" | **Generic default**: name no book or chapter |

## File Structure

| File | Responsibility |
|---|---|
| `profile.js` *(new)* | Profile shape, defaults, placeholders, derived values (`ladderGap`, `kFactor`). Pure functions, no DOM. |
| `index.html` *(modify)* | Renders profile fields and editable blocks; the profile form. |
| `profiles/emperor555.json` *(new)* | Martin's dossier as importable data — the text currently in markup. |
| `tests/test_profile.py` *(new)* | `profile.js` unit tests, browser-run. |
| `tests/test_dossier.py` *(new)* | Empty profile shows placeholders; filled profile renders; edits survive reload. |

---

### Task 1: `profile.js` — shape, defaults and derived values

**Files:**
- Create: `profile.js`
- Create: `tests/profile_harness.html`
- Create: `tests/test_profile.py`

**Interfaces:**
- Consumes: nothing.
- Produces `window.PathProfile`:
  - `.blank()` → `{displayName:"", fideId:"", federation:"", lichess:"", ratingStandard:null, ratingBlitz:null, focus:"", leak:"", blitzCap:3, weekTarget:600, notes:{}}`
  - `.PLACEHOLDERS` → `{displayName:"Your name", focus:"What are you working on?", leak:"Where does your calculation stop?", "ladder.reality":"How realistic is the next title for you?", "crush.intro":"What tournament volume have you committed to?", "crush.closing":"What is your best evidence that slow chess is your weapon?"}`
  - `.TITLES` → `[{code:"CM",rating:2200},{code:"FM",rating:2300},{code:"IM",rating:2400},{code:"GM",rating:2500}]`
  - `.ladderGap(profile, titleRating)` → `"+129"` when a standard rating is set, `"—"` when it is null
  - `.kFactor(profile)` → `20` under 2400, `10` at 2400 and above, `null` when no rating
  - `.merge(stored)` → a blank profile with stored fields applied, ignoring wrong-typed values, preserving unknown keys

- [ ] **Step 1: Write the harness**

Create `tests/profile_harness.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>profile harness</title>
<script src="../profile.js"></script>
```

- [ ] **Step 2: Write the failing tests**

Create `tests/test_profile.py`. Use the existing `browser_page` fixture. Add a `profile_harness_url` fixture to `tests/conftest.py` following the exact pattern of `harness_url` (this is the only change permitted to `conftest.py`).

Tests, each asserting one behaviour:
- `test_blank_profile_shape` — keys exactly as listed above; `blitzCap == 3`; `weekTarget == 600`; `ratingStandard is None`.
- `test_ladder_gap_with_rating` — profile with `ratingStandard: 2171`, `ladderGap(p, 2200) == "+29"` and `ladderGap(p, 2500) == "+329"`.
- `test_ladder_gap_without_rating` — blank profile → `"—"` for every title.
- `test_ladder_gap_above_threshold` — `ratingStandard: 2350`, `ladderGap(p, 2200)` returns `"reached"`.
- `test_k_factor` — 2171 → 20; 2400 → 10; 2500 → 10; blank → `None`.
- `test_merge_ignores_wrong_types` — stored `{"blitzCap": "three", "notes": null, "displayName": 7}` → defaults kept for all three.
- `test_merge_preserves_unknown_keys` — stored `{"futureField": 42}` survives.

- [ ] **Step 3: Run to verify they fail**

Run: `cd /Users/marty/grok_projects/chess_path_to && python3 -m pytest tests/test_profile.py`
Expected: all fail on `window.PathProfile` being undefined.

- [ ] **Step 4: Implement `profile.js`**

ES5-style, same shape as `store.js`: an IIFE assigning `window.PathProfile`, `function` declarations, no arrow functions, double-quoted strings. `merge` follows the same shape-checking discipline as `store.js`'s `mergeShaped` — a stored value replaces a default only when its type matches.

- [ ] **Step 5: Run to verify they pass**

Run: `python3 -m pytest tests/test_profile.py`
Expected: 7 passed. Then `python3 -m pytest` → 31 passed.

- [ ] **Step 6: Commit**

```bash
git add profile.js tests/profile_harness.html tests/test_profile.py tests/conftest.py
git commit -m "Add the profile shape, placeholders and derived values"
```

---

### Task 2: The editable-block mechanism

The one piece of new UI. Written once here, reused by Tasks 3–5.

**Files:**
- Modify: `index.html` (inline script + CSS)
- Create: `tests/test_dossier.py`

**Interfaces:**
- Consumes: `window.PathProfile` from Task 1; `state` and `save()` from the existing inline script.
- Produces, inside the inline script:
  - `renderNote(key)` → HTML string for an editable block: the stored text, or the placeholder from `PathProfile.PLACEHOLDERS[key]` in a `.placeholder` span when empty, plus an "Edit" button carrying `data-note="<key>"`.
  - A delegated click handler on `data-note` that swaps the block for a `<textarea>` and Save / Cancel, writes `state.profile.notes[key]`, calls `save()`, and re-renders.
  - `state.profile` initialised through `PathProfile.merge(state.profile)` at hydration.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_dossier.py`:
- `test_empty_note_shows_placeholder` — fresh storage, Ladder tab, `#panel-ladder .placeholder` contains "How realistic".
- `test_editing_a_note_persists_across_reload` — click Edit on `ladder.reality`, type "Two years to FM.", Save, reload, the text is rendered and no placeholder remains. Assert `page.errors == []`.
- `test_cancel_leaves_the_note_unchanged` — open the editor, type, Cancel, the original text stands.

- [ ] **Step 2: Run to verify they fail**

Run: `python3 -m pytest tests/test_dossier.py`
Expected: 3 failed — no `.placeholder` element exists.

- [ ] **Step 3: Implement**

Add `profile.js` to the script tags, before the inline script and after `store.js`. Add `renderNote`, the delegated handler, and CSS for `.placeholder` (muted, italic) and `.note-edit` (textarea full width). Editing must not be possible for a note key absent from `PLACEHOLDERS` — unknown keys render nothing.

- [ ] **Step 4: Run**

Expected: 3 passed; full suite 34 passed.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/test_dossier.py
git commit -m "Add editable dossier blocks with placeholders"
```

---

### Task 3: The header becomes profile fields

**Files:** Modify `index.html:351-357` and the Log tab (to host the profile form); extend `tests/test_dossier.py`.

- [ ] **Step 1: Failing tests** — `test_empty_profile_header_shows_placeholders` (header shows "Your name", no FIDE id, no rating); `test_saving_profile_updates_header_and_survives_reload` (fill name, Lichess handle, standard rating; reload; header shows them).
- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement.** A "Profile" form on the Log tab above the export/import block: display name, Lichess handle, FIDE id, federation, standard rating, blitz cap, week target. Empty fields render placeholders, never invented values. The header line renders only the parts that are set.
- [ ] **Step 4: Run.** Expected: 36 passed.
- [ ] **Step 5: Commit** — `git commit -m "Render the header from the profile"`

---

### Task 4: Ladder and Stack

**Files:** Modify `index.html:465-500`; extend `tests/test_dossier.py`.

- [ ] **Step 1: Failing tests** — `test_ladder_gaps_computed_from_rating` (rating 2171 → the four rows read `+29`, `+129`, `+229`, `+329`; K-factor line says 20); `test_ladder_without_rating_shows_dashes`; `test_fide_row_hidden_without_id` and shown with the profile's own id in the href.
- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement.** The "You" column and the K-factor sentence render from `PathProfile`. `index.html:478` becomes the `ladder.reality` note. The FIDE row builds its href from `profile.fideId` and is omitted when empty. Reword `index.html:491` to drop "on this account today".
- [ ] **Step 4: Run.** Expected: 39 passed.
- [ ] **Step 5: Commit** — `git commit -m "Compute the title ladder from the player's rating"`

---

### Task 5: Crush, the protocol, and the caps

**Files:** Modify `index.html:579-591`, `608-609`, and the `PROTOCOL` block; extend `tests/test_dossier.py`.

- [ ] **Step 1: Failing tests** — `test_crush_notes_show_placeholders`; `test_blitz_cap_from_profile` (set cap to 1, the Today tab enforces 1); `test_protocol_names_no_book` (no day text contains "Aagaard").
- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement.** `crush.intro` and `crush.closing` become notes; point 5's rating numbers compute from the profile. `CAP` and `WEEK_TARGET` read `profile.blitzCap` / `profile.weekTarget` with the current values as defaults. `PROTOCOL` day texts lose the book and chapter: "Calculation book — next exercises, write every line, then Log".
- [ ] **Step 4: Run.** Expected: 42 passed.
- [ ] **Step 5: Commit** — `git commit -m "Drive the caps and the weekly protocol from the profile"`

---

### Task 6: Seed Martin's dossier as data, and document it

**Files:** Create `profiles/emperor555.json`; modify `HANDOFF.md`.

**Interfaces:** Consumes the import handler, which merges top-level keys. A file containing only `{"profile": {…}}` therefore replaces the profile and leaves games, sessions and the drill log untouched.

- [ ] **Step 1: Failing test** — `test_importing_a_profile_only_file_keeps_other_state`: seed a game and a drill entry, import `{"profile": {"displayName": "X"}}`, assert the profile changed and both the game and the drill entry survive.
- [ ] **Step 2: Run, expect failure** if the merge does not behave as claimed. If it already passes, say so in the report and keep the test.
- [ ] **Step 3: Write the seed.** `profiles/emperor555.json` holds `displayName: "Kaiser, Martin"`, `fideId: "4689640"`, `federation: "GER"`, `lichess: "emperor555"`, `ratingStandard: 2171`, `ratingBlitz: 2085`, and the three notes with the exact prose currently at `index.html:478`, `581-582` and `590`, moved verbatim.
- [ ] **Step 4: Update `HANDOFF.md`** §3 with the profile model, and add a line to §5 explaining that Martin restores his dossier by importing `profiles/emperor555.json` on the Log tab.
- [ ] **Step 5: Run.** Expected: 43 passed. Then open `index.html`, import the seed, and confirm the header and all three notes read as before.
- [ ] **Step 6: Commit** — `git commit -m "Move Martin's dossier out of markup into an importable profile"`

---

## Not in this plan

- Cloudflare Pages deploy, the web app manifest, the responsive pass (spec items 6 and 7 — a separate short plan; that is what makes the link sendable)
- Lichess sign-in, Supabase, per-person accounts (spec items 3–5)
- Reading the rating from Lichess automatically; in this plan it is typed

## Self-review

**Spec coverage:** implements spec item 2 ("the dossier split") in full: every row of the content table above has a task. Items 3–7 are named as out of scope.

**Placeholder scan:** Tasks 3–5 give test names, file ranges and the exact treatment per element rather than repeating the editable-block code, which Task 2 defines once. No step says "handle the rest similarly" without naming what "the rest" is — the content table is the enumeration.

**Type consistency:** `PathProfile.blank`, `.PLACEHOLDERS`, `.TITLES`, `.ladderGap`, `.kFactor`, `.merge` are used with the same names in Task 1's tests, its implementation, and Tasks 2–5. `state.profile.notes[key]` is the single storage location for editable prose, keyed by the strings in `PLACEHOLDERS`.
