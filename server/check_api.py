"""POST /api/check — the page calls it only after he has submitted (locked) his line."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from server.auth import current_user
from server.engine import IllegalPly, check_line

router = APIRouter(prefix="/api")


class LineIn(BaseModel):
    fen: str
    line: list[str]


@router.post("/check")
def check(body: LineIn, request: Request, email: str = Depends(current_user)):
    if not request.app.state.check_limit.hit(email):
        raise HTTPException(429, "too many checks — one per submitted line")
    engine = request.app.state.engine
    if engine is None:
        raise HTTPException(503, "engine check unavailable — your line is saved")
    try:
        return check_line(engine, body.fen, body.line)
    except IllegalPly as e:
        raise HTTPException(400, {"ply": e.index, "san": e.san}) from None
    except ValueError:
        raise HTTPException(400, {"ply": 0, "san": "", "error": "bad position"}) from None
