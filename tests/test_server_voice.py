import importlib
import shutil
import subprocess

import pytest

from server import voicecore
from server_fixtures import FRIEND, OWNER, login


def test_spoken_forms_and_grammar():
    assert voicecore.spoken("Nxc3", "en")[0] == "knight takes C. three"
    assert voicecore.spoken("Nxc3", "de")[0] == "springer schlägt c drei"
    g = voicecore.grammar(["Nxc3", "O-O"], "en")
    assert g.startswith("root ::=") and '"castles kingside"' in g


def test_labels():
    assert voicecore.valid_label("Rac1") and voicecore.valid_label("O-O+")
    assert voicecore.valid_label("sq:f7") and voicecore.valid_label("cmd:nein") and voicecore.valid_label("noise")
    assert not voicecore.valid_label("hello") and not voicecore.valid_label("cmd:banana") and not voicecore.valid_label("sq:z9")


def test_what_the_model_should_write_for_each_label():
    t = voicecore.target_text
    assert t("Nxc3+", "en") == "knight takes C. three check" and t("Qh8#", "de") == "dame h acht matt"
    assert t("sq:f7", "en") == "F. seven" and t("sq:f7", "de") == "f sieben"
    assert t("cmd:nein", "de") == "nein" and t("noise", "en") == "" and t("O-O", "de") == "kurze Rochade"


def test_16k_mono_wav_skips_ffmpeg():
    import io
    import wave

    def wav(rate, channels):
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(channels)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(b"\0\0" * channels * 160)
        return buf.getvalue()
    assert voicecore.is_wav16k(wav(16000, 1))
    assert not voicecore.is_wav16k(wav(48000, 1)) and not voicecore.is_wav16k(wav(16000, 2))
    assert not voicecore.is_wav16k(b"\x1aE\xdf\xa3 webm") and not voicecore.is_wav16k(b"RIFF\0\0\0\0WAVEjunk")


def test_own_model_wins_when_present(monkeypatch, tmp_path):
    monkeypatch.setattr(voicecore, "CACHE", tmp_path)
    for lang in ("en", "de"):
        (tmp_path / f"whisper-chess-tiny-{lang}.bin").write_bytes(b"x")
    assert voicecore.model_path("de").name == "whisper-chess-tiny-de.bin"
    (tmp_path / voicecore.OWN_MODEL).write_bytes(b"")
    assert voicecore.model_path("en").name == "whisper-chess-tiny-en.bin", "an empty file is never loaded"
    (tmp_path / voicecore.OWN_MODEL).write_bytes(b"x" * (2 * 1024 * 1024))
    assert voicecore.model_path("en") == voicecore.model_path("de") == tmp_path / voicecore.OWN_MODEL


def test_cache_dir_follows_env(monkeypatch, tmp_path):
    monkeypatch.setenv("ZZ_VOICE_DIR", str(tmp_path))
    mod = importlib.reload(voicecore)
    assert mod.CACHE == tmp_path and mod.SAMPLES == tmp_path / "samples"
    monkeypatch.delenv("ZZ_VOICE_DIR")
    importlib.reload(voicecore)


HAVE = all(shutil.which(t) for t in ("whisper-cli", "ffmpeg", "say")) and \
    (voicecore.CACHE / "whisper-chess-tiny-en.bin").exists()


def test_voice_needs_login_and_checks_input(client, mailer):
    assert client.get("/api/voice/health").status_code == 401
    assert client.post("/api/voice/transcribe?lang=en", content=b"abc").status_code == 401
    login(client, mailer, FRIEND)
    assert client.get("/api/voice/health").json() == {"ok": True, "langs": ["de", "en"], "both": True}
    assert client.post("/api/voice/transcribe?lang=xx", content=b"abc").status_code == 400
    assert client.post("/api/voice/transcribe?lang=en", content=b"").status_code == 400
    assert client.post("/api/voice/transcribe?lang=en", content=b"x" * (5 * 1024 * 1024 + 1)).status_code == 413
    assert client.post("/api/voice/sample?lang=en&label=hello", content=b"abc").status_code == 400


@pytest.mark.skipif(not HAVE, reason="model or whisper-cli/ffmpeg/say missing")
def test_hosted_transcribe_and_per_user_samples(client, mailer, settings, tmp_path):
    login(client, mailer, FRIEND)
    aiff = tmp_path / "m.aiff"
    subprocess.run(["say", "-v", "Samantha", "-o", str(aiff), "knight takes c3"], check=True)
    r = client.post("/api/voice/transcribe?lang=en", content=aiff.read_bytes())
    assert r.status_code == 200 and "knight" in r.json()["text"].lower()
    held = client.post("/api/voice/transcribe?lang=en&moves=Nxc3,e4", content=aiff.read_bytes())
    assert held.json()["text"].lower().startswith("knight takes c")
    both = client.post("/api/voice/transcribe?lang=en&moves=Nxc3,e4&both=1", content=aiff.read_bytes()).json()
    assert "knight" in both["text"].lower() and both["grammar"].lower().startswith("knight takes c")
    s = client.post("/api/voice/sample?lang=en&label=Nxc3&heard=x&source=drill", content=aiff.read_bytes())
    assert s.status_code == 200
    assert client.get("/api/voice/samples").json()["en"]["count"] == 1
    assert len(list((settings.data_dir / "samples").glob("*/en/*.wav"))) == 1
    assert not (voicecore.SAMPLES / "en" / s.json()["saved"]).exists()


def test_only_a_whole_model_replaces_the_old_one(client, mailer, monkeypatch, tmp_path):
    import hashlib
    monkeypatch.setattr(voicecore, "CACHE", tmp_path)
    ran = []
    monkeypatch.setattr(voicecore, "smoke_test", lambda p: ran.append(p))
    good = voicecore.GGML_MAGIC + b"\1" * (11 * 1024 * 1024)
    sha = hashlib.sha256(good).hexdigest()
    put = lambda body, h: client.put("/api/voice/model", content=body, headers={"X-Sha256": h})  # noqa: E731

    login(client, mailer, FRIEND)
    assert put(good, sha).status_code == 403
    login(client, mailer, OWNER)
    assert put(b"", hashlib.sha256(b"").hexdigest()).status_code == 400            # the 2026-10-05 empty file
    assert put(good, "0" * 64).json()["detail"].startswith("arrived damaged")
    assert put(b"GGUF" + good[4:], hashlib.sha256(b"GGUF" + good[4:]).hexdigest()).status_code == 400
    assert not (tmp_path / voicecore.OWN_MODEL).exists() and not ran
    r = put(good, sha)
    assert r.status_code == 200 and r.json()["sha256"] == sha and len(ran) == 1
    assert (tmp_path / voicecore.OWN_MODEL).read_bytes() == good
    assert client.delete("/api/voice/model").json() == {"model": "atamano"}
    assert not (tmp_path / voicecore.OWN_MODEL).exists()


def test_samples_keep_where_they_were_said_and_the_owner_can_export_them(client, mailer, settings, monkeypatch):
    import io
    import zipfile
    monkeypatch.setattr(voicecore, "save_sample", lambda audio, lang, label, heard, source, root, extra: (
        (root / lang).mkdir(parents=True, exist_ok=True),
        (root / lang / "a.wav").write_bytes(audio),
        (root / lang / "manifest.jsonl").write_text(__import__("json").dumps({"label": label, "source": source, **extra}) + "\n"),
    ) and {"file": "a.wav"})
    login(client, mailer, OWNER)
    r = client.post("/api/voice/sample?lang=de&label=cmd:nein&source=drill&fen=8/8/8/8/8/8/8/K6k%20w%20-%20-&conf=0.4",
                    content=b"RIFFxxxx")
    assert r.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(client.get("/api/voice/samples/export").content))
    assert sorted(z.namelist()) == ["de/a.wav", "de/manifest.jsonl"]
    row = __import__("json").loads(z.read("de/manifest.jsonl"))
    assert row == {"label": "cmd:nein", "source": "drill", "fen": "8/8/8/8/8/8/8/K6k w - -", "conf": 0.4}
    login(client, mailer, FRIEND)
    assert client.get("/api/voice/samples/export").status_code == 403
