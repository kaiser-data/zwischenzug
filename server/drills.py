"""The private Aagaard bundle lives only on the volume, and only the owner can load or replace it."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from server.auth import owner_user

router = APIRouter(prefix="/api/drills")
MAX = 5 * 1024 * 1024


def _path(request: Request):
    return request.app.state.settings.data_dir / "private" / "bundle.js"


@router.get("/bundle.js")
def get_bundle(request: Request, email: str = Depends(owner_user)):
    path = _path(request)
    if not path.exists():
        raise HTTPException(404, "no drills uploaded — run scripts/push_drills.py")
    return Response(path.read_bytes(), media_type="application/javascript",
                    headers={"Cache-Control": "private, no-store"})


@router.put("/bundle.js")
async def put_bundle(request: Request, email: str = Depends(owner_user)):
    body = await request.body()
    if not body or len(body) > MAX:
        raise HTTPException(400, "bundle missing or over 5 MB")
    path = _path(request)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return {"bytes": len(body)}
