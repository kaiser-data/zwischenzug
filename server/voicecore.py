"""Speech-to-move core shared by the local server (scripts/voice_server.py) and the hosted API.

Model: atamano/whisper-chess-tiny (EN) / -de (DE), Whisper-tiny fine-tuned on chess moves only.
CC BY-NC-SA 4.0 — personal use; downloaded into the cache dir on first use, never into the repo or an image.
"""
from __future__ import annotations

import datetime
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CACHE = Path(os.environ.get("ZZ_VOICE_DIR") or Path.home() / ".cache" / "zwischenzug" / "voice")
MODELS = {
    "en": "https://huggingface.co/atamano/whisper-chess-tiny/resolve/main/ggml/ggml-tiny.bin",
    "de": "https://huggingface.co/atamano/whisper-chess-tiny-de/resolve/main/ggml/ggml-tiny.bin",
}
MAX_BODY = 5 * 1024 * 1024
SAMPLES = CACHE / "samples"

# How the chess model writes a move, per language, so a grammar can hold it to legal moves only.
WORDS = {
    "en": {"piece": {"N": "knight", "B": "bishop", "R": "rook", "Q": "queen", "K": "king"}, "take": "takes",
           "check": ["check", "checkmate"], "short": ["castles kingside"], "long": ["castles queenside"],
           "num": ["one", "two", "three", "four", "five", "six", "seven", "eight"], "dot": "."},
    "de": {"piece": {"N": "springer", "B": "läufer", "R": "turm", "Q": "dame", "K": "könig"}, "take": "schlägt",
           "check": ["schach", "matt"], "short": ["kurze Rochade"], "long": ["lange Rochade"],
           "num": ["eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht"], "dot": ""},
}
SAN = re.compile(r"^([NBRQK])?([a-h])?([1-8])?(x)?([a-h])([1-8])(?:=([NBRQ]))?[+#]?$")


def spoken(san: str, lang: str) -> list[str]:
    """The ways the model writes one SAN move ("Nxc3" → "knight takes C. three")."""
    w = WORDS[lang]
    core = san.rstrip("+#")
    if core in ("O-O", "O-O-O"):
        return w["short"] if core == "O-O" else w["long"]
    m = SAN.match(san)
    if not m:
        return []
    piece, dfile, drank, take, tfile, trank, promo = m.groups()
    letter = (lambda f: f.upper()) if lang == "en" else (lambda f: f)
    parts = [w["piece"][piece]] if piece else []
    if dfile:
        parts.append(letter(dfile))
    if drank:
        parts.append(w["num"][int(drank) - 1])
    if take:
        parts.append(w["take"])
    parts += [letter(tfile) + w["dot"], w["num"][int(trank) - 1]]
    if promo:
        parts.append(w["piece"][promo])
    base = " ".join(parts)
    return [base] + [base + " " + c for c in w["check"]]


def grammar(moves: list[str], lang: str) -> str:
    forms = sorted({f for san in moves for f in spoken(san, lang)})
    # The model capitalises the first word only sometimes, so both spellings are allowed.
    alts = sorted({v for f in forms for v in (f, f[:1].upper() + f[1:])})
    body = " | ".join(json.dumps(a, ensure_ascii=False) for a in alts)
    return 'root ::= " "? move "."?\nmove ::= ' + body + "\n"
WHISPER = os.environ.get("WHISPER_CLI") or shutil.which("whisper-cli") or "/opt/homebrew/bin/whisper-cli"
FFMPEG = os.environ.get("FFMPEG") or shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"


# Our own fine-tune (scripts/voice_ft/, openai/whisper-tiny, MIT): one model for EN and DE. It is used
# when this file is in the cache dir; remove it to go back to atamano's models.
OWN_MODEL = "zz-chess-tiny.bin"


def model_path(lang: str) -> Path:
    own = CACHE / OWN_MODEL
    if own.exists():
        return own
    path = CACHE / f"whisper-chess-tiny-{lang}.bin"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"downloading chess speech model ({lang}) → {path}")
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(MODELS[lang], tmp)
        tmp.rename(path)
    return path


def is_wav16k(audio: bytes) -> bool:
    """16 kHz mono 16-bit WAV — what the page sends from 🎧 — needs no ffmpeg."""
    if audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
        return False
    try:
        with wave.open(io.BytesIO(audio)) as w:
            return w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2
    except (wave.Error, EOFError):
        return False


def _prepare(audio: bytes, tmp: Path) -> Path:
    wav = tmp / "in.wav"
    if is_wav16k(audio):
        wav.write_bytes(audio)
        return wav
    src = tmp / "in"
    src.write_bytes(audio)
    subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-i", str(src), "-ar", "16000", "-ac", "1", str(wav)],
                   check=True, timeout=20)
    return wav


def _whisper(wav: Path, lang: str, moves: list[str] | None, tmp: Path) -> str:
    # -nf: no temperature fallback — on noise it retried at higher temperatures and took seconds.
    cmd = [WHISPER, "-m", str(model_path(lang)), "-l", lang, "-nt", "-np", "-nf", "-f", str(wav)]
    if moves:
        gbnf = tmp / "moves.gbnf"
        gbnf.write_text(grammar(moves, lang))
        cmd += ["--grammar", str(gbnf), "--grammar-rule", "root"]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=30)
    return " ".join(out.stdout.split())


def transcribe(audio: bytes, lang: str, moves: list[str] | None = None) -> str:
    """Free transcription, or — given the legal moves — one that can only be one of them."""
    with tempfile.TemporaryDirectory() as tmp:
        return _whisper(_prepare(audio, Path(tmp)), lang, moves, Path(tmp))


def transcribe_both(audio: bytes, lang: str, moves: list[str]) -> dict:
    """The free hearing and the one held to the legal moves, side by side: one round trip, one pass of waiting."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = _prepare(audio, Path(tmp))
        with ThreadPoolExecutor(2) as ex:
            free = ex.submit(_whisper, wav, lang, None, Path(tmp))
            held = ex.submit(_whisper, wav, lang, moves, Path(tmp))
            return {"text": free.result(), "grammar": held.result()}


def save_sample(audio: bytes, lang: str, label: str, heard: str, source: str, root: Path | None = None) -> dict:
    """One of his recordings with the move it meant, for measuring and later fine-tuning."""
    folder = (root or SAMPLES) / lang
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    wav = folder / f"{stamp}_{re.sub(r'[^A-Za-z0-9=+#-]', '_', label)}.wav"
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in"
        src.write_bytes(audio)
        subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-i", str(src), "-ar", "16000", "-ac", "1", str(wav)],
                       check=True, timeout=20)
    row = {"file": wav.name, "label": label, "heard": heard, "source": source, "at": stamp}
    with (folder / "manifest.jsonl").open("a") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return row


def sample_stats(root: Path | None = None) -> dict:
    out = {}
    for manifest in (root or SAMPLES).glob("*/manifest.jsonl"):
        rows = [json.loads(line) for line in manifest.read_text().splitlines() if line.strip()]
        out[manifest.parent.name] = {"count": len(rows), "by_source": {
            src: sum(r["source"] == src for r in rows) for src in sorted({r["source"] for r in rows})}}
    return out


def valid_label(label: str) -> bool:
    return bool(SAN.match(label)) or label.rstrip("+#") in ("O-O", "O-O-O")
