"""Everything the service reads from the environment. Nothing here is ever committed with values."""
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path


def _emails(raw: str) -> frozenset[str]:
    return frozenset(e.strip().lower() for e in raw.split(",") if e.strip())


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    allowed: frozenset[str]
    owner: str
    secret: str
    site_url: str
    google_client_id: str = ""
    resend_key: str = ""
    mail_from: str = ""
    stockfish: str = ""
    secure_cookie: bool = True

    def is_allowed(self, email: str) -> bool:
        email = email.strip().lower()
        return bool(email) and (email == self.owner or email in self.allowed)

    @classmethod
    def from_env(cls) -> "Settings":
        secret = os.environ.get("SESSION_SECRET", "")
        if len(secret) < 32:
            raise SystemExit("SESSION_SECRET must be at least 32 characters")
        data = Path(os.environ.get("ZZ_DATA") or "/data")
        data.mkdir(parents=True, exist_ok=True)
        return cls(
            data_dir=data,
            allowed=_emails(os.environ.get("ALLOWED_EMAILS", "")),
            owner=os.environ.get("OWNER_EMAIL", "").strip().lower(),
            secret=secret,
            site_url=os.environ.get("SITE_URL", "").rstrip("/"),
            google_client_id=os.environ.get("GOOGLE_CLIENT_ID", ""),
            resend_key=os.environ.get("RESEND_API_KEY", ""),
            mail_from=os.environ.get("MAIL_FROM", ""),
            stockfish=os.environ.get("STOCKFISH") or shutil.which("stockfish") or "",
            secure_cookie=os.environ.get("INSECURE_COOKIE") != "1",
        )
