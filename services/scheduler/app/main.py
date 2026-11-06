"""riaya-scheduler FastAPI app (ADR 0003). Server-to-server only: no CORS."""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

import psycopg
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from . import insights_repo
from .auth import Principal, require_principal
from .config import load_settings
from .errors import ApiError, install_error_handlers
from .optimizer import optimize
from .schemas import InsightsRequest, OptimizerInput

log = logging.getLogger("riaya.scheduler")
if not log.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    log.propagate = False

_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def _log(**fields: Any) -> None:
    log.info(json.dumps({"service": "riaya-scheduler", **fields}, separators=(",", ":")))


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    load_settings()  # fail fast on a missing or short SERVICE_JWT_SECRET
    yield


app = FastAPI(
    title="riaya-scheduler",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
install_error_handlers(app)


@app.middleware("http")
async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
    incoming = request.headers.get("x-request-id", "")
    request_id = incoming if _REQUEST_ID.match(incoming) else uuid.uuid4().hex
    request.state.request_id = request_id
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    _log(
        event="request",
        requestId=request_id,
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        ms=int((time.perf_counter() - started) * 1000),
    )
    return response


PrincipalDep = Annotated[Principal, Depends(require_principal)]


@app.get("/health")
def health() -> dict[str, str]:
    url = load_settings().database_url
    if not url:
        return {"status": "ok", "store": "none"}
    if insights_repo.ping(url):
        return {"status": "ok", "store": "up"}
    return {"status": "degraded", "store": "down"}


@app.post("/v1/optimize")
def optimize_route(body: OptimizerInput, principal: PrincipalDep, request: Request) -> JSONResponse:
    result = optimize(body.model_dump(by_alias=True))
    _log(
        event="optimize",
        requestId=request.state.request_id,
        clinicId=principal.clinic_id,
        doctors=len(body.doctors),
        appointments=len(body.appointments),
        moves=len(result["moves"]),
    )
    return JSONResponse(result)


@app.post("/v1/insights")
def insights_route(
    body: InsightsRequest, principal: PrincipalDep, request: Request
) -> JSONResponse:
    url = load_settings().database_url
    if not url:
        raise ApiError(503, "SERVICE_UNAVAILABLE", "Insights store is not configured")
    try:
        result = insights_repo.run_insights(
            url, principal.clinic_id, body.from_, body.to, body.time_zone
        )
    except psycopg.Error as exc:
        _log(
            event="insights_store_error",
            requestId=request.state.request_id,
            error=type(exc).__name__,
        )
        raise ApiError(503, "SERVICE_UNAVAILABLE", "Insights store is unavailable") from None
    _log(
        event="insights",
        requestId=request.state.request_id,
        clinicId=principal.clinic_id,
        rows=result["meta"]["rowsScanned"],
        chunks=result["meta"]["chunks"],
        ms=result["meta"]["durationMs"],
    )
    return JSONResponse(result)
