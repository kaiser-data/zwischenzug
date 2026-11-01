"""Training by level: legal puzzle lines, Today's three, and the level moving after Lock."""
import json
import pathlib

import chess

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEXT = (ROOT / "sessions" / "puzzles.js").read_text()
PUZZLES = json.loads(TEXT[TEXT.index("["):TEXT.rindex("]") + 1])


def test_every_puzzle_line_is_legal_and_long_enough():
    assert len(PUZZLES) > 3000
    assert len({p["id"] for p in PUZZLES}) == len(PUZZLES)
    for p in PUZZLES:
        board = chess.Board(p["fen"])
        for san in p["line"]:
            board.push_san(san)
        assert len(p["line"]) >= 5 and 700 <= p["r"] < 3000


def test_bands_cover_the_range():
    bands = {p["r"] // 100 for p in PUZZLES}
    assert set(range(7, 30)) <= bands


def open_today(page, app_url):
    page.goto(app_url(session="training-today", tab="session"))
    page.wait_for_selector("input[name=line]")
    return page.evaluate("window.PATH_SESSIONS[new URLSearchParams(location.search).get('session')]")


def settings(page):
    """Open the settings under the level line (closed by default)."""
    if page.get_attribute("#trainingSet", "aria-expanded") != "true":
        page.click("#trainingSet")


def pressed(page, group, text):
    page.wait_for_function("([g, t]) => { const b = document.querySelector('#' + g + ' [aria-pressed=true]');"
                           " return b && b.innerText === t; }", arg=[group, text])


def level(page):
    return page.evaluate("JSON.parse(localStorage.getItem('chess_path_to_v1')).training.level")


def test_today_has_three_positions_near_the_default_level(browser_page, app_url):
    s = open_today(browser_page, app_url)
    assert s["id"].startswith("training-") and len(s["steps"]) == 3
    assert all(abs(int(st["title"].split()[-1]) - 1500) <= 100 for st in s["steps"])
    assert "Set your rating" in browser_page.inner_text("#trainingLevel")
    assert not browser_page.errors


def test_level_moves_with_the_result(browser_page, app_url):
    page = browser_page
    s = open_today(page, app_url)
    first = s["steps"][0]
    page.fill("input[name=line]", " ".join(first["solve"]["line"]))
    page.click("#boardLock")
    page.wait_for_selector("#boardKey.show")
    assert level(page) == 1540

    page.click("#boardNext")
    second = s["steps"][1]
    board = chess.Board(second["fen"])
    wrong = next(board.san(m) for m in board.legal_moves if board.san(m) != second["solve"]["line"][0])
    page.fill("input[name=line]", wrong)
    page.click("#boardLock")
    assert page.inner_text("#boardErr")
    page.fill("input[name=line]", " ".join(second["solve"]["line"]))
    page.click("#boardLock")
    page.wait_for_selector("#boardKey.show")
    assert level(page) == 1500
    assert page.inner_text("#trainingLevel b") == "1500"


def test_the_day_stays_the_same_after_a_reload(browser_page, app_url):
    a = open_today(browser_page, app_url)
    b = open_today(browser_page, app_url)
    assert [st["id"] for st in a["steps"]] == [st["id"] for st in b["steps"]]


def test_set_rating_gives_a_new_set(browser_page, app_url):
    page = browser_page
    open_today(page, app_url)
    settings(page)
    page.fill("#trainingRate input", "2100")
    page.press("#trainingRate input", "Enter")
    page.wait_for_function("document.getElementById('trainingLevel') && "
                           "document.getElementById('trainingLevel').innerText.includes('2100')")
    s = page.evaluate("window.PATH_SESSIONS[new URLSearchParams(location.search).get('session')]")
    assert all(abs(int(st["title"].split()[-1]) - 2100) <= 100 for st in s["steps"])


def test_count_per_day(browser_page, app_url):
    page = browser_page
    open_today(page, app_url)
    settings(page)
    page.click("#trainingLevel [data-count='5']")
    pressed(page, "trainingCount", "5")
    s = page.evaluate("window.PATH_SESSIONS[new URLSearchParams(location.search).get('session')]")
    assert len(s["steps"]) == 5


def test_a_miss_comes_back_two_days_later_and_leaves_when_right(browser_page, app_url):
    page = browser_page
    s = open_today(page, app_url)
    first = s["steps"][0]
    board = chess.Board(first["fen"])
    wrong = next(board.san(m) for m in board.legal_moves if board.san(m) != first["solve"]["line"][0])
    page.fill("input[name=line]", wrong)
    page.click("#boardLock")
    page.fill("input[name=line]", " ".join(first["solve"]["line"]))
    page.click("#boardLock")
    page.wait_for_selector("#boardKey.show")
    assert level(page) == 1460
    # Two days later, without reloading the page: the store decides the set.
    later = page.evaluate("""() => {
        PathTraining._today(() => '2099-01-03');
        const t = window.pathStore.state.training;
        t.missed[Object.keys(t.missed)[0]] = '2099-01-01';
        PathTraining.prepare(window.pathStore);
        return window.PATH_SESSIONS['training-2099-01-03'];
    }""")
    assert later["steps"][0]["id"] == first["id"] and later["steps"][0]["name"] == "Again"
    assert "(1 again)" in later["title"]
    # Right this time: it leaves the repeat list, and the level does not move.
    page.evaluate("""(id) => document.dispatchEvent(new CustomEvent('path:locked',
        {detail: {sessionId: 'training-2099-01-03', stepId: id, clean: true}}))""", first["id"])
    t = page.evaluate("window.pathStore.state.training")
    assert first["id"] not in t["missed"] and t["level"] == 1460


def test_harder_and_easier_move_the_set_by_200(browser_page, app_url):
    page = browser_page
    open_today(page, app_url)
    settings(page)
    page.click("#trainingDiff [data-diff='200']")
    pressed(page, "trainingDiff", "Harder")
    s = page.evaluate("window.PATH_SESSIONS[new URLSearchParams(location.search).get('session')]")
    assert "near 1700" in s["title"]
    assert all(abs(int(st["title"].split()[-1]) - 1700) <= 100 for st in s["steps"])
    settings(page)
    page.click("#trainingDiff [data-diff='-200']")
    pressed(page, "trainingDiff", "Easier")
    s = page.evaluate("window.PATH_SESSIONS[new URLSearchParams(location.search).get('session')]")
    assert all(abs(int(st["title"].split()[-1]) - 1300) <= 100 for st in s["steps"])


def test_focus_sets_exist_in_every_band():
    for letter in "zlde":
        tagged = [p for p in PUZZLES if letter in p.get("f", "")]
        assert {p["r"] // 100 for p in tagged} >= set(range(9, 28)), letter


def test_focus_gives_only_tagged_positions(browser_page, app_url):
    page = browser_page
    open_today(page, app_url)
    settings(page)
    page.click("#trainingFocus [data-focus='z']")
    pressed(page, "trainingFocus", "Zwischenzug")
    s = page.evaluate("window.PATH_SESSIONS[new URLSearchParams(location.search).get('session')]")
    tagged = {p["id"] for p in PUZZLES if "z" in p["f"]}
    assert "Zwischenzug" in s["title"] and all(st["id"] in tagged for st in s["steps"])


def test_more_after_the_day_keeps_what_is_solved(browser_page, app_url):
    page = browser_page
    s = open_today(page, app_url)
    first = s["steps"][0]
    page.fill("input[name=line]", " ".join(first["solve"]["line"]))
    page.click("#boardLock")
    page.wait_for_selector("#boardKey.show")
    settings(page)
    page.click("#trainingLevel [data-count='15']")
    pressed(page, "trainingCount", "15")
    s2 = page.evaluate("window.PATH_SESSIONS[new URLSearchParams(location.search).get('session')]")
    ids = [st["id"] for st in s2["steps"]]
    assert len(ids) == 15 and len(set(ids)) == 15 and first["id"] in ids


def tap(page, moves, fen):
    """Play SAN moves on the board by tapping from- and to-squares."""
    board = chess.Board(fen)
    for san in moves:
        m = board.parse_san(san)
        page.click(f"#chessBoard [data-sq={chess.square_name(m.from_square)}]")
        page.click(f"#chessBoard [data-sq={chess.square_name(m.to_square)}]")
        board.push(m)


def test_board_moves_fill_the_answer_box(browser_page, app_url):
    """No 'Use board line' click: what is played on the board is already the written answer."""
    page = browser_page
    s = open_today(page, app_url)
    first = s["steps"][0]
    tap(page, first["solve"]["line"][:2], first["fen"])
    box = page.input_value("input[name=line]")
    assert first["solve"]["line"][0].rstrip("+#") in box and first["solve"]["line"][1].rstrip("+#") in box, box
    assert not page.is_disabled("#boardLock"), "two moves are not the whole line: no Lock yet"
    assert not page.errors


def test_play_replies_for_me_is_off_by_default_and_answers_when_ticked(browser_page, app_url):
    page = browser_page
    s = open_today(page, app_url)
    line, fen = s["steps"][0]["solve"]["line"], s["steps"][0]["fen"]
    assert not page.is_checked("#boardAutoReply")
    tap(page, line[:1], fen)
    page.wait_for_timeout(800)
    assert line[1].rstrip("+#") not in page.input_value("input[name=line]"), "off: the other side waits for him"
    page.check("#boardAutoReply")                 # ticked on the other side's turn: it answers now
    page.wait_for_function("m => document.querySelector('input[name=line]').value.includes(m)",
                           arg=line[1].rstrip("+#"))
    tap(page, line[2:3], _after(fen, line[:2]))
    page.wait_for_function("m => document.querySelector('input[name=line]').value.includes(m)",
                           arg=line[3].rstrip("+#"))
    assert not page.errors


def _after(fen, moves):
    b = chess.Board(fen)
    for m in moves:
        b.push_san(m)
    return b.fen()
