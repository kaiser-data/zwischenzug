"""SQLite on the data volume: users, one-time login tokens, progress. One file, one service process."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path

SCHEMA = """
create table if not exists users (email text primary key, created real not null, last_login real not null);
create table if not exists login_tokens (hash text primary key, email text not null, created real not null,
                                         expires real not null, used integer not null default 0);
create table if not exists invites (email text primary key, invited_by text not null, created real not null);
create table if not exists progress (email text primary key, state text not null, updated real not null);
"""


class Db:
    def __init__(self, path: Path):
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.lock = threading.Lock()
        with self.lock:
            self.conn.executescript(SCHEMA)

    def _run(self, sql: str, args: tuple = ()) -> list[tuple]:
        with self.lock, self.conn:
            return self.conn.execute(sql, args).fetchall()

    def touch_user(self, email: str) -> None:
        now = time.time()
        self._run("insert into users values (?, ?, ?) on conflict(email) do update set last_login = ?",
                  (email, now, now, now))

    def add_invite(self, email: str, invited_by: str) -> None:
        self._run("insert into invites values (?, ?, ?) on conflict(email) do nothing", (email, invited_by, time.time()))

    def is_invited(self, email: str) -> bool:
        return bool(self._run("select 1 from invites where email = ?", (email,)))

    def add_token(self, email: str, token_hash: str, expires: float) -> None:
        self._run("insert into login_tokens (hash, email, created, expires) values (?, ?, ?, ?)",
                  (token_hash, email, time.time(), expires))

    def take_token(self, token_hash: str, now: float) -> str | None:
        """The email a link belongs to — once, and only before it expires."""
        with self.lock, self.conn:
            row = self.conn.execute("select email, expires, used from login_tokens where hash = ?",
                                    (token_hash,)).fetchone()
            if not row or row[2] or row[1] < now:
                return None
            self.conn.execute("update login_tokens set used = 1 where hash = ?", (token_hash,))
            return row[0]

    def recent_tokens(self, email: str, since: float) -> int:
        return self._run("select count(*) from login_tokens where email = ? and created >= ?", (email, since))[0][0]

    def get_progress(self, email: str) -> tuple[dict, float] | None:
        rows = self._run("select state, updated from progress where email = ?", (email,))
        return (json.loads(rows[0][0]), rows[0][1]) if rows else None

    def put_progress(self, email: str, state: dict, base: float | None, now: float) -> tuple[bool, dict, float]:
        """Write only if the writer saw the latest version; otherwise return that version."""
        with self.lock, self.conn:
            row = self.conn.execute("select state, updated from progress where email = ?", (email,)).fetchone()
            if row and (base is None or base < row[1]):
                return False, json.loads(row[0]), row[1]
            self.conn.execute("insert into progress values (?, ?, ?) on conflict(email) do update "
                              "set state = excluded.state, updated = excluded.updated",
                              (email, json.dumps(state), now))
            return True, state, now
