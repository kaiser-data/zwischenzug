# Board step navigation and saved progress

Date: 2026-09-21
Status: design, approved in conversation (approach A)
Touches: `session-board.js`, `store.js`, `index.html`, `tests/`

## The problem

On the Board tab a step can only be left forwards, and only after it is locked
(`session-board.js:207`, `boardNext.disabled = !locked[step]`). There is no way back
to an earlier step at all: the step strip is `<span>`s, not buttons
(`renderSteps`, `:186`), and ⏮ ◀ ▶ ⏭ navigate *moves*, not steps.

None of it survives a reload. `locked` is an in-memory array reset on every
`loadSession()` (`:512`), so a reload, a session switch, or the next day puts every
step back to closed. Saved variations survive; the work of getting there does not.

Result: material already solved has to be typed again to reach the step after it.

## What we are building

1. The step strip becomes clickable — any step, any time, forwards or backwards,
   locked or not.
2. Progress persists across reloads: which steps are locked, the answers written
   into them, and which branches were played.
3. A locked step can be reopened with **↺ Redo**, which clears its answers and
   hides its key so it can be solved again.

## What stays as it is

The discipline is untouched, and this is the point to hold on to: **a key is still
shown only on lock**, and a step is still only locked by a line that passes the
grader. Jumping to step 4 reveals nothing about step 4 — it shows the same empty
form the first visit shows. Free navigation changes what you have to *retype*,
not what you have to *solve*.

`mustPlayNow()` keeps hiding the solution from the status bar until the written
line passes (`:581`). Variations stay where they are, in `state.variations`.

## Architecture — approach A, progress lives in the store

`store.js` owns the state and the backend (HANDOFF §3). Progress goes in it, next
to variations, rather than into a second `localStorage` key read straight from
`session-board.js` — so it lands in the Log tab's JSON export, and `hydrate()`'s
shape check repairs it when it is corrupt.

### Data shape

`blank()` (`store.js:8`) gains one key:

```js
{ sessions: [], games: [], blitz: {}, checks: {}, aagaard: [], variations: {}, progress: {} }
```

```js
state.progress = {
  "qVxKt9G0": {
    at: "seventh",             // step id last opened; where the session resumes
    logged: true,              // an Aagaard log row was written for this session
    steps: {
      "onemore": {
        locked: true,
        passed: true,          // the written line passed the grader
        answers: { scare: "Re8+", "continue": "26... Kf7 27. Rc8 Bc4 28. Rxc6" },
        branches: []           // ids of branches locked in this step
      },
      "calculate": { locked: true, passed: false, answers: { whyc8: "…", re8: "check" },
                     branches: ["punish", "game", "hold", "trade"] }
    }
  }
}
```

**Keyed by `step.id` and branch id, never by index.** Sessions get re-authored;
a step inserted in the middle must not move somebody else's ✓ onto it. Entries
whose id no longer exists in the session are ignored on read and dropped on the
next write.

### The hook

`index.html` exposes one more hook in the shape of `pathVariations` (`:689`) —
defensive reads, a write that calls `save(state)`:

```js
window.pathProgress = {
  get: (sessionId) => ({ at, logged, steps }),   // always a well-formed object
  set: (sessionId, progress) => { … save(state); }
};
```

`session-board.js` calls it; it does not touch `localStorage` itself.

## Components

**`renderSteps()`** emits `<button data-i>` instead of `<span>`, keeping the
`on` / `done` classes. A click saves the current step's form values, then
`loadStep(i)`. Buttons carry `aria-current` for the active step.

**`loadStep(i)`** restores from the step's entry: form values into the fields,
`locked[i]`, `stopPassed`, `branchLocked`, and shows the key when the step is
locked. The board itself always starts at the step FEN — positions are not
restored, variations already cover that.

**`lockStep()`** writes the entry on success. For a session with `logAs`, it
writes the Aagaard log row only when `progress.logged` is not already set, then
sets it.

**↺ Redo**, rendered next to Lock when the step is locked: clears `answers`,
`locked`, `passed`, `branches` and `firstMiss` for that step, hides the key,
re-renders. It deliberately does **not** clear `logged` — a second pass through
a drill does not write a second log row. (That was the third option offered and
not the one chosen; if it is wanted later it is a one-line change here.)

**Answer capture** happens when a step is left, when Lock is pressed, and on
`input` debounced at 300 ms, so a reload mid-typing does not lose the line.

**Resuming:** opening a session jumps to `progress.at`; if that id is not in the
session any more, it falls back to the first step. `?session=<id>` still wins over
the picker; it selects the session, not the step.

## Error handling

- A `progress` entry of the wrong type is dropped by `mergeShaped` and the blank
  default kept — stored state from before this change simply has no `progress`
  key and starts empty (HANDOFF §3: unknown keys pass through, mismatched ones
  are replaced).
- Unknown step and branch ids are ignored, so re-authoring a session degrades to
  "that step is open again", never to a wrong ✓.
- `commit()` still does nothing before `hydrate()` finishes, so progress written
  during boot cannot blank the stored state.
- A full or unavailable `localStorage` keeps the page working; progress is then
  session-only, exactly as today.

## Testing

`tests/test_board.py`:
- clicking step 4 from an unlocked step 1 opens it, and its key is hidden
- lock step 1, reload, step 1 shows `done`, its answers are back in the fields,
  and Lock is disabled
- Redo on a locked step clears the fields, hides the key, re-enables Lock
- a locked branch step comes back with its branches marked ✓
- re-locking an Aagaard drill after Redo does not add a second log row
- progress keyed by id: an entry for an id absent from the session is ignored

`tests/test_store.py`:
- `progress` is in the blank shape and round-trips through hydrate/commit
- a `progress` of the wrong type (array, string, null) is dropped for the default

Existing tests use a fresh browser context each, so an empty store keeps their
current behaviour.

## Out of scope

Rotating the board to Black's view. It came up in the same conversation and is a
separate, smaller change to `renderBoard()` (ranks, files and the coordinate
labels), plus an orientation argument in the test helper `square_index`. It gets
its own spec if wanted.
