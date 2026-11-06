"""riaya-comms: notifications and staff chat on MongoDB (ADR 0003)."""

import asyncio
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, Request

from app.config import load_settings
from app.db import close_client, get_db, ping
from app.errors import install_handlers, internal_response
from app.log import configure_logging
from app.realtime import Realtime
from app.routes import admin, chat, notifications

log = logging.getLogger("comms")
REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def docs_enabled() -> bool:
    """Swagger UI and the OpenAPI document: off in production unless DOCS_ENABLED=true."""
    explicit = os.environ.get("DOCS_ENABLED")
    if explicit:
        return explicit.lower() == "true"
    return os.environ.get("COMMS_ENV") == "development"


def create_api(hub: Realtime) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        configure_logging()
        load_settings()  # fail fast on a missing or short SERVICE_JWT_SECRET
        try:
            await get_db()
        except Exception as exc:  # store may come up later; first request retries
            log.warning(
                "store unavailable at startup", extra={"fields": {"error": type(exc).__name__}}
            )
        await hub.start()
        yield
        await hub.stop()
        await close_client()

    docs = docs_enabled()
    api = FastAPI(
        title="riaya-comms",
        version="0.2.0",
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        openapi_url="/openapi.json" if docs else None,
        redoc_url=None,
    )
    api.state.realtime = hub
    install_handlers(api)
    api.include_router(notifications.router)
    api.include_router(chat.router)
    api.include_router(admin.router)
    api.middleware("http")(request_context)
    api.get("/health", tags=["health"])(health)
    return api


class CommsASGI(socketio.ASGIApp):
    """Socket.IO at /socket.io; everything else, and the lifespan, goes to FastAPI."""

    async def lifespan(self, scope, receive, send):
        await self.other_asgi_app(scope, receive, send)


def create_app(hub: Realtime | None = None) -> CommsASGI:
    hub = hub or Realtime.from_env()
    return CommsASGI(hub.sio, other_asgi_app=create_api(hub), socketio_path="socket.io")


async def request_context(request: Request, call_next):
    configure_logging()
    incoming = request.headers.get("x-request-id", "")
    request_id = incoming if REQUEST_ID.match(incoming) else uuid.uuid4().hex
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        log.error(
            "unhandled error",
            extra={"fields": {"requestId": request_id, "error": type(exc).__name__}},
        )
        response = internal_response()
    response.headers["X-Request-Id"] = request_id
    route = request.scope.get("route")
    log.info(
        "request",
        extra={
            "fields": {
                "requestId": request_id,
                "method": request.method,
                "route": getattr(route, "path", "unmatched"),
                "status": response.status_code,
                "durationMs": round((time.perf_counter() - started) * 1000, 1),
                "clinicId": getattr(request.state, "clinic_id", None),
            }
        },
    )
    return response


async def health(request: Request):
    try:
        up = await asyncio.wait_for(ping(), timeout=4)
    except TimeoutError:
        up = False
    return {
        "status": "ok" if up else "degraded",
        "store": "up" if up else "down",
        "realtime": request.app.state.realtime.status(),
    }


app = create_app()
