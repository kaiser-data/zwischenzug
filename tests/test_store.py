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


def test_hydrate_empty_storage_gives_blank(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    result = page.evaluate(
        """async () => {
            localStorage.clear();
            const store = window.PathStore.local();
            const state = await store.hydrate();
            return { games: state.games.length, backend: store.backend };
        }"""
    )
    assert result == {"games": 0, "backend": "local"}


def test_commit_then_hydrate_round_trips(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    games = page.evaluate(
        """async () => {
            localStorage.clear();
            const a = window.PathStore.local();
            await a.hydrate();
            a.state.games.push({ event: "test", result: "1-0" });
            await a.commit();
            const b = window.PathStore.local();
            const state = await b.hydrate();
            return state.games;
        }"""
    )
    assert games == [{"event": "test", "result": "1-0"}]


def test_state_identity_is_stable_across_commits(browser_page, harness_url):
    """index.html keeps a local alias of state; commit must not replace the object."""
    page = browser_page
    page.goto(harness_url)
    same = page.evaluate(
        """async () => {
            const store = window.PathStore.local();
            const first = await store.hydrate();
            await store.commit();
            return first === store.state;
        }"""
    )
    assert same is True


def test_unknown_keys_survive_hydrate(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    kept = page.evaluate(
        """async () => {
            localStorage.setItem(window.PathStore.KEY, JSON.stringify({ futureField: 42 }));
            const store = window.PathStore.local();
            const state = await store.hydrate();
            return state.futureField;
        }"""
    )
    assert kept == 42


def test_corrupt_storage_does_not_throw(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    games = page.evaluate(
        """async () => {
            localStorage.setItem(window.PathStore.KEY, "{not json");
            const store = window.PathStore.local();
            const state = await store.hydrate();
            return state.games.length;
        }"""
    )
    assert games == 0
    assert page.errors == []


def test_settled_resolves_after_commit(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    ok = page.evaluate(
        """async () => {
            const store = window.PathStore.local();
            await store.hydrate();
            store.commit();
            return await store.settled();
        }"""
    )
    assert ok is True


def test_hydrate_rejects_bad_shapes_and_keeps_blank_defaults(browser_page, harness_url):
    """A stored value only replaces the default when it matches the default's shape:
    array for sessions/games/aagaard, plain object for blitz/checks/variations.
    null, wrong-typed values, or primitives fall back to the blank default."""
    page = browser_page
    page.goto(harness_url)
    result = page.evaluate(
        """async () => {
            localStorage.setItem(window.PathStore.KEY, JSON.stringify({
                games: null,
                blitz: [1, 2, 3],
                sessions: "not-an-array",
                checks: 42,
                aagaard: { nope: true },
                variations: null
            }));
            const store = window.PathStore.local();
            const state = await store.hydrate();
            // Must not throw: games must be a real array to push onto.
            state.games.push({ event: "after-hydrate" });
            return {
                games: state.games,
                blitz: state.blitz,
                sessions: state.sessions,
                checks: state.checks,
                aagaard: state.aagaard,
                variations: state.variations
            };
        }"""
    )
    assert result == {
        "games": [{"event": "after-hydrate"}],
        "blitz": {},
        "sessions": [],
        "checks": {},
        "aagaard": [],
        "variations": {},
    }


def test_unknown_keys_survive_hydrate_with_shape_guard(browser_page, harness_url):
    """Guard regression: the shape-checking merge must still preserve unknown keys."""
    page = browser_page
    page.goto(harness_url)
    kept = page.evaluate(
        """async () => {
            localStorage.setItem(window.PathStore.KEY, JSON.stringify({ futureField: 42 }));
            const store = window.PathStore.local();
            const state = await store.hydrate();
            return state.futureField;
        }"""
    )
    assert kept == 42


def test_hydrate_survives_backend_that_throws_synchronously(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    result = page.evaluate(
        """async () => {
            let unhandled = false;
            window.addEventListener("unhandledrejection", () => { unhandled = true; });
            const store = window.PathStore.create({
                name: "throws-sync",
                read: function () { throw new Error("boom"); },
                write: function () { return true; }
            });
            const state = await store.hydrate();
            await new Promise((resolve) => setTimeout(resolve, 0));
            return { games: state.games.length, unhandled: unhandled };
        }"""
    )
    assert result == {"games": 0, "unhandled": False}
    assert page.errors == []


def test_hydrate_survives_backend_that_rejects(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    result = page.evaluate(
        """async () => {
            let unhandled = false;
            window.addEventListener("unhandledrejection", () => { unhandled = true; });
            const store = window.PathStore.create({
                name: "rejects",
                read: function () { return Promise.reject(new Error("boom")); },
                write: function () { return true; }
            });
            const state = await store.hydrate();
            await new Promise((resolve) => setTimeout(resolve, 0));
            return { games: state.games.length, unhandled: unhandled };
        }"""
    )
    assert result == {"games": 0, "unhandled": False}
    assert page.errors == []


def test_commit_resolves_false_when_backend_throws_synchronously(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    result = page.evaluate(
        """async () => {
            let unhandled = false;
            window.addEventListener("unhandledrejection", () => { unhandled = true; });
            const store = window.PathStore.create({
                name: "throws-sync-write",
                read: function () { return {}; },
                write: function () { throw new Error("boom"); }
            });
            await store.hydrate();
            const ok = await store.commit();
            await new Promise((resolve) => setTimeout(resolve, 0));
            return { ok: ok, unhandled: unhandled };
        }"""
    )
    assert result == {"ok": False, "unhandled": False}
    assert page.errors == []


def test_commit_before_hydrate_resolves_false_and_does_not_write(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    result = page.evaluate(
        """async () => {
            let resolveRead;
            let writeCount = 0;
            const store = window.PathStore.create({
                name: "slow",
                read: function () {
                    return new Promise((resolve) => { resolveRead = resolve; });
                },
                write: function () { writeCount++; return true; }
            });

            const hydrating = store.hydrate();

            const earlyOk = await store.commit();
            const earlyWriteCount = writeCount;

            resolveRead({});
            await hydrating;

            const lateOk = await store.commit();
            const lateWriteCount = writeCount;

            return { earlyOk, earlyWriteCount, lateOk, lateWriteCount };
        }"""
    )
    assert result == {
        "earlyOk": False,
        "earlyWriteCount": 0,
        "lateOk": True,
        "lateWriteCount": 1,
    }


def test_commit_after_failed_hydrate_still_writes(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    result = page.evaluate(
        """async () => {
            let writeCount = 0;
            const store = window.PathStore.create({
                name: "rejects-read",
                read: function () { return Promise.reject(new Error("boom")); },
                write: function () { writeCount++; return true; }
            });

            await store.hydrate();
            const ok = await store.commit();

            return { ok, writeCount };
        }"""
    )
    assert result == {"ok": True, "writeCount": 1}


def test_commit_resolves_false_when_backend_rejects_and_fire_and_forget_is_safe(browser_page, harness_url):
    page = browser_page
    page.goto(harness_url)
    result = page.evaluate(
        """async () => {
            let unhandled = false;
            window.addEventListener("unhandledrejection", () => { unhandled = true; });
            const store = window.PathStore.create({
                name: "rejects-write",
                read: function () { return {}; },
                write: function () { return Promise.reject(new Error("boom")); }
            });
            await store.hydrate();
            // Fire-and-forget, exactly like index.html does.
            store.commit();
            const ok = await store.settled();
            await new Promise((resolve) => setTimeout(resolve, 0));
            return { ok: ok, unhandled: unhandled };
        }"""
    )
    assert result == {"ok": False, "unhandled": False}
    assert page.errors == []
