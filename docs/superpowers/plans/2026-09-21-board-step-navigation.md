# Board Step Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every step of a Board-tab session reachable at any time, keep the
work that went into it across reloads, allow a locked step to be reopened, and
let the board be turned around for games played as Black.

**Architecture:** Progress lives in `store.js` as a new `progress` key, reached
from `session-board.js` through one hook in `index.html` (`window.pathProgress`),
in the shape of the existing `window.pathVariations`. Everything is keyed by
`step.id` and branch id, never by index. Board orientation is a view preference
derived from the session's `startFen`, held in a module variable, not in stored
state.

**Tech Stack:** Vanilla ES5-style JS in an IIFE (no build step, must work from
`file://`), chess.js 0.10.3 for legality only, pytest + Python Playwright
(`channel="chrome"`) for the browser suite.

## Global Constraints

- **No Stockfish in the page.** The engine is an offline authoring tool only.
- **`file://` must keep working.** No `fetch()`, no modules, no bundler.
- **Public repo.** Nothing from `books/` or `sessions/private/` may enter a
  tracked file. Before each commit: `git ls-files | grep -E "^books/|^sessions/private/"` must be empty.
- **UI copy is English.**
- Board CSS: squares stay `grid-template-rows: repeat(8, minmax(0, 1fr))`.
- `session-board.js` stays generic — no per-session special cases.
- Keys are teaching sentences, never raw evaluations.
- Style: `function` declarations inside the IIFE, `const`/`let`, double quotes,
  two-space indent. Match the surrounding code; no new dependencies.
- Run `python3 -m pytest` from the repo root. All 31 existing tests must stay green.

---

### Task 1: `progress` in the store's blank shape

**Files:**
- Modify: `store.js:8`
- Test: `tests/test_store.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `PathStore.blank()` returns an object with a `progress` key whose
  value is a plain object `{}`; `mergeShaped` therefore keeps a stored plain
  object and replaces anything else with `{}`.

- [ ] **Step 1: Update the failing test**

`tests/test_store.py`, `test_blank_shape` asserts the exact key list, so it fails
until `blank()` changes. Replace it and add two new tests after it:

```python
def test_blank_shape(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    shape = page.evaluate("Object.keys(window.PathStore.blank()).sort()")
    assert shape == [
        "aagaard", "blitz", "checks", "games", "progress", "sessions", "variations",
    ]


def test_progress_round_trips(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    progress = page.evaluate(
        """async () => {
            localStorage.clear();
            const a = window.PathStore.local();
            await a.hydrate();
            a.state.progress.qVxKt9G0 = {
                at: "diagnose", logged: false,
                steps: { onemore: { locked: true, passed: true, answers: { scare: "Re8+" }, branches: [] } }
            };
            await a.commit();
            const b = window.PathStore.local();
            const state = await b.hydrate();
            return state.progress;
        }"""
    )
    assert progress["qVxKt9G0"]["at"] == "diagnose"
    assert progress["qVxKt9G0"]["steps"]["onemore"]["answers"]["scare"] == "Re8+"


def test_progress_of_the_wrong_shape_is_dropped(browser_page, harness_url):
    """A stored array, string or null must fall back to the blank object."""
    page = browser_page
    page.goto(harness_url)
    kinds = page.evaluate(
        """async () => {
            const out = [];
            for (const bad of [[], "x", null, 7]) {
                localStorage.clear();
                localStorage.setItem(window.PathStore.KEY, JSON.stringify({ progress: bad }));
                const store = window.PathStore.local();
                const state = await store.hydrate();
                out.push(Array.isArray(state.progress) ? "array" : typeof state.progress);
            }
            return out;
        }"""
    )
    assert kinds == ["object", "object", "object", "object"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m pytest tests/test_store.py -q`
Expected: `test_blank_shape` FAILS (list is missing `"progress"`),
`test_progress_round_trips` FAILS (`state.progress` is undefined).

- [ ] **Step 3: Add the key**

`store.js:8`, inside `blank()`:

```js
  function blank() {
    return { sessions: [], games: [], blitz: {}, checks: {}, aagaard: [], variations: {}, progress: {} };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest tests/test_store.py -q`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add store.js tests/test_store.py
git commit -m "Add progress to the store's blank shape"
```

---

### Task 2: the `pathProgress` hook

**Files:**
- Modify: `index.html` (immediately after the `window.pathVariations` block, which
  ends at `:700`)
- Test: `tests/test_persistence.py`

**Interfaces:**
- Consumes: `state`, `save` from `index.html`; `state.progress` from Task 1.
- Produces:
  - `window.pathProgress.get(sessionId)` → always
    `{ at: string, logged: boolean, steps: { [stepId]: { locked: boolean, passed: boolean, answers: object, branches: string[] } } }`,
    with every field normalised, never `undefined`.
  - `window.pathProgress.set(sessionId, progress)` → stores it and commits;
    a progress with no steps and `logged` false deletes the session's entry.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_persistence.py`:

```python
def test_progress_survives_reload(browser_page, app_url):
    page = browser_page
    page.goto(app_url(tab="log"))
    page.wait_for_function("typeof window.pathProgress === 'object'")
    page.evaluate(
        """async () => {
            window.pathProgress.set("s1", {
                at: "two",
                logged: true,
                steps: { one: { locked: true, passed: true, answers: { scare: "Re8+" }, branches: ["a"] } }
            });
            await window.pathStore.settled();
        }"""
    )

    page.reload()
    page.wait_for_function("typeof window.pathProgress === 'object'")
    got = page.evaluate("window.pathProgress.get('s1')")

    assert got["at"] == "two"
    assert got["logged"] is True
    assert got["steps"]["one"] == {
        "locked": True, "passed": True, "answers": {"scare": "Re8+"}, "branches": ["a"],
    }
    assert page.errors == []


def test_progress_get_survives_malformed_storage(browser_page, app_url):
    """Corrupt entries must read as empty, the way pathVariations.get does."""
    page = browser_page
    page.goto(app_url(tab="log"))
    page.wait_for_function("typeof window.pathProgress === 'object'")
    got = page.evaluate(
        """() => {
            window.pathStore.state.progress = { s2: { steps: { one: null, two: 7, three: { locked: 1 } } } };
            return window.pathProgress.get("s2");
        }"""
    )

    assert got["at"] == ""
    assert got["logged"] is False
    assert "one" not in got["steps"] and "two" not in got["steps"]
    assert got["steps"]["three"] == {
        "locked": True, "passed": False, "answers": {}, "branches": [],
    }
    assert page.errors == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m pytest tests/test_persistence.py -q`
Expected: FAIL — `page.wait_for_function` times out, `window.pathProgress` is undefined.

- [ ] **Step 3: Write the hook**

`index.html`, directly below the closing `};` of `window.pathVariations`:

```js
  // Board tab progress per session: which steps are locked, what was written into them,
  // which branches were played. Keyed by step id so re-authoring a session can only
  // retire an entry, never move a ✓ onto a different step.
  window.pathProgress = {
    get: (sessionId) => {
      const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
      const raw = (state.progress || {})[sessionId];
      const src = isObj(raw) ? raw : {};
      const stored = isObj(src.steps) ? src.steps : {};
      const steps = {};
      Object.keys(stored).forEach((id) => {
        const s = stored[id];
        if (!isObj(s)) return;
        steps[id] = {
          locked: !!s.locked,
          passed: !!s.passed,
          answers: isObj(s.answers) ? Object.assign({}, s.answers) : {},
          branches: Array.isArray(s.branches) ? s.branches.slice() : [],
        };
      });
      return { at: typeof src.at === "string" ? src.at : "", logged: !!src.logged, steps };
    },
    set: (sessionId, progress) => {
      state.progress = state.progress || {};
      const p = progress || {};
      const steps = (p.steps && typeof p.steps === "object") ? p.steps : {};
      if (Object.keys(steps).length || p.logged) {
        state.progress[sessionId] = { at: p.at || "", logged: !!p.logged, steps };
      } else {
        delete state.progress[sessionId];
      }
      save(state);
    },
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest tests/test_persistence.py -q`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/test_persistence.py
git commit -m "Add the pathProgress hook"
```

---

### Task 3: session-board.js saves and restores progress

**Files:**
- Modify: `session-board.js` — module state (`:25`), `loadStep` (`:468`),
  `loadSession` (`:509`), `lockStep` (`:435` onwards)
- Test: `tests/test_board.py`

**Interfaces:**
- Consumes: `window.pathProgress.get/set` from Task 2.
- Produces, for Tasks 4–5:
  - `let progress` — the module-level cache, shape as in Task 2.
  - `stepId(n)` → `string`, the id of step `n` (falls back to `"step" + n`).
  - `captureAnswers()` → writes the current form's values into
    `progress.steps[stepId(step)].answers` and returns nothing.
  - `saveProgress()` → prunes entries that hold nothing, then pushes `progress`
    through `window.pathProgress.set`.
  - `entryFor(id)` → the normalised entry object for a step id, creating it.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_board.py`:

```python
def test_progress_survives_a_reload(browser_page, app_url):
    """Lock a step, reload, and it is still locked with the answer in the field."""
    page = browser_page
    page.goto(app_url(session=STOP_SESSION, tab="session"))
    page.wait_for_selector("#boardTake")
    fen = "r4rk1/pppq1ppp/2nn2b1/3p1NB1/3P2P1/2PB1P2/P1P4P/R3QRK1 w - - 5 15"

    play(page, fen, ["Qg3", "Nxf5", "gxf5", "Bxf5", "Bxf5", "Qxf5"])
    page.click("#boardTake")
    page.click("#boardLock")
    assert page.is_disabled("#boardLock"), "the full line locks the step"
    page.evaluate("async () => { await window.pathStore.settled(); }")

    page.reload()
    page.wait_for_selector("#boardTake")

    assert page.is_disabled("#boardLock"), "still locked after the reload"
    assert page.input_value("input[name=scare]") == "Nxf5"
    assert "done" in (page.locator("#boardSteps > *").first.get_attribute("class") or "")
    assert page.errors == []
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 -m pytest tests/test_board.py::test_progress_survives_a_reload -q`
Expected: FAIL — after the reload `#boardLock` is enabled again and the scare
field is empty, because `locked` is rebuilt as all-false in `loadSession`.

- [ ] **Step 3: Write the implementation**

Add next to the other module state (after `let firstMiss = null;`, `:30`):

```js
  // Saved progress for the open session: { at, logged, steps: { [stepId]: entry } }.
  let progress = { at: "", logged: false, steps: {} };
```

Add these helpers above `loadStep`:

```js
  function stepId(n) {
    const s = steps()[n] || {};
    return s.id || ("step" + n);
  }

  function entryFor(id) {
    if (!progress.steps[id]) {
      progress.steps[id] = { locked: false, passed: false, answers: {}, branches: [] };
    }
    return progress.steps[id];
  }

  // The form is rebuilt by renderSteps, so answers are read out before leaving a step.
  function captureAnswers() {
    const form = document.getElementById("boardForm");
    if (!form || !session) return;
    const answers = {};
    Array.from(form.elements).forEach(function (el) {
      if (el.name) answers[el.name] = el.value;
    });
    entryFor(stepId(step)).answers = answers;
  }

  function restoreAnswers(entry) {
    const form = document.getElementById("boardForm");
    if (!form) return;
    Object.keys(entry.answers || {}).forEach(function (name) {
      const el = form.elements[name];
      if (el && typeof el.value === "string") el.value = entry.answers[name];
    });
  }

  function saveProgress() {
    if (!sessionId || typeof window.pathProgress !== "object") return;
    progress.at = stepId(step);
    // Visiting a step creates an entry; storing the empty ones would grow the blob
    // for nothing and keep a session "started" that was only looked at.
    Object.keys(progress.steps).forEach(function (id) {
      const e = progress.steps[id];
      const empty = !e.locked && !e.passed && !e.branches.length
        && !Object.keys(e.answers || {}).some(function (k) { return String(e.answers[k] || "").trim(); });
      if (empty) delete progress.steps[id];
    });
    window.pathProgress.set(sessionId, progress);
  }
```

Replace `loadStep` (`:468`) with:

```js
  function loadStep(n) {
    step = n;
    activeBranch = 0;
    firstMiss = null;
    stepStarted = Date.now();
    const entry = entryFor(stepId(n));
    stopPassed = !!entry.passed;
    branchLocked = (cur().branches || []).map(function (b) {
      return entry.branches.indexOf(b.id) !== -1;
    });
    locked[n] = !!entry.locked;
    game = new Chess(cur().fen);
    selected = null;
    renderSteps();
    restoreAnswers(entry);
    if (locked[n]) {
      const key = document.getElementById("boardKey");
      key.innerHTML = (cur().branches || []).map(function (b) { return b.key || ""; }).join("")
        + (cur().key || "");
      key.classList.add("show");
    }
    renderBoard();
    saveProgress();
  }
```

In `loadSession` (`:509`), replace the `locked` line and the `loadStep(0)` call:

```js
  function loadSession(id) {
    sessionId = id;
    session = id ? sessions()[id] : null;
    progress = (typeof window.pathProgress === "object" && id)
      ? window.pathProgress.get(id)
      : { at: "", logged: false, steps: {} };
    locked = steps().map(function (s, i) {
      const e = progress.steps[stepId(i)];
      return !!(e && e.locked);
    });
    renderPicker();
    if (!session) {
      document.getElementById("boardTitle").textContent = "No session loaded";
      document.getElementById("boardPrompt").textContent = "Add sessions/*.json and run python3 scripts/bundle_sessions.py";
      return false;
    }
    // Resume where he was; an id that no longer exists falls back to the first step.
    let at = 0;
    steps().forEach(function (s, i) { if (stepId(i) === progress.at) at = i; });
    loadStep(at);
    return true;
  }
```

In `lockStep`, immediately after `locked[step] = true;` (`:435`), record the step
and its branches, and capture the answers:

```js
    locked[step] = true;
    captureAnswers();
    const entry = entryFor(stepId(step));
    entry.locked = true;
    entry.passed = stopPassed;
    entry.branches = (cur().branches || []).filter(function (b, i) { return branchLocked[i]; })
      .map(function (b) { return b.id; });
    saveProgress();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest tests/test_board.py -q`
Expected: PASS (6 tests).

Then the whole suite, because `loadStep` and `loadSession` are on every path:
Run: `python3 -m pytest -q`
Expected: PASS (34 tests).

- [ ] **Step 5: Commit**

```bash
git add session-board.js tests/test_board.py
git commit -m "Keep board step progress across reloads"
```

---

### Task 4: the step strip becomes clickable

**Files:**
- Modify: `session-board.js` — `renderSteps` (`:185`), the `#boardNext` handler (`:867`)
- Test: `tests/test_board.py`

**Interfaces:**
- Consumes: `captureAnswers()`, `saveProgress()`, `loadStep()` from Task 3.
- Produces: `#boardSteps` contains one `<button data-i="N">` per step; the active
  one carries `aria-current="step"`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_board.py`:

```python
def test_step_strip_jumps_without_locking(browser_page, app_url):
    """Any step is reachable at any time, and jumping reveals no key."""
    page = browser_page
    page.goto(app_url(session=STOP_SESSION, tab="session"))
    page.wait_for_selector("#boardTake")

    page.locator("#boardSteps button").nth(2).click()

    assert "Calculate" in page.inner_text("#boardTitle") or page.inner_text("#boardTitle") != ""
    assert "show" not in (page.get_attribute("#boardKey", "class") or ""), "no key from jumping"
    assert page.locator("#boardSteps button").nth(2).get_attribute("aria-current") == "step"
    assert page.errors == []


def test_jumping_keeps_what_was_typed(browser_page, app_url):
    page = browser_page
    page.goto(app_url(session=STOP_SESSION, tab="session"))
    page.wait_for_selector("input[name=scare]")
    page.fill("input[name=scare]", "Nxf5")

    page.locator("#boardSteps button").nth(1).click()
    page.locator("#boardSteps button").nth(0).click()

    assert page.input_value("input[name=scare]") == "Nxf5"
    assert page.errors == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m pytest tests/test_board.py -k "strip or typed" -q`
Expected: FAIL — `#boardSteps button` matches nothing; the strip renders `<span>`s.

- [ ] **Step 3: Write the implementation**

Replace the first statement of `renderSteps` (`:186`):

```js
  function renderSteps() {
    document.getElementById("boardSteps").innerHTML = steps().map(function (s, i) {
      const cls = i === step ? "on" : (locked[i] ? "done" : "");
      const now = i === step ? " aria-current='step'" : "";
      return "<button type='button' class='" + cls + "' data-i='" + i + "'" + now + ">" + esc(s.name) + "</button>";
    }).join("");
    document.getElementById("boardSteps").querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const to = Number(btn.dataset.i);
        if (to === step) return;
        captureAnswers();
        saveProgress();
        loadStep(to);
      });
    });
```

(The rest of `renderSteps` — title, prompt, form, key reset, Next/Lock state,
`renderBranches()`, `renderVariations()` — is unchanged.)

Free navigation makes a disabled Next inconsistent, so `#boardNext` now only
stops at the last step. Replace the handler (`:867`):

```js
    document.getElementById("boardNext").addEventListener("click", function () {
      if (step >= steps().length - 1) return;
      captureAnswers();
      saveProgress();
      loadStep(step + 1);
    });
```

and its disabled rule inside `renderSteps` (`:207`):

```js
    document.getElementById("boardNext").disabled = step >= steps().length - 1;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest -q`
Expected: PASS (36 tests).

- [ ] **Step 5: Commit**

```bash
git add session-board.js tests/test_board.py
git commit -m "Make the board step strip clickable"
```

---

### Task 5: Redo reopens a locked step

**Files:**
- Modify: `index.html:424-426` (the Lock/Next row), `session-board.js`
  (`renderSteps` button state, the Aagaard logging branch at `:446`, wiring at `:860`)
- Test: `tests/test_board.py`

**Interfaces:**
- Consumes: `entryFor`, `saveProgress`, `loadStep` from Task 3.
- Produces: `#boardRedo`, a button that is visible only while the current step is
  locked; `progress.logged`, set once per session with `logAs` and never cleared
  by Redo.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_board.py`:

```python
def test_redo_reopens_a_locked_step(browser_page, app_url):
    page = browser_page
    page.goto(app_url(session=STOP_SESSION, tab="session"))
    page.wait_for_selector("#boardTake")
    fen = "r4rk1/pppq1ppp/2nn2b1/3p1NB1/3P2P1/2PB1P2/P1P4P/R3QRK1 w - - 5 15"

    play(page, fen, ["Qg3", "Nxf5", "gxf5", "Bxf5", "Bxf5", "Qxf5"])
    page.click("#boardTake")
    page.click("#boardLock")
    assert page.is_visible("#boardRedo")

    page.click("#boardRedo")

    assert page.input_value("input[name=scare]") == "", "answers cleared"
    assert "show" not in (page.get_attribute("#boardKey", "class") or ""), "key hidden"
    assert not page.is_disabled("#boardLock"), "solvable again"
    assert page.is_hidden("#boardRedo")
    assert page.errors == []


def test_redo_does_not_write_a_second_aagaard_row(browser_page, app_url):
    step = private_step("aagaard-6-01")
    line, fen = step["solve"]["line"], step["fen"]
    page = browser_page
    page.goto(app_url(session="aagaard-6-01", tab="session"))
    page.wait_for_selector("#boardTake")

    play(page, fen, line)
    page.click("#boardTake")
    page.click("#boardLock")
    page.evaluate("async () => { await window.pathStore.settled(); }")
    assert len(page.evaluate("window.pathStore.state.aagaard")) == 1

    page.click("#boardRedo")
    play(page, fen, line)
    page.click("#boardTake")
    page.click("#boardLock")
    page.evaluate("async () => { await window.pathStore.settled(); }")

    assert len(page.evaluate("window.pathStore.state.aagaard")) == 1, "one row per drill"
    assert page.errors == []
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m pytest tests/test_board.py -k redo -q`
Expected: FAIL — `#boardRedo` does not exist.

- [ ] **Step 3: Write the implementation**

`index.html`, in the Lock row (`:424`):

```html
            <div class="row">
              <button class="btn" type="button" id="boardLock">Lock answers</button>
              <button class="btn ghost hidden" type="button" id="boardRedo" title="Solve this step again">↺ Redo</button>
              <button class="btn ghost" type="button" id="boardNext" disabled>Next</button>
            </div>
```

`session-board.js`, in `renderSteps` next to the Lock/Next state (`:207`):

```js
    document.getElementById("boardRedo").classList.toggle("hidden", !locked[step]);
```

Add the handler above `renderSteps`:

```js
  // Reopen a locked step: answers and key go, the log row stays (one row per drill).
  function redoStep() {
    const entry = entryFor(stepId(step));
    entry.locked = false;
    entry.passed = false;
    entry.answers = {};
    entry.branches = [];
    locked[step] = false;
    saveProgress();
    loadStep(step);
  }
```

Wire it beside the Lock handler (`:860`):

```js
    document.getElementById("boardRedo").addEventListener("click", redoStep);
```

Guard the Aagaard row in `lockStep` (`:446`) so a second pass does not log again:

```js
    if (step === steps().length - 1 && logAs.kind === "aagaard" && typeof window.pathLogAagaard === "function" && !progress.logged) {
```

and directly after that `window.pathLogAagaard({ … });` call:

```js
      progress.logged = true;
      saveProgress();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest -q`
Expected: PASS (38 tests; the two Aagaard ones skip in a checkout without
`sessions/private/`).

- [ ] **Step 5: Commit**

```bash
git add index.html session-board.js tests/test_board.py
git commit -m "Reopen a locked step with Redo"
```

---

### Task 6: board orientation

**Files:**
- Modify: `session-board.js` — module state, `renderBoard` (`:100` onwards),
  `loadSession`, the keydown handler (`:829`); `index.html:394-399` (nav row)
- Test: `tests/test_board.py`

**Interfaces:**
- Consumes: `startOf(fen)` (`:636`), which returns `{ n, black }`.
- Produces: `flipped` (module `let`), `square_index(square, flipped=False)` in
  `tests/test_board.py`, and `#boardFlip`.

- [ ] **Step 1: Write the failing test**

In `tests/test_board.py`, give the helper an orientation and add the test:

```python
def square_index(square, flipped=False):
    """#chessBoard button index for a python-chess square."""
    rank, file = chess.square_rank(square), chess.square_file(square)
    if flipped:
        return rank * 8 + (7 - file)
    return (7 - rank) * 8 + file


def test_board_starts_from_black_for_a_black_session(browser_page, app_url):
    page = browser_page
    page.goto(app_url(session="qVxKt9G0", tab="session"))
    page.wait_for_selector("#chessBoard button")

    # Turned board: the first drawn square is h1, so it carries the rank coordinate "1".
    # From White it is a8 and carries "8".
    assert page.get_attribute("#boardFlip", "aria-pressed") == "true"
    assert "1" in page.locator("#chessBoard button").first.inner_text()

    page.click("#boardFlip")

    assert page.get_attribute("#boardFlip", "aria-pressed") == "false"
    assert "8" in page.locator("#chessBoard button").first.inner_text()
    assert page.errors == []


def test_a_flipped_board_still_plays_the_line(browser_page, app_url):
    """Clicking squares must follow the drawn orientation, not the stored one."""
    page = browser_page
    page.goto(app_url(session="qVxKt9G0", tab="session"))
    page.wait_for_selector("#chessBoard button")
    fen = "r5k1/6pp/1ppB1p2/3p4/3P4/P2b1P2/1P4PP/4R1K1 b - - 1 25"

    board = chess.Board(fen)
    for san in ["Ra7", "Re8+"]:
        move = board.parse_san(san)
        page.locator("#chessBoard button").nth(square_index(move.from_square, True)).click()
        page.locator("#chessBoard button").nth(square_index(move.to_square, True)).click()
        board.push(move)

    assert "Ra7 Re8+" in page.inner_text("#boardStatus")
    assert page.errors == []
```

Every existing call of `square_index` keeps its meaning: those sessions start
with White to move, so `flipped` stays `False`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m pytest tests/test_board.py -k "black_session or flipped_board" -q`
Expected: FAIL — `#boardFlip` does not exist, and the board draws from White.

- [ ] **Step 3: Write the implementation**

`index.html`, in the nav row after `#boardEnd` (`:397`):

```html
              <button class="btn ghost nav" type="button" id="boardFlip" title="Flip the board (f)" aria-label="Flip the board" aria-pressed="false">⇅</button>
```

`session-board.js`, with the other module state:

```js
  // View only: which side is at the bottom. Taken from the session, not stored.
  let flipped = false;
```

In `renderBoard` (`:100`), replace the two axis lines and the two coordinate
conditions:

```js
    const files = flipped ? "hgfedcba".split("") : "abcdefgh".split("");
    const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
```

```js
        if (ri === 7) {            // file letter on the rank nearest the viewer
          const c = document.createElement("span");
          c.className = "coord file";
          c.textContent = f;
          el.appendChild(c);
        }
        if (fi === 0) {            // rank digit on the leftmost drawn file
          const c = document.createElement("span");
          c.className = "coord rank";
          c.textContent = String(r);
          el.appendChild(c);
        }
```

In `loadSession`, right after `session = id ? sessions()[id] : null;`:

```js
    // Orientation belongs to the session: deriving it per step would spin the board
    // between a step where Black is to move and the next where White is.
    flipped = !!session && startOf(session.startFen || (session.steps && session.steps[0] && session.steps[0].fen) || "").black;
```

Add the toggle above `renderSteps`:

```js
  function flipBoard() {
    flipped = !flipped;
    const btn = document.getElementById("boardFlip");
    if (btn) btn.setAttribute("aria-pressed", flipped ? "true" : "false");
    renderBoard();
  }
```

Set the button state at the end of `renderBoard`, so a session load updates it:

```js
    const flipBtn = document.getElementById("boardFlip");
    if (flipBtn) flipBtn.setAttribute("aria-pressed", flipped ? "true" : "false");
```

Wire the click beside the other nav buttons, and the key in the keydown handler
(`:829`), before the `dir` lookup:

```js
      if (e.key === "f") { e.preventDefault(); flipBoard(); return; }
```

```js
    document.getElementById("boardFlip").addEventListener("click", flipBoard);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest -q`
Expected: PASS (40 tests).

- [ ] **Step 5: Verify in the browser and commit**

```bash
node --check session-board.js
open index.html
```

Check by eye: the simul session opens with Black at the bottom, the coordinates
sit on the near rank and the left file, `f` turns it, and the pieces still move.

```bash
git add index.html session-board.js tests/test_board.py
git commit -m "Turn the board around for a session played as Black"
```

---

### Task 7: document the behaviour

**Files:**
- Modify: `HANDOFF.md` §3 (Board tab, Storage) and §8

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Update the Board tab section**

In HANDOFF §3, under **Board tab**, add after the navigation bullet:

```markdown
- **Steps:** the strip above the board is clickable — any step, any time, in both
  directions. Jumping shows the same empty form a first visit shows; a key still
  appears only on Lock. **↺ Redo** reopens a locked step (answers and key go, the
  Aagaard log row stays — one row per drill).
- **Orientation:** ⇅ or `f` turns the board. The side at the bottom comes from the
  session's `startFen`, so a game played as Black opens from Black's side and does
  not spin between steps.
```

And under **Storage**, after the `variations` sentence:

```markdown
Board progress lives in `state.progress[sessionId]` — `{ at, logged, steps }`,
keyed by **step id** so re-authoring a session can only retire an entry, never
move a ✓ onto a different step. `window.pathProgress.get/set` is the hook.
```

- [ ] **Step 2: Update §8 Next**

Remove the now-done item and leave the Aagaard and `author_session.py --json`
items in place.

- [ ] **Step 3: Verify the suite one more time**

Run: `python3 -m pytest -q`
Expected: PASS (40 tests).

- [ ] **Step 4: Commit**

```bash
git add HANDOFF.md
git commit -m "Document step navigation, Redo and board orientation"
```

---

## Self-review notes

- **Spec coverage:** clickable strip → Task 4; persistence → Tasks 1–3;
  Redo without a second log row → Task 5; orientation → Task 6; the
  "keys only on Lock" guarantee is asserted in Task 4's first test;
  id-keying is asserted in Task 1 and honoured by `stepId` everywhere.
- **The one behaviour change not in the spec:** `#boardNext` is no longer
  gated on the lock (Task 4), because a disabled Next beside a clickable
  strip is a contradiction. The lock still gates the key, which is the part
  that matters.
- **Not built, deliberately:** a per-step "skipped" mark, a second Aagaard log
  row on a repeat, and restoring the board position on return — variations
  already cover the last one.
