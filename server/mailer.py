"""Sends the login link. Resend in production, a list in tests."""
from __future__ import annotations

import httpx


class ResendMailer:
    def __init__(self, key: str, sender: str):
        self.key, self.sender = key, sender

    def send(self, to: str, subject: str, text: str) -> None:
        r = httpx.post("https://api.resend.com/emails", timeout=15,
                       headers={"Authorization": f"Bearer {self.key}"},
                       json={"from": self.sender, "to": [to], "subject": subject, "text": text})
        r.raise_for_status()


class FakeMailer:
    def __init__(self):
        self.sent: list[tuple[str, str, str]] = []

    def send(self, to: str, subject: str, text: str) -> None:
        self.sent.append((to, subject, text))
