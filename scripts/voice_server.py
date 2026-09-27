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
import json
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


def transcribe(audio: bytes, lang: str) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        src, wav = Path(tmp) / "in", Path(tmp) / "in.wav"
        src.write_bytes(audio)
        subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-i", str(src), "-ar", "16000", "-ac", "1", str(wav)],
                       check=True, timeout=20)
        out = subprocess.run([WHISPER, "-m", str(model_path(lang)), "-l", lang, "-nt", "-np", "-f", str(wav)],
                             check=True, capture_output=True, text=True, timeout=30)
        return " ".join(out.stdout.split())


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
        if urlparse(self.path).path == "/health":
            self.reply(200, {"ok": True, "langs": sorted(MODELS)})
        else:
            self.reply(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        if url.path != "/transcribe":
            self.reply(404, {"error": "not found"})
            return
        lang = (parse_qs(url.query).get("lang") or ["en"])[0]
        if lang not in MODELS:
            self.reply(400, {"error": f"lang must be one of {sorted(MODELS)}"})
            return
        size = int(self.headers.get("Content-Length") or 0)
        if not 0 < size <= MAX_BODY:
            self.reply(413 if size else 400, {"error": "send one short recording (≤ 5 MB)"})
            return
        audio = self.rfile.read(size)
        start = time.time()
        try:
            text = transcribe(audio, lang)
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
