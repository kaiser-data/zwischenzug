#!/usr/bin/env python3
"""Pack sessions/*.json into sessions/bundle.js for file:// (no fetch).

sessions/private/*.json (gitignored: book exercises, never pushed) go into
sessions/private/bundle.js, which merges into the same PATH_SESSIONS.
"""
from __future__ import annotations

import json
from pathlib import Path

import chess

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "sessions"
OUT = SRC / "bundle.js"
PRIVATE = SRC / "private"
PRIVATE_OUT = PRIVATE / "bundle.js"


CATEGORIES = {"leak", "clean", "clock", "gift"}


def _play(fen: str, moves: list) -> str | None:
    """None if every SAN is legal from `fen` in order, else what went wrong."""
    try:
        board = chess.Board(fen)
    except ValueError:
        return f"bad fen {fen!r}"
    for i, san in enumerate(moves):
        try:
            board.push_san(san)
        except ValueError:
            return f"ply {i + 1} {san!r} is not legal"
    return None


def validate(sid: str, data: dict) -> list[str]:
    """Every line a session asks for must be legal, or Lock never opens. Returns problems."""
    errors = []
    if data.get("category") is not None and data["category"] not in CATEGORIES:
        errors.append(f"{sid}: unknown category {data['category']!r}")
    seen = set()
    for n, step in enumerate(data.get("steps") or []):
        where = f"{sid}:{step.get('id') or n}"
        if step.get("id") in seen:
            errors.append(f"{where}: duplicate step id")
        seen.add(step.get("id"))
        fen = step.get("fen")
        bad = _play(fen, [])
        if bad:
            errors.append(f"{where}: {bad}")
            continue

        def need(label, moves):
            problem = _play(fen, moves)
            if problem:
                errors.append(f"{where}: {label}: {problem}")

        need("mustPlay", step.get("mustPlay") or [])
        if step.get("type") == "solve":
            need("solve.line", (step.get("solve") or {}).get("line") or [])
            for alt in (step.get("solve") or {}).get("alts") or []:
                need("solve.alts", alt)
        if step.get("type") == "stopPly":
            sp = step.get("stopPly") or {}
            head = [sp.get("candidate"), sp.get("scare")]
            need("stopPly", head + (sp.get("continue") or []))
            # `match` is compared as text with what he wrote, so it may be illegal on purpose.
            for mix in sp.get("mixups") or []:
                need("stopPly.mixups.line", mix.get("line") or [])
        ids = set()
        for b in step.get("branches") or []:
            bw = f"branch {b.get('id')}"
            if b.get("id") in ids:
                errors.append(f"{where}: duplicate branch id {b.get('id')!r}")
            ids.add(b.get("id"))
            line = b.get("mustPlay") or []
            need(bw, line)
            given = b.get("given", 1)
            if b.get("write") and not 0 <= given < len(line):
                errors.append(f"{where}: {bw}: given={given} leaves nothing to write in {len(line)} ply")
            for alt in b.get("alts") or []:
                need(f"{bw} alts", alt)
                if alt[:given] != line[:given]:
                    errors.append(f"{where}: {bw}: alts must start with the same {given} given ply")
    return errors


def check_all(sessions: dict) -> None:
    errors = [e for sid, data in sessions.items() for e in validate(sid, data)]
    if errors:
        raise SystemExit("session check failed:\n  " + "\n  ".join(errors))


def collect(src: Path) -> dict:
    sessions = {}
    for path in sorted(src.glob("*.json")):
        data = json.loads(path.read_text())
        sid = data.get("id") or path.stem
        sessions[sid] = data
    return sessions


def main() -> None:
    sessions = collect(SRC)
    check_all(sessions)
    OUT.write_text("window.PATH_SESSIONS = " + json.dumps(sessions, indent=2) + ";\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(sessions)} session(s): {', '.join(sessions)})")

    # Always written locally so index.html finds the file; a fresh clone just lacks it.
    PRIVATE.mkdir(exist_ok=True)
    private = collect(PRIVATE)
    check_all(private)
    clash = sorted(set(private) & set(sessions))
    if clash:
        raise SystemExit(f"private session id(s) clash with public: {', '.join(clash)}")
    PRIVATE_OUT.write_text(
        "window.PATH_SESSIONS = Object.assign(window.PATH_SESSIONS || {}, "
        + json.dumps(private, indent=2)
        + ");\n"
    )
    print(f"wrote {PRIVATE_OUT.relative_to(ROOT)} ({len(private)} private session(s){': ' + ', '.join(private) if private else ''})")


if __name__ == "__main__":
    main()
