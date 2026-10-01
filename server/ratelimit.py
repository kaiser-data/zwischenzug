"""Sliding-window limiter, in memory: the service runs as one process."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimit:
    def __init__(self, limit: int, per_seconds: float):
        self.limit, self.per = limit, per_seconds
        self.hits: dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def hit(self, key: str, now: float | None = None) -> bool:
        """Count one hit; False when the key is over its limit for the window."""
        now = time.time() if now is None else now
        with self.lock:
            q = self.hits[key]
            while q and q[0] <= now - self.per:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True
