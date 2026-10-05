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
import zipfile
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
GGML_MAGIC = b"lmgg"          # 0x67676d6c, little-endian


def model_path(lang: str) -> Path:
    own = CACHE / OWN_MODEL
    # An empty or half-written file must never be loaded (2026-10-05: a pipe that dropped stdin left 0 bytes).
    if own.exists() and own.stat().st_size > 1024 * 1024:
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
    return _hear(wav, lang, moves, tmp)["text"]


def _hear(wav: Path, lang: str, moves: list[str] | None, tmp: Path) -> dict:
    """Text, and how sure the model was: the lowest probability of any token it wrote. A move said
    clearly is ~1.0; noise the chess model turns into a move ("rook E. four") is ~0.2 (measured 2026-10-05)."""
    tag = "held" if moves else "free"
    # -nf: no temperature fallback — on noise it retried at higher temperatures and took seconds.
    cmd = [WHISPER, "-m", str(model_path(lang)), "-l", lang, "-nt", "-np", "-nf", "-ojf", "-of", str(tmp / tag),
           "-f", str(wav)]
    if moves:
        gbnf = tmp / "moves.gbnf"
        gbnf.write_text(grammar(moves, lang))
        cmd += ["--grammar", str(gbnf), "--grammar-rule", "root"]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=30)
    text = " ".join(out.stdout.split())
    try:
        segs = json.loads((tmp / f"{tag}.json").read_text(errors="replace"))["transcription"]
        probs = [t["p"] for s in segs for t in s.get("tokens", []) if not t["text"].startswith("[_")]
        conf = round(min(probs), 3) if probs else 0.0
    except (OSError, ValueError, KeyError):
        conf = None
    return {"text": text, "conf": conf}


def smoke_test(model: Path) -> None:
    """whisper-cli loads `model` and transcribes half a second of silence, or raises."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "silence.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(b"\0\0" * 8000)
        subprocess.run([WHISPER, "-m", str(model), "-l", "en", "-nt", "-np", "-nf", "-f", str(wav)],
                       check=True, capture_output=True, timeout=60)


def transcribe(audio: bytes, lang: str, moves: list[str] | None = None) -> str:
    """Free transcription, or — given the legal moves — one that can only be one of them."""
    return hear(audio, lang, moves)["text"]


def hear(audio: bytes, lang: str, moves: list[str] | None = None) -> dict:
    """Like transcribe, with the model's confidence: {"text", "conf"}."""
    with tempfile.TemporaryDirectory() as tmp:
        return _hear(_prepare(audio, Path(tmp)), lang, moves, Path(tmp))


def transcribe_both(audio: bytes, lang: str, moves: list[str]) -> dict:
    """The free hearing and the one held to the legal moves, side by side: one round trip, one pass of waiting."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = _prepare(audio, Path(tmp))
        with ThreadPoolExecutor(2) as ex:
            free = ex.submit(_hear, wav, lang, None, Path(tmp))
            held = ex.submit(_hear, wav, lang, moves, Path(tmp))
            f = free.result()
            return {"text": f["text"], "conf": f["conf"], "grammar": held.result()["text"]}


def save_sample(audio: bytes, lang: str, label: str, heard: str, source: str, root: Path | None = None,
                extra: dict | None = None) -> dict:
    """One of his recordings with what it meant (see valid_label), for measuring and fine-tuning.
    `extra`: fen (where it was said), conf (how sure the model was)."""
    folder = (root or SAMPLES) / lang
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    wav = folder / f"{stamp}_{re.sub(r'[^A-Za-z0-9=+#-]', '_', label)[:40]}.wav"
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in"
        src.write_bytes(audio)
        subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-i", str(src), "-ar", "16000", "-ac", "1", str(wav)],
                       check=True, timeout=20)
    row = {"file": wav.name, "label": label, "heard": heard, "source": source, "at": stamp,
           **{k: v for k, v in (extra or {}).items() if v not in (None, "")}}
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


# What a recording can mean: a SAN move, a square said alone ("sq:f7"), a command word ("cmd:nein"),
# or nothing — a sound that must not become a move ("noise").
COMMAND_WORDS = {
    "en": ["no", "yes", "next", "back", "undo", "wrong", "done", "lock", "stop", "reset", "again", "flip", "previous",
           "go", "skip", "continue"],
    "de": ["nein", "ja", "weiter", "nächste", "nächster", "zurück", "falsch", "fertig", "locken", "stopp", "nochmal",
           "drehen", "vorher", "löschen", "los", "vorwärts"],
}


def valid_label(label: str) -> bool:
    if label == "noise" or re.fullmatch(r"sq:[a-h][1-8]", label):
        return True
    if label.startswith("cmd:"):
        return any(label[4:] in words for words in COMMAND_WORDS.values())
    return bool(SAN.match(label)) or label.rstrip("+#") in ("O-O", "O-O-O")


def target_text(label: str, lang: str) -> str:
    """The text the model should write for a labelled recording, in the wording the page reads."""
    if label == "noise":
        return ""
    if label.startswith("cmd:"):
        return label[4:]
    w = WORDS[lang]
    if label.startswith("sq:"):
        f, r = label[3], int(label[4])
        return (f.upper() if lang == "en" else f) + w["dot"] + " " + w["num"][r - 1]
    forms = spoken(label, lang)
    if label.endswith("#"):
        return forms[0] + " " + w["check"][1]
    return forms[0] + (" " + w["check"][0] if label.endswith("+") else "")


def export_samples(root: Path) -> bytes:
    """All of one person's recordings and manifests as a zip, for training."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        for f in sorted(root.glob("*/*")):
            if f.suffix in (".wav", ".jsonl"):
                z.write(f, f.relative_to(root).as_posix())
    return buf.getvalue()
