"""scripts/voice_server.py: CORS for a file:// page, input checks, and a real transcription."""
import importlib.util
import json
import pathlib
import shutil
import subprocess
import threading
import urllib.error
import urllib.request

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("voice_server", ROOT / "scripts" / "voice_server.py")
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)

HAVE_MODEL = (voice.CACHE / "whisper-chess-tiny-en.bin").exists()
HAVE_TOOLS = all(shutil.which(t) for t in ("whisper-cli", "ffmpeg", "say"))


@pytest.fixture(scope="module")
def server():
    httpd = voice.ThreadingHTTPServer(("127.0.0.1", 0), voice.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def request(url, method="GET", data=None):
    req = urllib.request.Request(url, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def test_health_and_cors_for_a_file_page(server):
    status, headers, body = request(server + "/health")
    assert status == 200 and json.loads(body)["ok"] is True
    assert headers["Access-Control-Allow-Origin"] == "*"

    status, headers, _ = request(server + "/transcribe", method="OPTIONS")
    assert status == 204
    assert "POST" in headers["Access-Control-Allow-Methods"]
    assert headers["Access-Control-Allow-Private-Network"] == "true"


def test_bad_requests_are_refused(server):
    assert request(server + "/transcribe?lang=xx", "POST", b"abc")[0] == 400
    assert request(server + "/transcribe?lang=en", "POST", b"")[0] == 400
    assert request(server + "/nothing")[0] == 404


@pytest.mark.skipif(not (HAVE_MODEL and HAVE_TOOLS), reason="chess speech model or whisper-cli/ffmpeg/say missing")
def test_a_spoken_move_comes_back_as_text(server, tmp_path):
    aiff = tmp_path / "move.aiff"
    subprocess.run(["say", "-v", "Samantha", "-o", str(aiff), "knight takes c3"], check=True)
    status, _, body = request(server + "/transcribe?lang=en", "POST", aiff.read_bytes())
    text = json.loads(body)["text"].lower()
    assert status == 200
    assert "knight" in text and "c" in text and ("3" in text or "three" in text)


@pytest.mark.skipif(not (HAVE_MODEL and HAVE_TOOLS), reason="chess speech model or whisper-cli/ffmpeg/say missing")
def test_hands_free_move_reaches_the_board(server, tmp_path, fake_mic_browser):
    aiff, wav = tmp_path / "m.aiff", tmp_path / "m.wav"
    subprocess.run(["say", "-v", "Samantha", "-o", str(aiff), "knight e2"], check=True)
    # Silence before and after, so the loop plays one clear utterance at a time.
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(aiff), "-af", "adelay=1000,apad=pad_dur=3",
                    "-ar", "48000", "-ac", "1", str(wav)], check=True)
    page = fake_mic_browser(wav).new_page()
    page.add_init_script(f"window.PATH_VOICE_URL = '{server}'")
    page.goto("file://" + str(ROOT / "index.html") + "?session=6yfxgu80#session")
    page.wait_for_selector("#boardSteps button")
    page.locator("#boardSteps button").nth(0).click()
    page.wait_for_function("document.getElementById('boardListen').getAttribute('aria-disabled') === 'false'")

    page.click("#boardListen")
    page.wait_for_function("document.getElementById('boardStatus').textContent.includes('Black to move · Ne2')", timeout=15000)
    page.click("#boardListen")
    assert page.get_attribute("#boardListen", "aria-pressed") == "false"
