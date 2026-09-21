import json
import pathlib

import chess
import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOLVE_SESSION = "aagaard-6-01"
STOP_SESSION = "XbhWoWMi"


def square_index(square):
    """#chessBoard button index for a python-chess square (rank 8 first)."""
    return (7 - chess.square_rank(square)) * 8 + chess.square_file(square)


def play(page, fen, sans):
    board = chess.Board(fen)
    for san in sans:
        move = board.parse_san(san)
        page.locator("#chessBoard button").nth(square_index(move.from_square)).click()
        page.locator("#chessBoard button").nth(square_index(move.to_square)).click()
        board.push(move)
    return board


def private_step(session_id):
    path = ROOT / "sessions" / "private" / (session_id + ".json")
    if not path.exists():
        pytest.skip("private drills are not present in this checkout")
    return json.load(path.open())["steps"][0]


def test_use_board_line_fills_and_grades(browser_page, app_url):
    step = private_step(SOLVE_SESSION)
    line, fen = step["solve"]["line"], step["fen"]
    page = browser_page
    page.goto(app_url(session=SOLVE_SESSION, tab="session"))
    page.wait_for_selector("#boardTake")

    assert page.is_disabled("#boardTake"), "nothing on the board yet"

    play(page, fen, line[:2])
    assert "(2 ply)" in page.inner_text("#boardTake")
    page.click("#boardTake")
    assert page.input_value("input[name=line]").startswith(fen.split()[5] + ". ")

    page.click("#boardLock")
    assert "stopped at ply 2" in page.inner_text("#boardErr")


def test_miss_rewinds_board_to_the_failing_ply(browser_page, app_url):
    step = private_step(SOLVE_SESSION)
    line, fen = step["solve"]["line"], step["fen"]
    page = browser_page
    page.goto(app_url(session=SOLVE_SESSION, tab="session"))
    page.wait_for_selector("#boardTake")

    board = play(page, fen, line[:2])
    wrong = next(
        board.san(m)
        for m in board.legal_moves
        if board.san(m).rstrip("+#") != line[2].rstrip("+#")
    )
    play(page, board.fen(), [wrong])
    page.click("#boardTake")
    page.click("#boardLock")

    assert "Ply 3" in page.inner_text("#boardErr")
    assert "▶ 1 more" in page.inner_text("#boardStatus")


def test_full_line_locks_without_replaying(browser_page, app_url):
    step = private_step(SOLVE_SESSION)
    line, fen = step["solve"]["line"], step["fen"]
    page = browser_page
    page.goto(app_url(session=SOLVE_SESSION, tab="session"))
    page.wait_for_selector("#boardTake")

    play(page, fen, line)
    page.click("#boardTake")
    page.click("#boardStart")
    page.click("#boardLock")

    assert page.is_disabled("#boardLock")
    assert "show" in (page.get_attribute("#boardKey", "class") or "")
    assert page.is_disabled("#boardTake")
    assert page.errors == []


def test_enter_locks_without_reloading(browser_page, app_url):
    private_step("aagaard-6-02")  # skips the test when the private drills are absent
    page = browser_page
    page.goto(app_url(session="aagaard-6-02", tab="session"))
    page.wait_for_selector("input[name=line]")
    page.fill("input[name=line]", "Kh1")
    before = page.url

    page.press("input[name=line]", "Enter")
    page.wait_for_timeout(300)

    assert page.url == before
    assert page.input_value("input[name=line]") == "Kh1"
    assert page.inner_text("#boardErr") != ""


def test_stop_ply_splits_the_board_line(browser_page, app_url):
    page = browser_page
    page.goto(app_url(session=STOP_SESSION, tab="session"))
    page.wait_for_selector("#boardTake")
    fen = "r4rk1/pppq1ppp/2nn2b1/3p1NB1/3P2P1/2PB1P2/P1P4P/R3QRK1 w - - 5 15"

    play(page, fen, ["Nxd6"])
    page.click("#boardTake")
    assert "Start the board line with Qg3" in page.inner_text("#boardErr")

    page.click("#boardReset")
    play(page, fen, ["Qg3", "Nxf5", "gxf5", "Bxf5", "Bxf5"])
    page.click("#boardTake")

    assert page.input_value("input[name=scare]") == "Nxf5"
    assert page.input_value("input[name=continue]") == "16. gxf5 Bxf5 17. Bxf5"
    assert page.errors == []


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
    # Resuming lands back on that step, so it reads "on"; it reads "done" from elsewhere.
    assert page.locator("#boardSteps > *").first.get_attribute("class") == "on"
    page.click("#boardNext")
    assert page.locator("#boardSteps > *").first.get_attribute("class") == "done"
    assert page.errors == []
