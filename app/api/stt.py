import asyncio
import math
import os
import secrets
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from app.services.stt_client import SharedSttClient, SttClientError
router = APIRouter(prefix="/api/stt", tags=["stt"])
STT_STATES = {"queued", "running", "completed", "failed", "cancelled"}


def require_stt_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    host = request.headers.get("host")
    expected = f"{request.url.scheme}://{host}" if host else ""
    parsed = urlsplit(origin or "")
    if not origin or parsed.scheme not in {"http", "https"} or parsed.path or parsed.query or parsed.fragment or origin != expected:
        raise HTTPException(status_code=403, detail="Invalid request origin")


class SttCreateResponse(BaseModel):
    job_id: str
    status: str


class SttStatusResponse(BaseModel):
    id: str
    filename: str
    status: str
    language: str | None = None
    error: str | None = None
    created_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None


class SttResultResponse(BaseModel):
    language: str | None = None
    language_probability: float | None = Field(default=None, ge=0, le=1)
    segments: list[dict]


@dataclass
class Job:
    upstream_id: str
    filename: str
    created_at: float
    status: str = "queued"
    active_counted: bool = True


class JobStore:
    def __init__(self, settings):
        self.settings = settings
        self.jobs: dict[str, Job] = {}
        self.lock = asyncio.Lock()
        self.active = 0

    async def reserve(self):
        async with self.lock:
            self._prune_locked()
            if self.active >= self.settings.stt_max_active_jobs:
                raise HTTPException(status_code=429, detail="STT active job limit reached")
            if len(self.jobs) >= self.settings.stt_max_jobs:
                terminal = [(job.created_at, editor_id) for editor_id, job in self.jobs.items() if not job.active_counted]
                if terminal:
                    _, editor_id = min(terminal)
                    del self.jobs[editor_id]
                else:
                    raise HTTPException(status_code=503, detail="STT job store is full")
            self.active += 1

    async def release_reservation(self):
        async with self.lock:
            self.active = max(0, self.active - 1)

    async def add(self, upstream_id: str, filename: str) -> str:
        async with self.lock:
            self._prune_locked()
            if len(self.jobs) >= self.settings.stt_max_jobs:
                terminal = [(job.created_at, editor_id) for editor_id, job in self.jobs.items() if not job.active_counted]
                if terminal:
                    _, editor_id = min(terminal)
                    del self.jobs[editor_id]
            if len(self.jobs) >= self.settings.stt_max_jobs:
                self.active = max(0, self.active - 1)
                raise HTTPException(status_code=503, detail="STT job store is full")
            editor_id = secrets.token_urlsafe(32)
            while editor_id in self.jobs:
                editor_id = secrets.token_urlsafe(32)
            self.jobs[editor_id] = Job(upstream_id=upstream_id, filename=filename, created_at=time.time())
            return editor_id

    async def get(self, editor_id: str) -> Job:
        async with self.lock:
            self._prune_locked()
            job = self.jobs.get(editor_id)
            if not job:
                raise HTTPException(status_code=404, detail="STT job not found")
            return job

    async def update(self, editor_id: str, status: str):
        async with self.lock:
            job = self.jobs.get(editor_id)
            if job and status in STT_STATES:
                job.status = status
                if status in {"completed", "failed", "cancelled"} and job.active_counted:
                    self.active = max(0, self.active - 1)
                    job.active_counted = False

    def _prune_locked(self):
        cutoff = time.time() - self.settings.stt_job_ttl_seconds
        for editor_id, job in list(self.jobs.items()):
            if job.created_at < cutoff and not job.active_counted:
                del self.jobs[editor_id]


def _client(request: Request) -> SharedSttClient:
    settings = request.app.state.settings
    if not settings.stt_api_key:
        raise HTTPException(status_code=503, detail="STT integration is not configured")
    return SharedSttClient(settings.stt_base_url, settings.stt_api_key, settings.stt_connect_timeout_seconds, settings.stt_upload_timeout_seconds, settings.stt_request_timeout_seconds, settings.stt_poll_retry_count)


def _upstream_error(error: SttClientError) -> HTTPException:
    if error.status_code in {400, 401, 404, 409, 429}:
        messages = {400: "STT request rejected", 401: "STT authentication failed", 404: "STT job not found", 409: "STT result is not ready", 429: "STT active job limit reached"}
        return HTTPException(status_code=error.status_code, detail=messages[error.status_code])
    return HTTPException(status_code=502, detail="STT service unavailable" if error.kind == "connection_error" or error.status_code else "Invalid STT service response")


def _safe_filename(value: str | None) -> str:
    filename = Path(value or "upload.bin").name
    filename = "".join(char for char in filename if ord(char) >= 32 and char not in {"\x7f", '"'})
    return filename[:200] or "upload.bin"


def _safe_status(job: Job, payload: dict, editor_id: str) -> SttStatusResponse:
    status = payload.get("status")
    if status not in STT_STATES:
        raise HTTPException(status_code=502, detail="Invalid STT job status")
    error = "STT job failed" if status == "failed" else "STT job cancelled" if status == "cancelled" else None
    timestamps = {name: payload.get(name) if isinstance(payload.get(name), str) else None for name in ("created_at", "started_at", "finished_at")}
    return SttStatusResponse(id=editor_id, filename=job.filename, status=status, language=payload.get("language") if isinstance(payload.get("language"), str) else None, error=error, **timestamps)


@router.post("/transcriptions", response_model=SttCreateResponse, status_code=202)
async def create_transcription(request: Request, _: None = Depends(require_stt_origin), file: UploadFile = File(...), language: str = Form("auto")):
    if language not in {"auto", "ko", "en"}:
        raise HTTPException(status_code=400, detail="Invalid STT language")
    client = _client(request)
    store = request.app.state.stt_store
    settings = request.app.state.settings
    temp_path = None
    reserved = False
    filename = _safe_filename(file.filename)
    try:
        with tempfile.NamedTemporaryFile(prefix="vedit-stt-", suffix=".upload", delete=False) as temp:
            temp_path = temp.name
            total = 0
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > settings.stt_max_upload_bytes:
                    raise HTTPException(status_code=413, detail="STT upload exceeds the maximum size")
                temp.write(chunk)
        await store.reserve()
        reserved = True
        try:
            submission = asyncio.create_task(asyncio.to_thread(client.submit, temp_path, filename, file.content_type, language))
            try:
                payload = await asyncio.shield(submission)
            except asyncio.CancelledError:
                await submission
                raise
        except SttClientError as error:
            raise _upstream_error(error) from error
        if payload.get("status") != "queued" or not isinstance(payload.get("job_id"), str) or not payload["job_id"]:
            raise HTTPException(status_code=502, detail="Invalid STT submission response")
        editor_id = await store.add(payload["job_id"], filename)
        reserved = False
        return SttCreateResponse(job_id=editor_id, status="queued")
    finally:
        if reserved:
            await store.release_reservation()
        await file.close()
        if temp_path:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass


@router.get("/jobs/{editor_job_id}", response_model=SttStatusResponse)
async def get_transcription_status(request: Request, editor_job_id: str):
    store = request.app.state.stt_store
    job = await store.get(editor_job_id)
    try:
        payload = await asyncio.to_thread(_client(request).get_status, job.upstream_id)
    except SttClientError as error:
        raise _upstream_error(error) from error
    response = _safe_status(job, payload, editor_job_id)
    await store.update(editor_job_id, response.status)
    return response


@router.get("/jobs/{editor_job_id}/result", response_model=SttResultResponse)
async def get_transcription_result(request: Request, editor_job_id: str):
    store = request.app.state.stt_store
    job = await store.get(editor_job_id)
    try:
        payload = await asyncio.to_thread(_client(request).get_result, job.upstream_id)
    except SttClientError as error:
        raise _upstream_error(error) from error
    raw_segments = payload.get("segments")
    if not isinstance(raw_segments, list):
        raise HTTPException(status_code=502, detail="Invalid STT result response")
    segments = []
    for segment in raw_segments:
        if not isinstance(segment, dict) or isinstance(segment.get("start"), bool) or isinstance(segment.get("end"), bool) or not isinstance(segment.get("start"), (int, float)) or not isinstance(segment.get("end"), (int, float)) or not math.isfinite(segment["start"]) or not math.isfinite(segment["end"]) or segment["start"] < 0 or segment["end"] <= segment["start"] or not isinstance(segment.get("text"), str):
            raise HTTPException(status_code=502, detail="Invalid STT result response")
        segments.append({"start": segment["start"], "end": segment["end"], "text": segment["text"]})
    probability = payload.get("language_probability")
    if probability is not None and (isinstance(probability, bool) or not isinstance(probability, (int, float)) or not math.isfinite(probability) or not 0 <= probability <= 1):
        raise HTTPException(status_code=502, detail="Invalid STT result response")
    await store.update(editor_job_id, "completed")
    return SttResultResponse(language=payload.get("language") if isinstance(payload.get("language"), str) else None, language_probability=probability, segments=segments)


@router.post("/jobs/{editor_job_id}/cancel", response_model=SttStatusResponse)
async def cancel_transcription(request: Request, editor_job_id: str, _: None = Depends(require_stt_origin)):
    store = request.app.state.stt_store
    job = await store.get(editor_job_id)
    try:
        payload = await asyncio.to_thread(_client(request).cancel, job.upstream_id)
    except SttClientError as error:
        raise _upstream_error(error) from error
    response = _safe_status(job, payload, editor_job_id)
    await store.update(editor_job_id, response.status)
    return response


