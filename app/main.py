import logging
import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError

from app.api.plan import router as plan_router
from app.api.merge import router as merge_router
from app.api.stt import JobStore, router as stt_router
from app.api.video import router as video_router
from app.core.config import Settings, load_settings
from app.core.db import create_database, initialize_database
from app.web.router import router as web_router

STATIC = Path(__file__).resolve().parent / "web" / "static"
LOGGER = logging.getLogger("video_editor")


class SttUploadTooLarge(Exception):
    pass


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()
    logging.basicConfig(level=settings.log_level.upper())

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        engine, factory = create_database(settings.database_url)
        try:
            initialize_database(engine)
        except SQLAlchemyError:
            LOGGER.exception("Database initialization failed")
            engine.dispose()
            raise

        application.state.session_factory = factory
        application.state.engine = engine
        application.state.stt_store = JobStore(settings)
        yield
        engine.dispose()

    application = FastAPI(
        title=settings.app_name,
        debug=settings.app_debug,
        lifespan=lifespan,
    )

    application.state.settings = settings

    application.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.trusted_hosts,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "X-App-Key"],
    )

    application.mount(
        "/static",
        StaticFiles(directory=STATIC),
        name="static",
    )

    application.include_router(web_router)
    application.include_router(video_router)
    application.include_router(plan_router)
    application.include_router(merge_router)
    application.include_router(stt_router)

    @application.middleware("http")
    async def security_headers(request: Request, call_next):
        response = None
        is_stt_upload = request.url.path == "/api/stt/transcriptions"
        if request.url.path.startswith("/api/"):
            length = request.headers.get("content-length")

            if length and (not length.isdecimal() or (not is_stt_upload and int(length) > 65536) or (is_stt_upload and int(length) > settings.stt_max_upload_bytes + 2 * 1024 * 1024)):
                response = JSONResponse(
                    {"detail": "Request body too large"},
                    status_code=413,
                )

            if response is None and request.method == "POST" and is_stt_upload:
                content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                if content_type != "multipart/form-data" or "boundary=" not in request.headers.get("content-type", "").lower():
                    response = JSONResponse({"detail": "Unsupported content type"}, status_code=415)

            if response is None and request.method == "POST" and request.url.path.startswith("/api/stt/jobs/"):
                content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                if content_type not in {"", "application/json"}:
                    response = JSONResponse({"detail": "Unsupported content type"}, status_code=415)

            if response is None and request.method in ("POST", "PUT", "PATCH") and not is_stt_upload:
                body = await request.body()

                if len(body) > 65536:
                    response = JSONResponse(
                        {"detail": "Request body too large"},
                        status_code=413,
                    )
                if response is None and request.url.path == "/api/merge/plan":
                    try:
                        json.loads(body, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
                    except (ValueError, UnicodeDecodeError):
                        response = JSONResponse({"detail": "Invalid JSON body"}, status_code=422)

        if response is None:
            if is_stt_upload:
                original_receive = request.receive
                received = 0

                async def limited_receive():
                    nonlocal received
                    message = await original_receive()
                    if message.get("type") == "http.request":
                        received += len(message.get("body", b""))
                        if received > settings.stt_max_upload_bytes + 2 * 1024 * 1024:
                            raise SttUploadTooLarge
                    return message

                request._receive = limited_receive
            try:
                response = await call_next(request)
            except SttUploadTooLarge:
                response = JSONResponse({"detail": "Request body too large"}, status_code=413)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "frame-ancestors 'self'; "
            "object-src 'none'; "
            "img-src 'self' data: blob:; "
            "media-src 'self' blob:; "
            "style-src 'self'; "
            "script-src 'self' 'wasm-unsafe-eval'; "
            "connect-src 'self' blob:; "
            "worker-src 'self' blob:"
        )
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"

        return response

    return application

app = create_app()
