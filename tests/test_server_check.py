import re
import shutil

import chess
import pytest

from server.engine import Engine, IllegalPly, check_line, numbered
from server_fixtures import FRIEND, login

SF = shutil.which("stockfish")
GAME2 = "r4rk1/pppq1ppp/2nn2b1/3p1NB1/3P2P1/2PB1P2/P1P4P/R3QRK1 w - - 5 15"
GAME1 = "r4rk1/p3ppbp/1p4p1/qB1bP3/8/7P/PB2QPP1/1R2R1K1 w - - 2 20"
GAME2_LINE = ["Qg3", "Nxf5", "gxf5", "Bxf5", "Bxf5"]
needs_sf = pytest.mark.skipif(not SF, reason="stockfish missing")


@pytest.fixture(scope="module")
def engine():
    e = Engine(SF)
    yield e
    e.close()


def test_numbered():
    b = chess.Board(GAME2)
    assert numbered(b, [b.parse_san("Qg3")]) == "15.Qg3"
    b.push_san("Qg3")
    nxf5 = b.parse_san("Nxf5")
    after = b.copy()
    after.push(nxf5)
    assert numbered(b, [nxf5, after.parse_san("gxf5")]) == "15…Nxf5 16.gxf5"


@needs_sf
def test_game2_stops_one_ply_early(engine):
    r = check_line(engine, GAME2, GAME2_LINE)
    assert r["quiet"] is False and r["plies_checked"] == 5
    assert "after 17.Bxf5" in r["sentences"][0] and "17…Qxf5" in r["sentences"][0]
    assert "last capture" in r["sentences"][0]


@needs_sf
def test_game1_line_goes_on_with_bd7(engine):
    r = check_line(engine, GAME1, ["a4", "a6"])
    assert r["quiet"] is True and "21.Bd7" in r["sentences"][0] and "your move again" in r["sentences"][0]


@needs_sf
def test_a_later_exchange_is_not_stopping_early(engine):
    # Depth 16 continues 20…e6 21.Rbc1 … 23.Rxd5 exd5: the exchange is not a reply to his last ply.
    r = check_line(engine, GAME1, ["Red1"])
    assert r["quiet"] is True


@needs_sf
def test_same_line_same_sentence(engine):
    first = check_line(engine, GAME1, ["Red1"])["sentences"]
    assert first[0].startswith("After 20.Red1 the engine answers 20…")
    assert check_line(engine, GAME2, ["Qg3"])["sentences"] != first
    assert check_line(engine, GAME1, ["Red1"])["sentences"] == first


@needs_sf
def test_never_a_number_of_pawns(engine):
    for line in (GAME2_LINE, ["Qg3"], ["a4", "a6"]):
        fen = GAME1 if line[0] == "a4" else GAME2
        text = " ".join(check_line(engine, fen, line)["sentences"])
        assert "pawn" not in text and "cp" not in text and not re.search(r"[+-]\d+(\.\d+)?\b", text)


@needs_sf
def test_illegal_ply_is_named(engine):
    with pytest.raises(IllegalPly) as e:
        check_line(engine, GAME2, ["Qg3", "Qg3"])
    assert e.value.index == 1 and e.value.san == "Qg3"


@needs_sf
def test_check_route(client, mailer, engine):
    client.app.state.engine = engine
    assert client.post("/api/check", json={"fen": GAME2, "line": ["Qg3"]}).status_code == 401
    login(client, mailer, FRIEND)
    r = client.post("/api/check", json={"fen": GAME2, "line": GAME2_LINE})
    assert r.status_code == 200 and r.json()["quiet"] is False
    bad = client.post("/api/check", json={"fen": GAME2, "line": ["Kh8"]})
    assert bad.status_code == 400 and bad.json()["detail"]["ply"] == 0
    assert client.post("/api/check", json={"fen": GAME2, "line": []}).status_code == 400
    assert client.post("/api/check", json={"fen": "nonsense", "line": ["e4"]}).status_code == 400


def test_check_without_engine_says_so(client, mailer):
    login(client, mailer, FRIEND)
    r = client.post("/api/check", json={"fen": GAME2, "line": ["Qg3"]})
    assert r.status_code == 503 and "saved" in r.json()["detail"]
