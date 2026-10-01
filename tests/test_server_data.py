import pytest

from server.db import Db
from server.ratelimit import RateLimit
from server.settings import Settings
from server_fixtures import FRIEND, OWNER, login


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


def test_googlemail_and_gmail_are_one_address(tmp_path):
    s = Settings(data_dir=tmp_path, allowed=frozenset({"f@gmail.com"}), owner="m@gmail.com", secret="k" * 40,
                 site_url="")
    assert s.is_allowed("M@googlemail.com") and s.is_owner("m@googlemail.com") and s.is_owner("m@gmail.com")
    assert s.is_allowed("f@googlemail.com") and not s.is_owner("f@gmail.com")


def test_owner_from_env_is_canonical(monkeypatch, tmp_path):
    monkeypatch.setenv("ZZ_DATA", str(tmp_path))
    monkeypatch.setenv("SESSION_SECRET", "s" * 32)
    monkeypatch.setenv("OWNER_EMAIL", "Martin@GoogleMail.com")
    s = Settings.from_env()
    assert s.owner == "martin@gmail.com" and s.is_owner("martin@googlemail.com")


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


def test_drills_are_owner_only(client, mailer):
    login(client, mailer, FRIEND)
    assert client.get("/api/drills/bundle.js").status_code == 403
    assert client.put("/api/drills/bundle.js", content=b"x").status_code == 403
    client.cookies.clear()
    login(client, mailer, OWNER)
    assert client.get("/api/drills/bundle.js").status_code == 404
    assert client.put("/api/drills/bundle.js", content=b"window.PATH_PRIVATE = {};").status_code == 200
    r = client.get("/api/drills/bundle.js")
    assert r.status_code == 200 and r.text == "window.PATH_PRIVATE = {};"
    assert r.headers["content-type"].startswith("application/javascript")
    assert r.headers["cache-control"] == "private, no-store"


def test_progress_round_trip_and_conflict(client, mailer):
    assert client.get("/api/progress").status_code == 401
    login(client, mailer, FRIEND)
    assert client.get("/api/progress").json() == {"state": None, "updated": None}
    first = client.put("/api/progress", json={"state": {"progress": {"a": 1}}, "base": None}).json()["updated"]
    stale = client.put("/api/progress", json={"state": {"progress": {"a": 2}}, "base": first - 1})
    assert stale.status_code == 409 and stale.json()["state"] == {"progress": {"a": 1}}
    assert client.put("/api/progress", json={"state": {"progress": {"a": 2}}, "base": first}).status_code == 200
    assert client.get("/api/progress").json()["state"] == {"progress": {"a": 2}}
