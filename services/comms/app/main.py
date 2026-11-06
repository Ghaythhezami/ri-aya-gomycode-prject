"""riaya-comms: notifications and staff chat on MongoDB (ADR 0003)."""

import asyncio
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from app.config import load_settings
from app.db import close_client, get_db, ping
from app.errors import install_handlers, internal_response
from app.log import configure_logging
from app.routes import admin, chat, notifications

log = logging.getLogger("comms")
REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    load_settings()  # fail fast on a missing or short SERVICE_JWT_SECRET
    try:
        await get_db()
    except Exception as exc:  # store may come up later; first request retries
        log.warning("store unavailable at startup", extra={"fields": {"error": type(exc).__name__}})
    yield
    await close_client()


app = FastAPI(title="riaya-comms", version="0.1.0", lifespan=lifespan)
install_handlers(app)
app.include_router(notifications.router)
app.include_router(chat.router)
app.include_router(admin.router)


@app.middleware("http")
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


@app.get("/health", tags=["health"])
async def health():
    try:
        up = await asyncio.wait_for(ping(), timeout=4)
    except TimeoutError:
        up = False
    return {"status": "ok" if up else "degraded", "store": "up" if up else "down"}
