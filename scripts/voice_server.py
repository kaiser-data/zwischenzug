#!/usr/bin/env python3
"""Local speech-to-move server for the Board tab's 🎤 button. Nothing leaves the machine.

    python3 scripts/voice_server.py            # http://127.0.0.1:8766

POST /transcribe?lang=en|de with the recorded audio (webm/ogg/wav) returns
{"text": "...", "ms": 123}. The page turns the text into SAN itself.

Model: atamano/whisper-chess-tiny (EN) / -de (DE), Whisper-tiny fine-tuned on
chess moves only. CC BY-NC-SA 4.0 — personal use; it is downloaded into
~/.cache/zwischenzug/voice/ on first use and never goes into the repo.
Needs whisper-cli (brew install whisper-cpp) and ffmpeg.
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

CACHE = Path.home() / ".cache" / "zwischenzug" / "voice"
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
WHISPER = shutil.which("whisper-cli") or "/opt/homebrew/bin/whisper-cli"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"


def model_path(lang: str) -> Path:
    path = CACHE / f"whisper-chess-tiny-{lang}.bin"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"downloading chess speech model ({lang}) → {path}")
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(MODELS[lang], tmp)
        tmp.rename(path)
    return path


def transcribe(audio: bytes, lang: str, moves: list[str] | None = None) -> str:
    """Free transcription, or — given the legal moves — one that can only be one of them."""
    with tempfile.TemporaryDirectory() as tmp:
        src, wav = Path(tmp) / "in", Path(tmp) / "in.wav"
        src.write_bytes(audio)
        subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-i", str(src), "-ar", "16000", "-ac", "1", str(wav)],
                       check=True, timeout=20)
        cmd = [WHISPER, "-m", str(model_path(lang)), "-l", lang, "-nt", "-np", "-f", str(wav)]
        if moves:
            gbnf = Path(tmp) / "moves.gbnf"
            gbnf.write_text(grammar(moves, lang))
            cmd += ["--grammar", str(gbnf), "--grammar-rule", "root"]
        out = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=30)
        return " ".join(out.stdout.split())


def save_sample(audio: bytes, lang: str, label: str, heard: str, source: str) -> dict:
    """One of his recordings with the move it meant, for measuring and later fine-tuning."""
    folder = SAMPLES / lang
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


def sample_stats() -> dict:
    out = {}
    for manifest in SAMPLES.glob("*/manifest.jsonl"):
        rows = [json.loads(line) for line in manifest.read_text().splitlines() if line.strip()]
        out[manifest.parent.name] = {"count": len(rows), "by_source": {
            src: sum(r["source"] == src for r in rows) for src in sorted({r["source"] for r in rows})}}
    return out


class Handler(BaseHTTPRequestHandler):
    # The page runs from file:// (origin "null"), so the answers must allow any origin.
    def cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def reply(self, code: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:  # noqa: N802 (http.server naming)
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            self.reply(200, {"ok": True, "langs": sorted(MODELS)})
        elif path == "/samples":
            self.reply(200, sample_stats())
        else:
            self.reply(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        if url.path not in ("/transcribe", "/sample"):
            self.reply(404, {"error": "not found"})
            return
        q = parse_qs(url.query)
        lang = (q.get("lang") or ["en"])[0]
        if lang not in MODELS:
            self.reply(400, {"error": f"lang must be one of {sorted(MODELS)}"})
            return
        size = int(self.headers.get("Content-Length") or 0)
        if not 0 < size <= MAX_BODY:
            self.reply(413 if size else 400, {"error": "send one short recording (≤ 5 MB)"})
            return
        audio = self.rfile.read(size)
        if url.path == "/sample":
            label = (q.get("label") or [""])[0]
            if not SAN.match(label) and label.rstrip("+#") not in ("O-O", "O-O-O"):
                self.reply(400, {"error": "label must be one SAN move"})
                return
            try:
                row = save_sample(audio, lang, label, (q.get("heard") or [""])[0], (q.get("source") or ["drill"])[0])
            except (subprocess.SubprocessError, OSError) as e:
                self.reply(500, {"error": f"could not save: {e}"})
                return
            self.reply(200, {"saved": row["file"], "stats": sample_stats().get(lang)})
            return
        moves = [m for m in (q.get("moves") or [""])[0].split(",") if m]
        start = time.time()
        try:
            text = transcribe(audio, lang, moves or None)
        except (subprocess.SubprocessError, OSError) as e:
            self.reply(500, {"error": f"transcription failed: {e}"})
            return
        self.reply(200, {"text": text, "ms": round((time.time() - start) * 1000)})

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} {fmt % args}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--port", type=int, default=8766)
    p.add_argument("--lang", choices=sorted(MODELS), default="en", help="model to fetch before serving")
    args = p.parse_args()
    for tool in (WHISPER, FFMPEG):
        if not Path(tool).exists():
            raise SystemExit(f"missing {tool} — brew install whisper-cpp ffmpeg")
    model_path(args.lang)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"voice server on http://127.0.0.1:{args.port} (Ctrl-C stops it)")
    server.serve_forever()


if __name__ == "__main__":
    main()
