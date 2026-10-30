"""Invited players: their game sessions play through end to end, and a guest sees only their own games."""
import json
import pathlib

import pytest


ROOT = pathlib.Path(__file__).resolve().parent.parent
PLAYER_SESSIONS = sorted(p for p in (ROOT / "sessions").glob("*.json") if json.loads(p.read_text()).get("player"))


@pytest.mark.parametrize("path", PLAYER_SESSIONS, ids=lambda p: p.stem)
def test_player_session_plays_through(browser_page, app_url, path):
    """Every step: written lines typed, shown lines played, questions answered, then locked and green."""
    session = json.loads(path.read_text())
    page = browser_page
    page.goto(app_url(session=session["id"], tab="session"))
    page.wait_for_selector("#boardSteps button")
    for i, step in enumerate(session["steps"]):
        page.locator("#boardSteps button").nth(i).click()
        page.wait_for_function("t => document.getElementById('boardTitle').textContent === t", arg=step["title"])
        branches = step.get("branches") or []
        for k, b in enumerate(branches):
            if k:                                  # the solved card's button opens the next one
                page.click("#branchList .task-go")
            assert f"card {k + 1} of" in page.text_content("#branchList .task-kind")
            if b.get("write"):
                given = b.get("given", 1)
                page.fill("#branchWrite input[name=line]", " ".join(b["mustPlay"][given:]))
                page.wait_for_timeout(400)                # a full line solves the card as it is typed
                if not page.query_selector("#branchList .tcard.done"):
                    page.click("#branchWrite .task-check")
            else:
                for _ in b["mustPlay"]:
                    page.click("#branchList .task-step")
            page.wait_for_selector("#branchList .tcard.done", timeout=5000)
        if branches and step.get("questions"):
            page.click("#branchList .task-go")     # "Last: one question →"
            assert page.is_visible("#taskAnswer")
        if step.get("questions"):
            for q in step["questions"]:
                if q["type"] == "select":
                    page.select_option(f"[name={q['name']}]", q["options"][1]["value"])
                else:
                    page.fill(f"[name={q['name']}]", "x")
        if not page.is_disabled("#boardLock"):
            page.click("#boardLock")
        page.wait_for_function("document.getElementById('boardLock').disabled", timeout=5000)
        assert page.is_disabled("#boardLock"), f"step {step['id']} did not lock: {page.inner_text('#boardErr')}"
        assert page.inner_text("#boardKey").strip(), f"step {step['id']} shows no key"
    assert page.errors == []


def test_guest_sees_only_training_and_own_games(browser_page, app_url):
    """PATH_VIEWER (set by hosted.js for an invitee) filters the picker; the owner's games stay hidden."""
    page = browser_page
    page.add_init_script("window.PATH_VIEWER = { player: 'nico' }; localStorage.setItem('zz_role', 'guest');")
    page.goto(app_url(tab="session"))
    page.wait_for_selector("#sessionPick option", state="attached")
    options = page.eval_on_selector_all("#sessionPick option", "os => os.map(o => o.value)")
    assert "2xz7ugnc" in options
    assert all(o == "2xz7ugnc" or o.startswith("training-") for o in options), options
    assert page.input_value("#sessionPick") == "2xz7ugnc", "an unfinished own game opens first"
    page.wait_for_function("document.getElementById('trainingLevel')")
    level = page.evaluate("window.pathStore.state.training.level")
    assert level == 1350, "the level comes from sessions/players.js until the player sets one"


def test_owner_sees_player_games_under_their_name(browser_page, app_url):
    page = browser_page
    page.goto(app_url(tab="session"))
    page.wait_for_selector("#sessionPick option", state="attached")
    groups = page.eval_on_selector_all("#sessionPick optgroup", "gs => gs.map(g => g.label)")
    assert "Games · Nico" in groups
    assert page.errors == []
