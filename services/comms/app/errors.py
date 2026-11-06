"""Uniform error body: { code, message, details? } (ADR 0003)."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("comms")


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details: object | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def unauthorized(message: str = "Invalid or missing service token") -> AppError:
    return AppError(401, "UNAUTHORIZED", message)


def forbidden(message: str = "Admin scope required") -> AppError:
    return AppError(403, "FORBIDDEN", message)


def not_found(message: str) -> AppError:
    return AppError(404, "NOT_FOUND", message)


def validation_failed(message: str, details: object | None = None) -> AppError:
    return AppError(422, "VALIDATION_FAILED", message, details)


def body(code: str, message: str, details: object | None = None) -> dict:
    payload: dict = {"code": code, "message": message}
    if details is not None:
        payload["details"] = details
    return payload


def internal_response() -> JSONResponse:
    return JSONResponse(status_code=500, content=body("INTERNAL", "Internal server error"))


_STATUS_CODES = {401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND"}


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status, content=body(exc.code, exc.message, exc.details)
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Never echo the submitted values (message bodies are personal data).
        details = [
            {
                "field": ".".join(str(p) for p in err["loc"][1:]) or str(err["loc"][0]),
                "message": err["msg"],
                "type": err["type"],
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422, content=body("VALIDATION_FAILED", "Request validation failed", details)
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code)
        if code is None:
            code = "VALIDATION_FAILED" if exc.status_code < 500 else "INTERNAL"
        message = "Route not found" if exc.status_code == 404 else str(exc.detail)
        return JSONResponse(status_code=exc.status_code, content=body(code, message))

    @app.exception_handler(PyMongoError)
    async def _mongo(_: Request, exc: PyMongoError) -> JSONResponse:
        from pymongo.errors import AutoReconnect, ConnectionFailure

        if isinstance(exc, ServerSelectionTimeoutError | ConnectionFailure | AutoReconnect):
            return JSONResponse(
                status_code=503, content=body("SERVICE_UNAVAILABLE", "Message store is unavailable")
            )
        log.error("mongo error", extra={"fields": {"error": type(exc).__name__}})
        return internal_response()

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled error", extra={"fields": {"error": type(exc).__name__}})
        return internal_response()
