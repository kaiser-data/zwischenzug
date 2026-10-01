import importlib

from server import voicecore


def test_spoken_forms_and_grammar():
    assert voicecore.spoken("Nxc3", "en")[0] == "knight takes C. three"
    assert voicecore.spoken("Nxc3", "de")[0] == "springer schlägt c drei"
    g = voicecore.grammar(["Nxc3", "O-O"], "en")
    assert g.startswith("root ::=") and '"castles kingside"' in g


def test_labels():
    assert voicecore.valid_label("Rac1") and voicecore.valid_label("O-O+")
    assert not voicecore.valid_label("hello")


def test_cache_dir_follows_env(monkeypatch, tmp_path):
    monkeypatch.setenv("ZZ_VOICE_DIR", str(tmp_path))
    mod = importlib.reload(voicecore)
    assert mod.CACHE == tmp_path and mod.SAMPLES == tmp_path / "samples"
    monkeypatch.delenv("ZZ_VOICE_DIR")
    importlib.reload(voicecore)
