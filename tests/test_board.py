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


SPOKEN = [
    ("Springer schlägt c3", "Nxc3"),
    ("Dame h8 Schach", "Qh8+"),
    ("König e7", "Ke7"),
    ("Läufer schlägt c6 Schach, Bauer b schlägt c6", "Bxc6+ bxc6"),
    ("e schlägt d5", "exd5"),
    ("Springer b d7", "Nbd7"),
    ("kurze Rochade", "O-O"),
    ("Rochade lang", "O-O-O"),
    ("e8 Dame", "e8=Q"),
    ("Dame c7 matt", "Qc7#"),
    ("Sf3 Lxc6+ Dxg7 Txe8+", "Nf3 Bxc6+ Qxg7 Rxe8+"),
    ("knight takes c3 queen to h8 check", "Nxc3 Qh8+"),
    ("Springer Zeh drei", "Nc3"),
    ("13. Qd4 Ne4 14. Qxg7", "Qd4 Ne4 Qxg7"),
    ("15. Nxc33", "Nxc33"),                     # unknown stays, so the grader can call it illegal
]


@pytest.mark.parametrize("spoken,san", SPOKEN)
def test_spoken_moves_become_san(browser_page, app_url, spoken, san):
    page = browser_page
    page.goto(app_url(session=CLEAN_SESSION, tab="session"))
    page.wait_for_selector("#chessBoard button")
    assert page.evaluate("t => window.pathSpokenToSan(t)", spoken) == san


def test_a_dictated_line_solves_the_step(browser_page, app_url):
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 1)
    page.fill("input[name=left]", "Qualität und Bauer")
    page.fill("input[name=line]", "Dame d4 Springer e4, Dame schlägt g7 Springer schlägt d6. "
                                  "Dame h8 Schach König e7 Dame c8 Turm c8")

    page.press("input[name=line]", "Enter")

    assert page.is_visible("#boardKey"), page.inner_text("#boardErr")
    assert page.errors == []


def test_undo_word_drops_the_last_move(browser_page, app_url):
    page = browser_page
    page.goto(app_url(session=CLEAN_SESSION, tab="session"))
    page.wait_for_selector("#chessBoard button")
    assert page.evaluate("t => window.pathSpokenToSan(t)", "Springer c3 Springer d6 zurück Springer f6") == "Nc3 Nf6"
    assert page.evaluate("t => window.pathSpokenToSan(t)", "Nc3 Nd6 back") == "Nc3"


def test_board_follows_the_answer_box(browser_page, app_url):
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 1)
    page.fill("input[name=line]", "Dame d4 Springer e4")
    page.wait_for_timeout(400)
    assert "Qd4 Ne4" in page.inner_text("#boardStatus")

    page.fill("input[name=line]", "Dame d4 Springer e4 zurück")
    page.wait_for_timeout(400)
    status = page.inner_text("#boardStatus")
    assert "Qd4" in status and "Ne4" not in status
    assert page.errors == []


def test_a_bad_move_mid_line_is_named(browser_page, app_url):
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 1)
    page.fill("input[name=line]", "13. Qd4 Qh5 14. Qxg7")
    page.wait_for_timeout(400)
    assert "Qh5" in page.inner_text("#boardErr")
    assert "Qd4" in page.inner_text("#boardStatus")


def test_a_dictated_full_line_checks_itself(browser_page, app_url):
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 1)
    page.fill("input[name=left]", "Qualität und Bauer")
    page.fill("input[name=line]", "Dame d4 Springer e4 Dame schlägt g7 Springer schlägt d6 "
                                  "Dame h8 Schach König e7 Dame c8 Turm c8")
    page.wait_for_timeout(500)

    assert page.is_visible("#boardKey"), page.inner_text("#boardErr")
    assert page.errors == []


def test_board_follows_a_written_branch_from_its_given_moves(browser_page, app_url):
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 2)
    page.fill("input[name=line]", "Springer schlägt c3")
    page.wait_for_timeout(400)
    assert "Ne4 Qxg7 Qxc3 Nxc3" in page.inner_text("#boardStatus")


def test_reset_word_clears_the_line(browser_page, app_url):
    page = browser_page
    page.goto(app_url(session=CLEAN_SESSION, tab="session"))
    page.wait_for_selector("#chessBoard button")
    spoken = "t => window.pathSpokenToSan(t)"
    assert page.evaluate(spoken, "Dame d4 Springer e4 reset Dame c1") == "Qc1"
    assert page.evaluate(spoken, "Dame d4 von vorne Turm e1") == "Re1"
    assert page.evaluate(spoken, "Qd4 Ne4 zurücksetzen") == ""


def test_voice_goes_into_the_answer_box_and_the_board(browser_page, app_url):
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 1)
    apply = "t => window.pathVoiceApply(t)"

    page.evaluate(apply, "Queen d4")
    page.evaluate(apply, "Knife e four")                 # what the chess model sometimes hears
    assert page.input_value("input[name=line]") == "Qd4 Ne4"
    page.wait_for_timeout(400)
    assert "Qd4 Ne4" in page.inner_text("#boardStatus")

    page.evaluate(apply, "back")
    assert page.input_value("input[name=line]") == "Qd4"
    page.evaluate(apply, "reset")
    assert page.input_value("input[name=line]") == ""
    assert page.errors == []


def test_voice_plays_on_the_board_when_there_is_no_answer_box(browser_page, app_url):
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 0)           # a replay step: the moves go on the board
    page.evaluate("t => window.pathVoiceApply(t)", "knight e2")
    assert "Ne2" in page.inner_text("#boardStatus")
    page.evaluate("t => window.pathVoiceApply(t)", "zurück")
    assert page.inner_text("#boardStatus").startswith("White to move · ▶ 1 more"), "stepped back"
    page.evaluate("t => window.pathVoiceApply(t)", "king e5")
    assert "not legal" in page.inner_text("#voiceHeard")
    assert page.errors == []


def test_mic_says_how_to_start_the_server_when_it_is_off(browser_page, app_url):
    page = browser_page
    page.add_init_script("window.PATH_VOICE_URL = 'http://127.0.0.1:9'")
    page.goto(app_url(session=CLEAN_SESSION, tab="session"))
    page.wait_for_selector("#boardMic")
    page.wait_for_timeout(500)
    assert page.get_attribute("#boardMic", "aria-disabled") == "true"

    page.dispatch_event("#boardMic", "pointerdown")
    assert "voice_server.py" in page.inner_text("#voiceHeard")
    assert page.errors == []


SEGMENT = """([rate, parts]) => {
  const out = [];
  const push = window.pathMakeSegmenter(rate, f => out.push(f.reduce((a, x) => a + x.length, 0) / rate));
  for (const [secs, amp] of parts) {
    const n = Math.round(secs * rate / 2048);
    for (let k = 0; k < n; k++) {
      const f = new Float32Array(2048);
      for (let i = 0; i < f.length; i++) f[i] = amp * Math.sin((k * 2048 + i) / rate * 2 * Math.PI * 220) + (Math.random() - .5) * 0.004;
      push(f);
    }
  }
  return out;
}"""


def test_listening_cuts_speech_into_utterances(browser_page, app_url):
    page = browser_page
    page.goto(app_url(session=CLEAN_SESSION, tab="session"))
    page.wait_for_selector("#chessBoard button")
    one = page.evaluate(SEGMENT, [48000, [[1, 0], [0.6, 0.3], [1.2, 0]]])
    assert len(one) == 1 and 0.6 <= one[0] <= 1.8, one
    two = page.evaluate(SEGMENT, [48000, [[1, 0], [0.5, 0.3], [1, 0], [0.5, 0.3], [1, 0]]])
    assert len(two) == 2
    click = page.evaluate(SEGMENT, [48000, [[1, 0], [0.05, 0.5], [1.2, 0]]])
    assert click == [], "a click is not a move"


def test_saying_done_locks(browser_page, app_url):
    page = browser_page
    open_step(page, app_url, CLEAN_SESSION, 4)
    page.fill("textarea[name=stop]", "it was already winning")
    page.select_option("select[name=tag]", "clean")
    page.fill("textarea[name=note]", "x")
    page.evaluate("t => window.pathVoiceApply(t)", "fertig")
    assert page.is_disabled("#boardLock")
    assert page.errors == []


FAKE_VOICE = """
window.__calls = []; window.__say = [];
const reply = j => Promise.resolve({ ok: true, json: () => Promise.resolve(j) });
window.fetch = (url, opts) => {
  url = String(url); window.__calls.push(url);
  if (url.includes('/health')) return reply({ ok: true });
  if (url.includes('/samples')) return reply({ en: { count: 0 } });
  if (url.includes('/sample?')) return reply({ saved: 'x', stats: { count: window.__calls.filter(c => c.includes('/sample?')).length } });
  if (url.includes('/transcribe')) {
    const next = window.__say.shift();
    return reply({ text: typeof next === 'function' ? next(url.includes('moves=')) : next });
  }
  return reply({});
};
"""


def voice_page(browser_page, app_url, step):
    page = browser_page
    page.add_init_script(FAKE_VOICE)
    open_step(page, app_url, CLEAN_SESSION, step)
    page.wait_for_function("document.getElementById('boardMic').getAttribute('aria-disabled') === 'false'")
    return page


def say(page, *texts):
    """Queue what the fake server hears, then send one recording per text."""
    for t in texts:
        page.evaluate("t => window.__say.push(t)", t)
        page.evaluate("() => window.pathVoiceUtterance()")


def test_an_illegal_hearing_gets_a_second_pass_held_to_legal_moves(browser_page, app_url):
    page = voice_page(browser_page, app_url, 0)
    page.evaluate("() => window.__say.push(second => second ? 'knight E. two' : 'to E. two')")
    page.evaluate("() => window.pathVoiceUtterance()")
    assert "Ne2" in page.inner_text("#boardStatus").split("·")[1]
    second = [c for c in page.evaluate("window.__calls") if "moves=" in c]
    assert len(second) == 1 and "Ne2" in second[0]


def test_noise_gets_no_second_pass(browser_page, app_url):
    page = voice_page(browser_page, app_url, 0)
    say(page, "[BLANK_AUDIO]")
    assert not [c for c in page.evaluate("window.__calls") if "moves=" in c]
    assert "Did not catch" in page.inner_text("#voiceHeard")


def test_a_correction_after_back_is_kept_as_a_sample(browser_page, app_url):
    page = voice_page(browser_page, app_url, 0)
    page.evaluate("() => localStorage.setItem('zwischenzug_voice_keep', '1')")
    say(page, "knight E. two", "back", "knight F. three")
    samples = [c for c in page.evaluate("window.__calls") if "/sample?" in c]
    assert len(samples) == 1 and "label=Nf3" in samples[0] and "source=correction" in samples[0]
    assert "heard=knight%20E.%20two" in samples[0]


def test_samples_stay_off_unless_he_opts_in(browser_page, app_url):
    page = voice_page(browser_page, app_url, 0)
    say(page, "knight E. two", "back", "knight F. three")
    page.wait_for_timeout(200)
    assert not [c for c in page.evaluate("window.__calls") if "/sample?" in c]


def test_voice_drill_scores_and_saves_each_recording(browser_page, app_url):
    page = voice_page(browser_page, app_url, 0)
    page.click("#voiceDrill summary")
    page.click("#drillStart")
    target = page.inner_text("#drillSay")
    assert target
    page.evaluate("() => window.__say.push(() => document.getElementById('drillSay').textContent)")
    page.evaluate("() => window.pathVoiceUtterance()")
    assert "✓" in page.inner_text("#voiceHeard")
    assert "recognised 1" in page.inner_text("#drillCount")
    saved = [c for c in page.evaluate("window.__calls") if "/sample?" in c]
    assert len(saved) == 1 and "source=drill" in saved[0]
    page.click("#drillStart")
    assert "1 of 1" in page.inner_text("#voiceHeard")
    assert page.errors == []
