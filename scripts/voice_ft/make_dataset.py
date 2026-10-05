#!/usr/bin/env python3
"""Synthetic training clips for the chess speech model: macOS voices saying moves and command words.

    python3 scripts/voice_ft/make_dataset.py              # → ~/.cache/zwischenzug/voice/ft/data/
    python3 scripts/voice_ft/make_dataset.py --small      # a few hundred clips, for the dry run

Targets are written the way the page already reads them (server/voicecore.spoken: "knight takes C. three",
"springer schlägt c drei"), so a fine-tuned model drops in without client changes. Command words are
trained as words, so "back" stops coming out as "B. eight". Some voices are held out entirely: the eval
split is speakers the model never heard. Output: train.npz / eval.npz (int16 16 kHz, concatenated, with
offsets) + manifest-<split>.jsonl {text, lang, voice, kind}. Nothing here goes into the repo.
"""
from __future__ import annotations

import argparse
import json
import random
import subprocess
import sys
import tempfile
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import chess
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from server.voicecore import CACHE, WORDS, spoken  # noqa: E402

OUT = CACHE / "ft" / "data"
EN_VOICES = ["Albert", "Aman", "Daniel (English (UK))", "Eddy (English (UK))", "Eddy (English (US))", "Flo (English (UK))",
             "Flo (English (US))", "Fred", "Grandma (English (UK))", "Grandma (English (US))", "Grandpa (English (UK))",
             "Grandpa (English (US))", "Karen", "Kathy", "Moira", "Ralph", "Reed (English (UK))", "Reed (English (US))",
             "Rishi", "Rocko (English (UK))", "Rocko (English (US))", "Samantha (English (US))", "Sandy (English (UK))",
             "Sandy (English (US))", "Shelley (English (UK))", "Shelley (English (US))", "Tara", "Tessa"]
DE_VOICES = ["Anna (German (Germany))", "Eddy (German (Germany))", "Flo (German (Germany))", "Grandma (German (Germany))",
             "Grandpa (German (Germany))", "Reed (German (Germany))", "Rocko (German (Germany))", "Sandy (German (Germany))",
             "Shelley (German (Germany))"]
# He is a German speaker saying English moves: German voices reading the English text are the nearest synthetic match.
VOICES = {"en": EN_VOICES + DE_VOICES, "de": DE_VOICES}
HELD_OUT = {"en": {"Moira", "Rishi", "Sandy (English (US))", "Shelley (German (Germany))"},
            "de": {"Sandy (German (Germany))"}}
# Canonical spelling of each command, as the page's SPOKEN tables read it.
COMMANDS = {
    "en": ["back", "no", "undo", "wrong", "yes", "done", "next", "previous", "again", "flip", "reset", "stop",
           "go", "skip", "continue"],
    # "vorwärts" is trained so it stops coming out as "vorher" (tiny-a did that: the opposite command).
    "de": ["zurück", "nein", "falsch", "ja", "fertig", "weiter", "vorher", "nochmal", "drehen", "löschen", "stopp",
           "nächste", "nächster", "nächste Aufgabe", "los", "vorwärts"],
}
COUNTS = {"en": (7000, 1800), "de": (5000, 1800)}   # (moves, commands)


def positions(n: int, rng: random.Random) -> list[chess.Board]:
    """Positions from random games, captures and checks a little favoured so they are not rare."""
    out = []
    while len(out) < n:
        b = chess.Board()
        for _ in range(rng.randint(0, 90)):
            moves = list(b.legal_moves)
            if not moves:
                break
            sharp = [m for m in moves if b.is_capture(m) or b.gives_check(m)]
            b.push(rng.choice(sharp) if sharp and rng.random() < 0.3 else rng.choice(moves))
        if not b.is_game_over():
            out.append(b)
    return out


def move_text(b: chess.Board, rng: random.Random, lang: str) -> tuple[str, chess.Move]:
    moves = list(b.legal_moves)
    castles = [m for m in moves if b.is_castling(m)]
    m = rng.choice(castles) if castles and rng.random() < 0.15 else rng.choice(moves)
    san = b.san(m)
    base = spoken(san, lang)[0]
    check, mate = WORDS[lang]["check"]
    if san.endswith("#"):
        return f"{base} {mate}", m
    return (f"{base} {check}" if san.endswith("+") and rng.random() < 0.7 else base), m


def texts(lang: str, rng: random.Random, scale: float) -> list[dict]:
    n_moves, n_cmds = (max(1, int(c * scale)) for c in COUNTS[lang])
    rows = []
    for b in positions(n_moves, rng):
        text, m = move_text(b, rng, lang)
        if rng.random() < 0.08:                         # two moves in one breath
            b.push(m)
            if not b.is_game_over():
                text = text + " " + move_text(b, rng, lang)[0]
        rows.append({"text": text, "kind": "move"})
    for i in range(n_cmds):
        rows.append({"text": COMMANDS[lang][i % len(COMMANDS[lang])], "kind": "command"})
    for r in rows:
        r["lang"] = lang
        r["voice"] = rng.choice(VOICES[lang])
        r["rate"] = rng.randint(150, 240)
    return rows


def speak(row: dict, tmp: Path, i: int) -> np.ndarray | None:
    wav = tmp / f"{i}.wav"
    # Command words alone are read flat by `say`; a "!" or "?" now and then gives the shorter, sharper
    # way people bark them. The target stays the bare word.
    said = row["text"] + ("!" if row["kind"] == "command" and i % 3 == 0 else "")
    try:
        subprocess.run(["say", "-v", row["voice"], "-r", str(row["rate"]), "-o", str(wav), "--file-format=WAVE",
                        "--data-format=LEI16@16000", said], check=True, timeout=30, capture_output=True)
        with wave.open(str(wav)) as w:
            pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    except (subprocess.SubprocessError, wave.Error, OSError):
        return None
    finally:
        wav.unlink(missing_ok=True)
    nz = np.flatnonzero(np.abs(pcm) > 200)              # trim the silence `say` leaves around the words
    if not len(nz) or len(nz) > 16000 * 8:
        return None
    return pcm[max(0, nz[0] - 800): nz[-1] + 1600]


def pack(rows: list[dict], clips: list[np.ndarray], name: str) -> None:
    offsets = np.cumsum([0] + [len(c) for c in clips])
    np.savez(OUT / f"{name}.npz", audio=np.concatenate(clips), offsets=offsets)
    with (OUT / f"manifest-{name}.jsonl").open("w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> None:
    global OUT
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--small", action="store_true", help="~4 %% of the clips, for the dry run")
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--seed", type=int, default=7)
    args = p.parse_args()
    OUT = args.out
    OUT.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    rows = [r for lang in ("en", "de") for r in texts(lang, rng, 0.04 if args.small else 1.0)]
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(8) as ex:
        clips = list(ex.map(lambda ir: speak(ir[1], Path(tmp), ir[0]), enumerate(rows)))
    kept = [(r, c) for r, c in zip(rows, clips) if c is not None]
    split = {"train": [], "eval": []}
    for r, c in kept:
        split["eval" if r["voice"] in HELD_OUT[r["lang"]] else "train"].append((r, c))
    for name, items in split.items():
        pack([r for r, _ in items], [c for _, c in items], name)
        secs = sum(len(c) for _, c in items) / 16000
        print(f"{name}: {len(items)} clips, {secs / 60:.0f} min audio")
    print(f"dropped {len(rows) - len(kept)} · wrote {OUT}")


if __name__ == "__main__":
    main()
