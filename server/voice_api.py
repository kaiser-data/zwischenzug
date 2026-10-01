"""Hosted twin of scripts/voice_server.py: same answers, behind login, samples kept per user."""
from __future__ import annotations

import hashlib
import subprocess
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from server import voicecore
from server.auth import current_user

router = APIRouter(prefix="/api/voice")


def _user_samples(request: Request, email: str):
    return request.app.state.settings.data_dir / "samples" / hashlib.sha256(email.encode()).hexdigest()[:12]


async def _audio(request: Request, lang: str, email: str) -> bytes:
    if lang not in voicecore.MODELS:
        raise HTTPException(400, f"lang must be one of {sorted(voicecore.MODELS)}")
    if not request.app.state.voice_limit.hit(email):
        raise HTTPException(429, "too many recordings — slow down")
    if int(request.headers.get("content-length") or 0) > voicecore.MAX_BODY:
        raise HTTPException(413, "send one short recording (≤ 5 MB)")
    audio = await request.body()
    if not audio:
        raise HTTPException(400, "send one short recording (≤ 5 MB)")
    if len(audio) > voicecore.MAX_BODY:
        raise HTTPException(413, "send one short recording (≤ 5 MB)")
    return audio


@router.get("/health")
def health(email: str = Depends(current_user)):
    return {"ok": True, "langs": sorted(voicecore.MODELS)}


@router.post("/transcribe")
async def transcribe(request: Request, lang: str = "en", moves: str = "", email: str = Depends(current_user)):
    audio = await _audio(request, lang, email)
    start = time.time()
    try:
        text = await run_in_threadpool(voicecore.transcribe, audio, lang, [m for m in moves.split(",") if m] or None)
    except (subprocess.SubprocessError, OSError) as e:
        raise HTTPException(500, f"transcription failed: {e}") from None
    return {"text": text, "ms": round((time.time() - start) * 1000)}


@router.post("/sample")
async def sample(request: Request, lang: str = "en", label: str = "", heard: str = "", source: str = "drill",
                 email: str = Depends(current_user)):
    if not voicecore.valid_label(label):
        raise HTTPException(400, "label must be one SAN move")
    audio = await _audio(request, lang, email)
    root = _user_samples(request, email)
    try:
        row = await run_in_threadpool(voicecore.save_sample, audio, lang, label, heard, source, root)
    except (subprocess.SubprocessError, OSError) as e:
        raise HTTPException(500, f"could not save: {e}") from None
    return {"saved": row["file"], "stats": voicecore.sample_stats(root).get(lang)}


@router.get("/samples")
def samples(request: Request, email: str = Depends(current_user)):
    return voicecore.sample_stats(_user_samples(request, email))
