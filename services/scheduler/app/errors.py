"""Uniform error body `{code, message, details?}` (ADR 0003)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

log = logging.getLogger("riaya.scheduler")

_CODES = {
    400: "VALIDATION_FAILED",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    422: "VALIDATION_FAILED",
    503: "SERVICE_UNAVAILABLE",
}


class ApiError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str, details: Any = None):
        super().__init__(status_code=status_code)
        self.code = code
        self.message = message
        self.details = details


def body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    out: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        out["details"] = details
    return out


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def _http(_: Request, exc: HTTPException) -> JSONResponse:
        if isinstance(exc, ApiError):
            payload = body(exc.code, exc.message, exc.details)
        else:
            code = _CODES.get(
                exc.status_code, "INTERNAL" if exc.status_code >= 500 else "NOT_FOUND"
            )
            payload = body(code, str(exc.detail))
        return JSONResponse(payload, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "field": ".".join(str(p) for p in err.get("loc", ()) if p != "body"),
                "message": err.get("msg", "invalid"),
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            body("VALIDATION_FAILED", "Request validation failed", details), status_code=422
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.error(
            '{"event":"unhandled","path":"%s","error":"%s"}', request.url.path, type(exc).__name__
        )
        return JSONResponse(body("INTERNAL", "Internal error"), status_code=500)
