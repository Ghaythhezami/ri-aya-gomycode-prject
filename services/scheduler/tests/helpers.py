from __future__ import annotations

import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import jwt
import numpy as np

from app.insights import Chunk

SECRET = "test-secret-with-at-least-32-characters!!"


def make_token(
    secret: str = SECRET,
    *,
    aud: str = "riaya-scheduler",
    iss: str = "riaya-api",
    clinic_id: str | None = "clinic-1",
    sub: str | None = "user-1",
    exp_in: int = 60,
    extra: dict[str, Any] | None = None,
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {"iss": iss, "aud": aud, "iat": now, "exp": now + exp_in}
    if clinic_id is not None:
        claims["clinic_id"] = clinic_id
    if sub is not None:
        claims["sub"] = sub
    claims.update(extra or {})
    return jwt.encode(claims, secret, algorithm="HS256")


def local_ts(value: str, tz: str = "Europe/Paris") -> int:
    """Epoch seconds of a local wall-clock time `YYYY-MM-DD HH:MM`."""
    dt = datetime.strptime(value, "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo(tz))
    return int(dt.timestamp())


def make_chunk(rows: list[tuple[int, int, int, str, str, str]]) -> Chunk:
    """Rows are (start, end, created, status, type, doctorId), times in epoch seconds."""
    starts, ends, created, status, kind, doctor = zip(*rows, strict=True)
    return Chunk(
        starts=np.array(starts, dtype=np.int64),
        ends=np.array(ends, dtype=np.int64),
        created=np.array(created, dtype=np.int64),
        status=np.array(status),
        type=np.array(kind),
        doctor_id=np.array(doctor),
    )
