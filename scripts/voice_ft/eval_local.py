#!/usr/bin/env python3
"""Score speech models the way the server runs them (whisper-cli, same flags) on held-out clips.

    python3 scripts/voice_ft/eval_local.py --data small --model current --model runs/dry/ggml-model.bin

`current` = the model the server uses today (atamano EN / DE). Other models are paths under
~/.cache/zwischenzug/voice/ft/ (or absolute). Prints accuracy per language and kind (move / command)
and the mean whisper-cli time per clip. Exact match after lower-casing and dropping punctuation —
the same text the page would read.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from server.voicecore import CACHE, WHISPER  # noqa: E402

FT = CACHE / "ft"


def norm(text: str) -> str:
    if text.strip().startswith(("[", "(")):              # [BLANK_AUDIO], (noise): nothing heard
        return ""
    return " ".join(text.lower().replace(".", " ").replace(",", " ").replace("!", " ").replace("?", " ").split())


def model_for(spec: str, lang: str) -> Path:
    if spec == "current":
        return CACHE / f"whisper-chess-tiny-{lang}.bin"
    p = Path(spec)
    return p if p.is_absolute() else FT / p


def hear(model: Path, wav: Path, lang: str) -> tuple[str, float]:
    t = time.time()
    out = subprocess.run([WHISPER, "-m", str(model), "-l", lang, "-nt", "-np", "-nf", "-f", str(wav)],
                         capture_output=True, text=True, timeout=60)
    return " ".join(out.stdout.split()), time.time() - t


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--data", default="data", help="dataset folder under ft/")
    p.add_argument("--split", default="eval")
    p.add_argument("--model", action="append", required=True)
    p.add_argument("--limit", type=int, default=0, help="first N clips per language/kind")
    p.add_argument("--show", type=int, default=8, help="misses to print per model")
    args = p.parse_args()

    folder = FT / args.data
    z = np.load(folder / f"{args.split}.npz")
    rows = [json.loads(line) for line in (folder / f"manifest-{args.split}.jsonl").read_text().splitlines() if line]
    if args.limit:
        seen: dict[str, int] = {}
        keep = []
        for i, r in enumerate(rows):
            k = r["lang"] + r["kind"]
            if seen.get(k, 0) < args.limit:
                seen[k] = seen.get(k, 0) + 1
                keep.append(i)
    else:
        keep = list(range(len(rows)))

    with tempfile.TemporaryDirectory() as tmp:
        wavs = {}
        for i in keep:
            path = Path(tmp) / f"{i}.wav"
            with wave.open(str(path), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(16000)
                w.writeframes(z["audio"][z["offsets"][i]:z["offsets"][i + 1]].tobytes())
            wavs[i] = path
        report = {}
        for spec in args.model:
            with ThreadPoolExecutor(4) as ex:
                got = list(ex.map(lambda i: hear(model_for(spec, rows[i]["lang"]), wavs[i], rows[i]["lang"]), keep))
            by: dict[str, list[int]] = {}
            misses = []
            for i, (text, _) in zip(keep, got):
                r = rows[i]
                ok = norm(text) == norm(r["text"])
                by.setdefault(f"{r['lang']}/{r['kind']}", [0, 0])
                by[f"{r['lang']}/{r['kind']}"][0] += ok
                by[f"{r['lang']}/{r['kind']}"][1] += 1
                if not ok:
                    misses.append(f"{r['text']!r} → {text!r} ({r['voice'].split()[0]})")
            total = sum(v[0] for v in by.values()) / max(1, len(keep))
            ms = 1000 * sum(s for _, s in got) / max(1, len(got))
            report[spec] = {"acc": round(total, 3), "ms": round(ms),
                            **{k: f"{v[0]}/{v[1]}" for k, v in sorted(by.items())}}
            print(f"\n{spec}: {total:.1%} right · {ms:.0f} ms per clip (4 in parallel)")
            for k, v in sorted(by.items()):
                print(f"   {k:12} {v[0]}/{v[1]}  {v[0] / v[1]:.0%}")
            for m in misses[:args.show]:
                print("   ✗", m)
        print("\n" + json.dumps(report))


if __name__ == "__main__":
    main()
