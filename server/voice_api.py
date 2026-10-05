"""Hosted twin of scripts/voice_server.py: same answers, behind login, samples kept per user."""
from __future__ import annotations

import hashlib
import subprocess
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from server import voicecore
from server.auth import current_user, owner_user

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
    return {"ok": True, "langs": sorted(voicecore.MODELS), "both": True}


@router.post("/transcribe")
async def transcribe(request: Request, lang: str = "en", moves: str = "", both: int = 0,
                     email: str = Depends(current_user)):
    audio = await _audio(request, lang, email)
    legal = [m for m in moves.split(",") if m]
    start = time.time()
    try:
        if both and legal:
            out = await run_in_threadpool(voicecore.transcribe_both, audio, lang, legal)
        else:
            out = {"text": await run_in_threadpool(voicecore.transcribe, audio, lang, legal or None)}
    except (subprocess.SubprocessError, OSError) as e:
        raise HTTPException(500, f"transcription failed: {e}") from None
    return {**out, "ms": round((time.time() - start) * 1000)}


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


MODEL_MIN, MODEL_MAX = 10 * 1024 * 1024, 400 * 1024 * 1024


@router.put("/model")
async def put_model(request: Request, email: str = Depends(owner_user)):
    """Our own speech model (scripts/voice_ft/push_model.py). Taken only when it arrived whole —
    size, ggml magic, the sha256 the sender names — and whisper-cli runs with it; else the old one stays."""
    want = (request.headers.get("x-sha256") or "").lower()
    if len(want) != 64:
        raise HTTPException(400, "send the file's sha256 in X-Sha256")
    dest = voicecore.CACHE / voicecore.OWN_MODEL
    part = dest.with_suffix(".part")
    dest.parent.mkdir(parents=True, exist_ok=True)
    digest, size = hashlib.sha256(), 0
    with part.open("wb") as f:
        async for chunk in request.stream():
            size += len(chunk)
            if size > MODEL_MAX:
                part.unlink(missing_ok=True)
                raise HTTPException(413, "model over 400 MB")
            digest.update(chunk)
            f.write(chunk)
    got = digest.hexdigest()
    problem = ("too small to be a model" if size < MODEL_MIN else
               "not a whisper.cpp model" if part.read_bytes()[:4] != voicecore.GGML_MAGIC else
               f"arrived damaged (sha256 {got[:16]}…)" if got != want else "")
    if not problem:
        try:
            await run_in_threadpool(voicecore.smoke_test, part)
        except (subprocess.SubprocessError, OSError) as e:
            problem = f"whisper-cli cannot run it: {e}"
    if problem:
        part.unlink(missing_ok=True)
        raise HTTPException(400, problem + " — the old model stays")
    part.replace(dest)
    return {"sha256": got, "bytes": size}


@router.delete("/model")
def delete_model(email: str = Depends(owner_user)):
    """Back to atamano's models."""
    (voicecore.CACHE / voicecore.OWN_MODEL).unlink(missing_ok=True)
    return {"model": "atamano"}
