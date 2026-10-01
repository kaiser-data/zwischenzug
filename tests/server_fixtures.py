"""Shared fixtures for the hosted service tests: a TestClient with a fake mailer and fake Google."""
import re

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.mailer import FakeMailer
from server.settings import Settings

OWNER, FRIEND, STRANGER = "owner@x.de", "friend@x.de", "stranger@x.de"


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path, allowed=frozenset({FRIEND}), owner=OWNER, secret="k" * 40,
                    site_url="https://zz.test", google_client_id="cid", secure_cookie=False)


@pytest.fixture
def mailer():
    return FakeMailer()


def fake_google(credential: str) -> dict:
    if not credential.startswith("ok:"):
        raise ValueError("bad token")
    return {"email": credential[3:], "email_verified": True, "aud": "cid"}


@pytest.fixture
def client(settings, mailer):
    return TestClient(create_app(settings, mailer=mailer, google_verify=fake_google))


def link_in(mail) -> str:
    return re.search(r"https://zz\.test(/api/auth/verify\?t=\S+)", mail[2]).group(1)


def login(client, mailer, email):
    """Log in through the mailed link; returns the verify response."""
    client.post("/api/auth/request", json={"email": email})
    return client.get(link_in(mailer.sent[-1]), follow_redirects=False)
