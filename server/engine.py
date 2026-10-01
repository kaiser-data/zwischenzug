"""After he submits a line: does it stop one ply early? Sentences only — never an eval number.

The leak this serves: he calculates, then stops at the recapture he likes (game 2: …Bxf5 Bxf5,
missed …Qxf5) or at the reply he dislikes (game 1: 20.a4 a6, missed 21.Bd7)."""
from __future__ import annotations

import threading

import chess
import chess.engine

VALUE = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
MAX_PLIES = 30
PV_PLIES = 8
SWING = 2  # material change (pawns) after his line's end that means "the line was not over"


class IllegalPly(ValueError):
    def __init__(self, index: int, san: str):
        super().__init__(f"ply {index} ({san}) is not legal")
        self.index, self.san = index, san


class Engine:
    """One Stockfish process, one caller at a time; restarted if it dies.

    Fixed depth, one thread, a fresh game per call: the same line always gets the same sentence
    (a time limit gave 20…Rfd8 one run and 20…e6 the next). ~1 s on the M2; the time cap only
    bites on a slow host."""

    def __init__(self, path: str, depth: int = 16, max_seconds: float = 4.0):
        self.path, self.limit = path, chess.engine.Limit(depth=depth, time=max_seconds)
        self.lock = threading.Lock()
        self.proc = self._start()

    def _start(self) -> chess.engine.SimpleEngine:
        proc = chess.engine.SimpleEngine.popen_uci(self.path)
        proc.configure({"Threads": 1, "Hash": 64})
        return proc

    def analyse(self, board: chess.Board) -> list[chess.Move]:
        with self.lock:
            try:
                info = self.proc.analyse(board, self.limit, game=object())
            except chess.engine.EngineTerminatedError:
                self.proc = self._start()
                info = self.proc.analyse(board, self.limit, game=object())
        return list(info.get("pv", []))[:PV_PLIES]

    def close(self) -> None:
        self.proc.quit()


def material(board: chess.Board, side: chess.Color) -> int:
    return sum(VALUE[p.piece_type] * (1 if p.color == side else -1) for p in board.piece_map().values())


def numbered(board: chess.Board, moves: list[chess.Move]) -> str:
    """SAN with move numbers from `board` on: "15.Qg3 Nxf5 16.gxf5", "15…Nxf5 16.gxf5"."""
    b, out = board.copy(), []
    for i, m in enumerate(moves):
        san = b.san(m)
        if b.turn == chess.WHITE:
            out.append(f"{b.fullmove_number}.{san}")
        else:
            out.append(f"{b.fullmove_number}…{san}" if i == 0 else san)
        b.push(m)
    return " ".join(out)


def check_line(engine: Engine, fen: str, line: list[str]) -> dict:
    """{"sentences": [...], "quiet": bool, "plies_checked": n}; IllegalPly names the first bad ply."""
    if not line:
        raise IllegalPly(0, "")
    if len(line) > MAX_PLIES:
        raise IllegalPly(MAX_PLIES, line[MAX_PLIES])
    board = chess.Board(fen)
    side = board.turn
    for i, san in enumerate(line):
        try:
            move = board.parse_san(san)
        except ValueError:
            raise IllegalPly(i, san) from None
        before = board.copy()
        board.push(move)
    last = numbered(before, [move])
    result = {"plies_checked": len(line)}
    if board.is_game_over():
        return {**result, "sentences": [f"Your line ends after {last}: the game is over there."], "quiet": True}

    pv = engine.analyse(board)
    # Only the unbroken run of captures and checks straight after his last ply counts: that is
    # "the line was not over". An exchange later in a quiet continuation is a new story.
    last_capture, b = 0, board.copy()
    for i, m in enumerate(pv):
        if not (b.is_capture(m) or b.gives_check(m)):
            break
        if b.is_capture(m):
            last_capture = i + 1
        b.push(m)
    after = board.copy()
    for m in pv[:last_capture]:
        after.push(m)
    if last_capture and abs(material(after, side) - material(board, side)) >= SWING:
        return {**result, "quiet": False, "sentences": [
            f"Your line stops after {last}. It isn't over: {numbered(board, pv[:last_capture])}"
            " — calculate to the last capture."]}

    goes_on = numbered(board, pv[:3])
    if not pv:
        sentence = f"Your line ends after {last}."
    elif board.turn == side:
        sentence = f"After {last} it is your move again: the engine continues {goes_on}."
    else:
        sentence = f"After {last} the engine answers {goes_on}."
    return {**result, "quiet": True, "sentences": [sentence]}
