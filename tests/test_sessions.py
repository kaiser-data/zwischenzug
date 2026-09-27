"""Session JSON is checked at bundle time: an illegal SAN would leave Lock closed forever."""
import copy
import importlib.util
import json
import pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("bundle_sessions", ROOT / "scripts" / "bundle_sessions.py")
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)

PUBLIC = sorted((ROOT / "sessions").glob("*.json"))


def load(path):
    return json.loads(path.read_text())


@pytest.mark.parametrize("path", PUBLIC, ids=[p.stem for p in PUBLIC])
def test_every_public_session_is_valid(path):
    assert bundle.validate(path.stem, load(path)) == []


@pytest.fixture
def clean():
    return load(ROOT / "sessions" / "6yfxgu80.json")


def test_illegal_must_play_is_reported(clean):
    broken = copy.deepcopy(clean)
    broken["steps"][0]["mustPlay"][1] = "Nf3"          # White's move where Black is to play
    assert any("opening" in e and "mustPlay" in e for e in bundle.validate("x", broken))


def test_illegal_branch_and_solve_are_reported(clean):
    broken = copy.deepcopy(clean)
    broken["steps"][1]["solve"]["line"][2] = "Qxg8"
    broken["steps"][2]["branches"][0]["mustPlay"].append("Ke2")
    errors = bundle.validate("x", broken)
    assert any("knockout" in e and "solve" in e for e in errors)
    assert any("desperado" in e for e in errors)


def test_bad_alternative_and_given_are_reported(clean):
    broken = copy.deepcopy(clean)
    b = broken["steps"][2]["branches"][3]
    b["alts"] = [["f6", "Bxh7"]]
    b["given"] = 9
    errors = bundle.validate("x", broken)
    assert any("alts" in e for e in errors)
    assert any("given" in e for e in errors)


def test_unknown_category_and_duplicate_ids_are_reported(clean):
    broken = copy.deepcopy(clean)
    broken["category"] = "lucky"
    broken["steps"][1]["id"] = "opening"
    errors = bundle.validate("x", broken)
    assert any("category" in e for e in errors)
    assert any("duplicate step id" in e for e in errors)


def test_bundle_refuses_a_broken_session(tmp_path, clean):
    broken = copy.deepcopy(clean)
    broken["steps"][0]["fen"] = "not a fen"
    (tmp_path / "bad.json").write_text(json.dumps(broken))
    with pytest.raises(SystemExit):
        bundle.check_all({"bad": broken})
