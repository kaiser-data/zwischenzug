"""The hosted Zwischenzug service: uvicorn server.app:app"""
from __future__ import annotations

from fastapi import FastAPI

from server import auth
from server.db import Db
from server.mailer import ResendMailer
from server.ratelimit import RateLimit
from server.settings import Settings


def create_app(settings: Settings, mailer=None, google_verify=None, engine=None) -> FastAPI:
    app = FastAPI(title="Zwischenzug", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.db = Db(settings.data_dir / "zz.db")
    app.state.mailer = mailer or ResendMailer(settings.resend_key, settings.mail_from)
    app.state.google_verify = google_verify or auth.google_verifier(settings.google_client_id)
    app.state.engine = engine
    app.state.link_email_limit = RateLimit(3, auth.LINK_TTL)
    app.state.link_ip_limit = RateLimit(20, 3600)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    app.include_router(auth.router)
    return app


def __getattr__(name: str):
    # `uvicorn server.app:app` builds the real app from the environment; tests never touch this.
    if name == "app":
        global app
        app = create_app(Settings.from_env())
        return app
    raise AttributeError(name)
