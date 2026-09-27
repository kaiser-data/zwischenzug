import json
import pathlib

import chess
import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOLVE_SESSION = "aagaard-6-01"
STOP_SESSION = "XbhWoWMi"


def square_index(square, flipped=False):
    """#chessBoard button index for a python-chess square (rank 8 first, or rank 1 when flipped)."""
    rank, file = chess.square_rank(square), chess.square_file(square)
    if flipped:
        return rank * 8 + (7 - file)
    return (7 - rank) * 8 + file


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


def test_full_board_line_locks_by_itself(browser_page, app_url):
    """No Use board line, no Lock: the board grades the line when it reaches full length."""
    step = private_step(SOLVE_SESSION)
    line, fen = step["solve"]["line"], step["fen"]
    page = browser_page
    page.goto(app_url(session=SOLVE_SESSION, tab="session"))
    page.wait_for_selector("#boardTake")

    play(page, fen, line)

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


def test_step_strip_jumps_without_locking(browser_page, app_url):
    """Any step is reachable at any time, and jumping reveals no key."""
    page = browser_page
    page.goto(app_url(session=STOP_SESSION, tab="session"))
    page.wait_for_selector("#boardTake")
    first_title = page.inner_text("#boardTitle")

    page.locator("#boardSteps button").nth(2).click()

    assert page.inner_text("#boardTitle") != first_title, "a different step is open"
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


def test_redo_reopens_a_locked_step(browser_page, app_url):
    page = browser_page
    page.goto(app_url(session=STOP_SESSION, tab="session"))
    page.wait_for_selector("#boardTake")
    fen = "r4rk1/pppq1ppp/2nn2b1/3p1NB1/3P2P1/2PB1P2/P1P4P/R3QRK1 w - - 5 15"

    play(page, fen, ["Qg3", "Nxf5", "gxf5", "Bxf5", "Bxf5", "Qxf5"])
    assert page.is_visible("#boardRedo")

    page.click("#boardRedo")

    assert page.input_value("input[name=scare]") == "", "answers cleared"
    assert "show" not in (page.get_attribute("#boardKey", "class") or ""), "key hidden"
    assert not page.is_disabled("#boardLock"), "solvable again"
    assert page.is_hidden("#boardRedo")
    assert page.errors == []


def test_redo_does_not_write_a_second_aagaard_row(browser_page, app_url):
    step = private_step(SOLVE_SESSION)
    line, fen = step["solve"]["line"], step["fen"]
    page = browser_page
    page.goto(app_url(session=SOLVE_SESSION, tab="session"))
    page.wait_for_selector("#boardTake")

    play(page, fen, line)
    page.evaluate("async () => { await window.pathStore.settled(); }")
    assert len(page.evaluate("window.pathStore.state.aagaard")) == 1

    page.click("#boardRedo")
    play(page, fen, line)
    page.evaluate("async () => { await window.pathStore.settled(); }")

    assert len(page.evaluate("window.pathStore.state.aagaard")) == 1, "one row per drill"
    assert page.errors == []


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


def test_f_turns_the_board(browser_page, app_url):
    page = browser_page
    page.goto(app_url(session="qVxKt9G0", tab="session"))
    page.wait_for_selector("#chessBoard button")
    page.locator("#boardTitle").click()          # focus off any input, so the key reaches the board

    page.keyboard.press("f")

    assert page.get_attribute("#boardFlip", "aria-pressed") == "false"
    assert page.errors == []


CLEAN_SESSION = "6yfxgu80"


def public_step(session_id, step_id):
    data = json.load((ROOT / "sessions" / (session_id + ".json")).open())
    return next(s for s in data["steps"] if s["id"] == step_id)


def test_category_names_the_follow_up(browser_page, app_url):
    page = browser_page
    page.goto(app_url(session=CLEAN_SESSION, tab="session"))
    page.wait_for_selector("#chessBoard button")

    assert page.is_visible("#boardCategory")
    assert page.inner_text("#boardCategory").startswith("Clean")
    labels = page.eval_on_selector_all("#sessionPick optgroup", "gs => gs.map(g => g.label)")
    assert "Games · Clean" in labels and "Games · Leak" in labels
    assert page.errors == []


def test_clean_game_needs_the_line_to_the_last_capture(browser_page, app_url):
    step = public_step(CLEAN_SESSION, "knockout")
    line, fen = step["solve"]["line"], step["fen"]
    page = browser_page
    page.goto(app_url(session=CLEAN_SESSION, tab="session"))
    page.wait_for_selector("#boardSteps button")
    page.locator("#boardSteps button").nth(1).click()
    page.wait_for_selector("#boardTake")
    page.fill("input[name=left]", "an exchange and a pawn")

    # Where he stopped at the board: Qxh8+ is ply 5 of 8.
    play(page, fen, line[:5])
    page.click("#boardTake")
    page.click("#boardLock")
    assert "stopped at ply 5" in page.inner_text("#boardErr")

    page.click("#boardReset")
    play(page, fen, line)                       # full length: graded without Lock
    assert page.is_visible("#boardKey")
    assert "Rxc8" in page.inner_text("#boardKey")
    assert page.errors == []


def open_step(page, app_url, session_id, index):
    page.goto(app_url(session=session_id, tab="session"))
    page.wait_for_selector("#boardSteps button")
    page.locator("#boardSteps button").nth(index).click()


def test_written_branch_hides_its_line(browser_page, app_url):
    step = public_step(CLEAN_SESSION, "defence")
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 2)
    page.wait_for_selector("input[name=line]")

    first = page.locator("#branchList button").first.inner_text()
    assert "Qxc3" in first and "Nxc3" not in first, "only the given ply"
    assert "need" not in page.inner_text("#boardStatus")

    page.fill("input[name=line]", "15. Bxd7+")
    page.press("input[name=line]", "Enter")
    assert "leaves the line" in page.inner_text("#boardErr")

    page.fill("input[name=line]", "15. Nxc3 Nxd6 16. Qxh8+ Ke7 17. Qxa8")
    page.press("input[name=line]", "Enter")
    assert "Locked. Next:" in page.inner_text("#boardErr")
    assert "✓" in page.locator("#branchList button").first.inner_text()
    assert "15." not in page.locator("#branchList button").nth(1).inner_text(), "next line still hidden"
    assert step["branches"][0]["mustPlay"][-1] == "Qxa8"
    assert page.errors == []


def test_written_branch_on_the_board_locks_itself(browser_page, app_url):
    step = public_step(CLEAN_SESSION, "defence")
    mate = step["branches"][1]
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 2)
    page.locator("#branchList button").nth(1).click()

    play(page, step["fen"], mate["mustPlay"])

    assert "Locked. Next:" in page.inner_text("#boardErr")
    assert "✓" in page.locator("#branchList button").nth(1).inner_text()
    assert page.errors == []


def test_an_accepted_alternative_passes(browser_page, app_url):
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 2)
    page.locator("#branchList button").nth(3).click()

    page.fill("input[name=line]", "14. Qxc5")
    page.press("input[name=line]", "Enter")

    assert "✓" in page.locator("#branchList button").nth(3).inner_text()
    assert page.errors == []


def test_played_line_locks_the_step_by_itself(browser_page, app_url):
    step = public_step(CLEAN_SESSION, "opening")
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 0)
    page.fill("input[name=material]", "a pawn up")
    page.select_option("select[name=concession]", "same")
    page.fill("textarea[name=bd6]", "castling")

    play(page, step["fen"], step["mustPlay"])

    assert page.is_visible("#boardKey")
    assert page.is_disabled("#boardLock")
    assert page.errors == []


def test_questions_come_after_the_line(browser_page, app_url):
    step = public_step(CLEAN_SESSION, "opening")
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 0)

    play(page, step["fen"], step["mustPlay"])
    assert "Answer the questions" in page.inner_text("#boardErr")
    assert not page.is_disabled("#boardLock")

    page.fill("input[name=material]", "a pawn up")
    page.select_option("select[name=concession]", "same")
    page.fill("textarea[name=bd6]", "castling")
    page.press("input[name=material]", "Enter")
    assert page.is_disabled("#boardLock")
    assert page.errors == []


def test_typed_solve_line_needs_no_replay(browser_page, app_url):
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 1)
    page.fill("input[name=left]", "an exchange and a pawn")
    page.fill("input[name=line]", "13. Qd4 Ne4 14. Qxg7 Nxd6 15. Qxh8+ Ke7 16. Qxc8 Rxc8")

    page.press("input[name=line]", "Enter")

    assert page.is_visible("#boardKey")
    assert "Rxc8" in page.inner_text("#boardStatus")
    assert page.errors == []


def test_locked_branches_survive_a_reload(browser_page, app_url):
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 2)
    page.fill("input[name=line]", "15. Nxc3 Nxd6 16. Qxh8+ Ke7 17. Qxa8")
    page.press("input[name=line]", "Enter")
    page.evaluate("async () => { await window.pathStore.settled(); }")

    page.reload()
    page.wait_for_selector("#branchList button")

    assert "✓" in page.locator("#branchList button").first.inner_text()
    assert "on" in (page.locator("#branchList button").nth(1).get_attribute("class") or "")
    assert page.errors == []
