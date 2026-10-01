import pytest

from server.db import Db
from server.ratelimit import RateLimit
from server.settings import Settings


def test_settings_from_env(monkeypatch, tmp_path):
    monkeypatch.setenv("ZZ_DATA", str(tmp_path))
    monkeypatch.setenv("ALLOWED_EMAILS", " A@x.de, b@y.org ")
    monkeypatch.setenv("OWNER_EMAIL", "O@X.de")
    monkeypatch.setenv("SESSION_SECRET", "s" * 32)
    monkeypatch.setenv("SITE_URL", "https://zz.example/")
    s = Settings.from_env()
    assert s.is_allowed("a@x.de") and s.is_allowed("B@Y.org") and not s.is_allowed("c@z.com")
    assert s.owner == "o@x.de" and s.is_allowed("o@x.de") and s.site_url == "https://zz.example"
    assert not s.is_allowed("")


def test_short_secret_refuses_to_start(monkeypatch, tmp_path):
    monkeypatch.setenv("ZZ_DATA", str(tmp_path))
    monkeypatch.setenv("SESSION_SECRET", "short")
    with pytest.raises(SystemExit):
        Settings.from_env()


def test_empty_owner_allows_nobody_by_default(tmp_path):
    s = Settings(data_dir=tmp_path, allowed=frozenset(), owner="", secret="k" * 40, site_url="")
    assert not s.is_allowed("") and not s.is_allowed("a@x.de")


def test_tokens_are_single_use_and_expire(tmp_path):
    db = Db(tmp_path / "zz.db")
    db.add_token("a@x.de", "h1", expires=100.0)
    assert db.take_token("h1", now=50.0) == "a@x.de"
    assert db.take_token("h1", now=50.0) is None
    db.add_token("a@x.de", "h2", expires=100.0)
    assert db.take_token("h2", now=101.0) is None
    assert db.take_token("nope", now=0.0) is None
    assert db.recent_tokens("a@x.de", since=0.0) == 2


def test_progress_conflict(tmp_path):
    db = Db(tmp_path / "zz.db")
    assert db.get_progress("a@x.de") is None
    ok, state, at = db.put_progress("a@x.de", {"progress": {"s": 1}}, base=None, now=10.0)
    assert ok and at == 10.0
    ok, state, at = db.put_progress("a@x.de", {"progress": {"s": 2}}, base=5.0, now=11.0)
    assert not ok and state == {"progress": {"s": 1}} and at == 10.0
    ok, _, at = db.put_progress("a@x.de", {"progress": {"s": 2}}, base=10.0, now=12.0)
    assert ok and db.get_progress("a@x.de") == ({"progress": {"s": 2}}, 12.0)


def test_rate_limit_window():
    rl = RateLimit(2, 60)
    assert rl.hit("k", 0) and rl.hit("k", 1) and not rl.hit("k", 2)
    assert rl.hit("k", 61) and rl.hit("other", 2)
