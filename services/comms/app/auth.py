"""Service-to-service authentication (ADR 0003): HS256 JWT signed by the NestJS API."""

from dataclasses import dataclass

import jwt
from fastapi import Depends, Request

from app.config import load_settings
from app.errors import forbidden, unauthorized

ISSUER = "riaya-api"
AUDIENCE = "riaya-comms"
LEEWAY_SECONDS = 30


@dataclass(frozen=True)
class Principal:
    clinic_id: str
    user_id: str
    role: str | None
    scope: str | None


def authenticate(request: Request) -> Principal:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise unauthorized()
    try:
        claims = jwt.decode(
            token.strip(),
            load_settings().jwt_secret,
            algorithms=["HS256"],
            audience=AUDIENCE,
            issuer=ISSUER,
            leeway=LEEWAY_SECONDS,
            options={"require": ["exp", "iss", "aud", "sub", "clinic_id"]},
        )
    except jwt.PyJWTError:
        raise unauthorized() from None
    clinic_id, sub = claims.get("clinic_id"), claims.get("sub")
    if not isinstance(clinic_id, str) or not clinic_id or not isinstance(sub, str) or not sub:
        raise unauthorized()
    role, scope = claims.get("role"), claims.get("scope")
    request.state.clinic_id = clinic_id
    return Principal(
        clinic_id=clinic_id,
        user_id=sub,
        role=role if isinstance(role, str) else None,
        scope=scope if isinstance(scope, str) else None,
    )


def require_admin(principal: Principal = Depends(authenticate)) -> Principal:
    if principal.scope != "admin":
        raise forbidden()
    return principal
