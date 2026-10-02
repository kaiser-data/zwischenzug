#!/usr/bin/env python3
"""Local speech-to-move server for the Board tab's 🎤 button. Nothing leaves the machine.

    python3 scripts/voice_server.py            # http://127.0.0.1:8766

POST /transcribe?lang=en|de with the recorded audio (webm/ogg/wav) returns
{"text": "...", "ms": 123}. With &moves=<legal SAN>&both=1 it also returns "grammar": the same audio
held to those moves, transcribed at the same time. The page turns the text into SAN itself.

Model: atamano/whisper-chess-tiny (EN) / -de (DE), Whisper-tiny fine-tuned on
chess moves only. CC BY-NC-SA 4.0 — personal use; it is downloaded into
~/.cache/zwischenzug/voice/ on first use and never goes into the repo.
Needs whisper-cli (brew install whisper-cpp) and ffmpeg.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.voicecore import (CACHE, FFMPEG, MAX_BODY, MODELS, SAMPLES, WHISPER, grammar, model_path,  # noqa: E402,F401
                              sample_stats, save_sample, spoken, transcribe, transcribe_both, valid_label)


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
            self.reply(200, {"ok": True, "langs": sorted(MODELS), "both": True})
        elif path == "/samples":
            self.reply(200, sample_stats(SAMPLES))
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
            if not valid_label(label):
                self.reply(400, {"error": "label must be one SAN move"})
                return
            try:
                row = save_sample(audio, lang, label, (q.get("heard") or [""])[0], (q.get("source") or ["drill"])[0],
                                  root=SAMPLES)
            except (subprocess.SubprocessError, OSError) as e:
                self.reply(500, {"error": f"could not save: {e}"})
                return
            self.reply(200, {"saved": row["file"], "stats": sample_stats(SAMPLES).get(lang)})
            return
        moves = [m for m in (q.get("moves") or [""])[0].split(",") if m]
        start = time.time()
        try:
            if (q.get("both") or ["0"])[0] == "1" and moves:
                out = transcribe_both(audio, lang, moves)
            else:
                out = {"text": transcribe(audio, lang, moves or None)}
        except (subprocess.SubprocessError, OSError) as e:
            self.reply(500, {"error": f"transcription failed: {e}"})
            return
        self.reply(200, {**out, "ms": round((time.time() - start) * 1000)})

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
