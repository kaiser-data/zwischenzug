"""PathStore state per user. A write wins only if it saw the latest version (409 + that version otherwise)."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from server.auth import current_user

router = APIRouter(prefix="/api")


class ProgressIn(BaseModel):
    state: dict
    base: float | None = None


@router.get("/progress")
def get_progress(request: Request, email: str = Depends(current_user)):
    row = request.app.state.db.get_progress(email)
    return {"state": row[0], "updated": row[1]} if row else {"state": None, "updated": None}


@router.put("/progress")
def put_progress(body: ProgressIn, request: Request, email: str = Depends(current_user)):
    ok, state, updated = request.app.state.db.put_progress(email, body.state, body.base, time.time())
    if not ok:
        return JSONResponse({"state": state, "updated": updated}, status_code=409)
    return {"updated": updated}
