#!/usr/bin/env python3
"""His own recordings → training data: real.npz (80 %) and realeval.npz (20 %, never trained on).

    python3 scripts/voice_ft/pull_samples.py --into data3            # Mac samples + hosted (owner export)
    python3 scripts/voice_ft/pull_samples.py --into data3 --local    # only ~/.cache/zwischenzug/voice/samples

Labels (server/voicecore.valid_label) become the text the model should write (voicecore.target_text):
a move in the page's wording, a square alone, a command word, or nothing for noise. train_modal.py
weights real.npz ×8; eval_local.py --split realeval scores a model on his voice only. The split is
by file name hash, so a recording never moves between train and eval when more are added.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import wave
import zipfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from server.voicecore import CACHE, SAMPLES, target_text, valid_label  # noqa: E402

FT = CACHE / "ft"


def read_wav(data: bytes) -> np.ndarray | None:
    try:
        with wave.open(io.BytesIO(data)) as w:
            if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
                return None
            return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    except (wave.Error, EOFError):
        return None


def from_folder(root: Path, origin: str):
    for manifest in sorted(root.glob("*/manifest.jsonl")):
        lang = manifest.parent.name
        for line in manifest.read_text().splitlines():
            if line.strip():
                row = json.loads(line)
                f = manifest.parent / row["file"]
                if f.exists():
                    yield lang, row, f.read_bytes(), origin


def from_hosted():
    from push_model import fetch, owner_cookie
    z = zipfile.ZipFile(io.BytesIO(fetch("/api/voice/samples/export", owner_cookie())))
    files = {n: z.read(n) for n in z.namelist()}
    for name, data in files.items():
        if not name.endswith("manifest.jsonl"):
            continue
        lang = name.split("/")[0]
        for line in data.decode().splitlines():
            if line.strip():
                row = json.loads(line)
                wav = files.get(f"{lang}/{row['file']}")
                if wav:
                    yield lang, row, wav, "hosted"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--into", required=True, help="dataset folder under ~/.cache/zwischenzug/voice/ft/")
    p.add_argument("--local", action="store_true", help="skip the hosted samples")
    a = p.parse_args()
    out = FT / a.into
    out.mkdir(parents=True, exist_ok=True)

    rows = list(from_folder(SAMPLES, "mac"))
    if not a.local:
        rows += list(from_hosted())
    split = {"real": ([], []), "realeval": ([], [])}
    seen, skipped = set(), 0
    for lang, row, data, origin in rows:
        label = row.get("label", "")
        key = (origin, lang, row["file"])
        pcm = read_wav(data)
        if key in seen or pcm is None or not len(pcm) or not valid_label(label) or lang not in ("en", "de"):
            skipped += 1
            continue
        seen.add(key)
        kind = "noise" if label == "noise" else "command" if label.startswith("cmd:") else "move"
        rec = {"text": target_text(label, lang), "kind": kind, "lang": lang, "voice": "him-" + origin,
               "label": label, "fen": row.get("fen", ""), "file": row["file"]}
        held = int(hashlib.sha1(row["file"].encode()).hexdigest(), 16) % 5 == 0
        split["realeval" if held else "real"][0].append(rec)
        split["realeval" if held else "real"][1].append(pcm)
    for name, (recs, clips) in split.items():
        if not recs:
            print(f"{name}: none")
            continue
        np.savez(out / f"{name}.npz", audio=np.concatenate(clips), offsets=np.cumsum([0] + [len(c) for c in clips]))
        with (out / f"manifest-{name}.jsonl").open("w") as f:
            for r in recs:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        by = {}
        for r in recs:
            by[f"{r['lang']}/{r['kind']}"] = by.get(f"{r['lang']}/{r['kind']}", 0) + 1
        print(f"{name}: {len(recs)} clips, {sum(map(len, clips)) / 16000 / 60:.1f} min · {by}")
    print(f"skipped {skipped} · wrote {out}")


if __name__ == "__main__":
    main()
