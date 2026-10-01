"""Invite-only login. Ways in, all ending in the same signed 30-day cookie:
- a one-time link: printed for the owner by `python -m server.login_link` (scan it as a QR code),
  made by the owner's Invite button for a friend, or mailed (only when RESEND_API_KEY is set);
- Google, when GOOGLE_CLIENT_ID is set.
Access is checked on every request: ALLOWED_EMAILS / OWNER_EMAIL from the environment, or an invite
the owner made. Removing an email from the env list locks that person out at once."""
from __future__ import annotations

import hashlib
import logging
import secrets
import time

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel

from server.settings import canonical

COOKIE = "zz_session"
MAX_AGE = 30 * 24 * 3600
LINK_TTL = 15 * 60
INVITE_TTL = 7 * 24 * 3600
log = logging.getLogger("zz.auth")
router = APIRouter(prefix="/api/auth")


def _signer(request: Request) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(request.app.state.settings.secret, salt="zz-session")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _session(request: Request, email: str, response):
    request.app.state.db.touch_user(email)
    response.set_cookie(COOKIE, _signer(request).dumps(email), max_age=MAX_AGE, httponly=True,
                        secure=request.app.state.settings.secure_cookie, samesite="lax", path="/")
    return response


def allowed(request: Request, email: str) -> bool:
    email = canonical(email)
    return request.app.state.settings.is_allowed(email) or request.app.state.db.is_invited(email)


def new_link(db, site_url: str, email: str, ttl: float) -> str:
    """A one-time sign-in link for `email`, valid `ttl` seconds."""
    token = secrets.token_urlsafe(32)
    db.add_token(email, _hash(token), time.time() + ttl)
    return f"{site_url}/api/auth/verify?t={token}"


def current_user(request: Request) -> str:
    raw = request.cookies.get(COOKIE)
    try:
        email = _signer(request).loads(raw, max_age=MAX_AGE) if raw else None
    except BadSignature:
        email = None
    if not email or not allowed(request, email):
        raise HTTPException(401, "sign in")
    return email


def owner_user(request: Request) -> str:
    email = current_user(request)
    if not request.app.state.settings.is_owner(email):
        raise HTTPException(403, "owner only")
    return email


class EmailIn(BaseModel):
    email: str


class GoogleIn(BaseModel):
    credential: str


@router.post("/request")
def request_link(body: EmailIn, request: Request):
    # Same reply for every address, so the page cannot be used to probe who is invited.
    email = canonical(body.email)
    state = request.app.state
    ip = request.client.host if request.client else "?"
    if allowed(request, email) and state.link_ip_limit.hit(ip) and state.link_email_limit.hit(email):
        link = new_link(state.db, state.settings.site_url, email, LINK_TTL)
        try:
            state.mailer.send(email, "Zwischenzug — sign in",
                              f"Open this link to sign in (valid 15 minutes, once):\n\n{link}\n\n"
                              "If you did not ask for it, ignore this mail.\n")
        except Exception:  # noqa: BLE001 — a mail error must not tell the page whether the email is listed
            log.exception("login mail failed")
    return {"sent": True}


@router.get("/verify")
def verify(t: str, request: Request):
    email = request.app.state.db.take_token(_hash(t), time.time())
    if not email or not allowed(request, email):
        return RedirectResponse("/?login=expired", status_code=303)
    return _session(request, email, RedirectResponse("/", status_code=303))


@router.post("/google")
def google(body: GoogleIn, request: Request):
    try:
        claims = request.app.state.google_verify(body.credential)
    except Exception:  # noqa: BLE001 — any verification error is a failed sign-in
        raise HTTPException(401, "Google sign-in failed")
    if not claims.get("email_verified"):
        raise HTTPException(401, "Google email not verified")
    email = canonical(str(claims.get("email", "")))
    settings = request.app.state.settings
    if not allowed(request, email):
        raise HTTPException(403, "this email is not invited")
    return _session(request, email, JSONResponse({"email": email, "owner": settings.is_owner(email)}))


@router.post("/invite")
def invite(body: EmailIn, request: Request):
    """Owner only: let `email` in and return a one-time link to send them (valid 7 days)."""
    owner = owner_user(request)
    email = canonical(body.email)
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise HTTPException(400, "give an email address")
    state = request.app.state
    state.db.add_invite(email, owner)
    return {"email": email, "link": new_link(state.db, state.settings.site_url, email, INVITE_TTL)}


@router.get("/me")
def me(request: Request):
    email = current_user(request)
    return {"email": email, "owner": request.app.state.settings.is_owner(email)}


@router.post("/logout")
def logout():
    r = JSONResponse({"ok": True})
    r.delete_cookie(COOKIE, path="/")
    return r


def google_verifier(client_id: str):
    """Checks a Google Identity Services credential: signature, expiry, and audience = our client."""
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    def verify(credential: str) -> dict:
        if not client_id:
            raise ValueError("GOOGLE_CLIENT_ID not set")
        return id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
    return verify
