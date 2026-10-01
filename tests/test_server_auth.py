from dataclasses import replace

from server_fixtures import FRIEND, OWNER, STRANGER, link_in, login


def test_health_is_open(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_request_reply_does_not_reveal_the_list(client, mailer):
    a = client.post("/api/auth/request", json={"email": STRANGER})
    b = client.post("/api/auth/request", json={"email": FRIEND})
    assert a.status_code == b.status_code == 200 and a.json() == b.json() == {"sent": True}
    assert [m[0] for m in mailer.sent] == [FRIEND]


def test_magic_link_logs_in_once(client, mailer):
    r = login(client, mailer, FRIEND.upper())
    assert r.status_code == 303 and r.headers["location"] == "/"
    assert "HttpOnly" in r.headers["set-cookie"] and "SameSite=lax" in r.headers["set-cookie"]
    assert client.get("/api/auth/me").json() == {"email": FRIEND, "owner": False}
    client.cookies.clear()
    again = client.get(link_in(mailer.sent[-1]), follow_redirects=False)
    assert again.headers["location"] == "/?login=expired"
    assert client.get("/api/auth/me").status_code == 401


def test_forged_cookie_is_refused(client):
    client.cookies.set("zz_session", "friend@x.de.forged")
    assert client.get("/api/auth/me").status_code == 401


def test_request_is_rate_limited(client, mailer):
    for _ in range(5):
        client.post("/api/auth/request", json={"email": FRIEND})
    assert len(mailer.sent) == 3


def test_mail_failure_gives_the_same_reply(client):
    def boom(*a):
        raise RuntimeError("smtp down")
    client.app.state.mailer.send = boom
    assert client.post("/api/auth/request", json={"email": FRIEND}).json() == {"sent": True}


def test_google_login(client):
    assert client.post("/api/auth/google", json={"credential": "garbage"}).status_code == 401
    assert client.post("/api/auth/google", json={"credential": "ok:" + STRANGER}).status_code == 403
    r = client.post("/api/auth/google", json={"credential": "ok:" + OWNER.upper()})
    assert r.json() == {"email": OWNER, "owner": True}
    assert client.get("/api/auth/me").json()["owner"] is True


def test_unverified_google_email_is_refused(client):
    client.app.state.google_verify = lambda c: {"email": FRIEND, "email_verified": False}
    assert client.post("/api/auth/google", json={"credential": "x"}).status_code == 401


def test_removed_from_list_loses_access(client, mailer, settings):
    login(client, mailer, FRIEND)
    client.app.state.settings = replace(settings, allowed=frozenset())
    assert client.get("/api/auth/me").status_code == 401


def test_logout(client, mailer):
    login(client, mailer, FRIEND)
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_google_login_with_googlemail_spelling(client, settings):
    client.app.state.settings = replace(settings, owner="m@googlemail.com")
    r = client.post("/api/auth/google", json={"credential": "ok:M@gmail.com"})
    assert r.json() == {"email": "m@gmail.com", "owner": True}
    assert client.get("/api/drills/bundle.js").status_code == 404
