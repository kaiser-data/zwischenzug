def test_aagaard_entry_survives_reload(browser_page, app_url):
    page = browser_page
    page.goto(app_url(tab="log"))
    page.wait_for_function("typeof window.pathLogAagaard === 'function'")
    page.evaluate(
        """async () => {
            await window.pathStore.settled();
            window.pathLogAagaard({
                date: "2026-09-13", chapter: 6, exercise: 1,
                minutes: 7, result: "short", ply: 3, note: "test"
            });
            await window.pathStore.settled();
        }"""
    )

    page.reload()
    page.wait_for_function("typeof window.pathLogAagaard === 'function'")
    entries = page.evaluate("window.pathStore.state.aagaard")

    assert len(entries) == 1
    assert entries[0]["exercise"] == 1
    assert entries[0]["ply"] == 3

    list_text = page.evaluate("document.getElementById('aagaardList').textContent")
    assert "6.1" in list_text
    assert "stopped short" in list_text
    assert "at ply 3" in list_text
    assert "7m" in list_text
    assert "test" in list_text
    assert page.errors == []


def test_variation_survives_reload(browser_page, app_url):
    page = browser_page
    page.goto(app_url(tab="log"))
    page.wait_for_function("typeof window.pathVariations === 'object'")
    page.evaluate(
        """async () => {
            window.pathVariations.set("s1:step1", [{ moves: ["e4", "e5"], note: "n" }]);
            await window.pathStore.settled();
        }"""
    )

    page.reload()
    page.wait_for_function("typeof window.pathVariations === 'object'")
    lines = page.evaluate("window.pathVariations.get('s1:step1')")

    assert lines[0]["moves"] == ["e4", "e5"]
    assert page.errors == []


def test_variation_with_malformed_moves_does_not_throw(browser_page, app_url):
    """Mirrors what a hand-edited/truncated JSON import writes: mergeShaped only
    checks the top-level `variations` shape (plain object), not what's inside it,
    so a line missing a proper `moves` array can reach storage. pathVariations.get
    must tolerate that instead of throwing when session-board.js reads it back."""
    page = browser_page
    page.goto(app_url(tab="log"))
    page.wait_for_function("typeof window.pathVariations === 'object'")
    page.evaluate(
        """async () => {
            localStorage.setItem(window.PathStore.KEY, JSON.stringify({
                variations: { "s1:bad": { moves: null } }
            }));
        }"""
    )

    page.reload()
    page.wait_for_function("typeof window.pathVariations === 'object'")
    lines = page.evaluate("window.pathVariations.get('s1:bad')")

    assert lines == []
    assert page.errors == []


def test_store_is_local_backend_on_file_url(browser_page, app_url):
    page = browser_page
    page.goto(app_url())
    page.wait_for_function("window.pathStore !== undefined")
    assert page.evaluate("window.pathStore.backend") == "local"
    assert page.errors == []


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
