"""Service JWT verification (ADR 0003): HS256, iss riaya-api, aud riaya-scheduler."""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Request

from .config import load_settings
from .errors import ApiError

ISSUER = "riaya-api"
AUDIENCE = "riaya-scheduler"
LEEWAY_SECONDS = 30


@dataclass(frozen=True)
class Principal:
    clinic_id: str
    sub: str
    role: str | None = None
    scope: str | None = None


def _unauthorized() -> ApiError:
    return ApiError(401, "UNAUTHORIZED", "Invalid or missing service token")


def verify_token(token: str, secret: str) -> Principal:
    if not secret:
        raise _unauthorized()
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience=AUDIENCE,
            issuer=ISSUER,
            leeway=LEEWAY_SECONDS,
            options={"require": ["exp", "iss", "aud", "sub", "clinic_id"]},
        )
    except jwt.PyJWTError:
        raise _unauthorized() from None
    clinic_id = claims.get("clinic_id")
    sub = claims.get("sub")
    if not isinstance(clinic_id, str) or not clinic_id or not isinstance(sub, str) or not sub:
        raise _unauthorized()
    role = claims.get("role")
    scope = claims.get("scope")
    return Principal(
        clinic_id=clinic_id,
        sub=sub,
        role=role if isinstance(role, str) else None,
        scope=scope if isinstance(scope, str) else None,
    )


def require_principal(request: Request) -> Principal:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized()
    return verify_token(token.strip(), load_settings().service_jwt_secret)
