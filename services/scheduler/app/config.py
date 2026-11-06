"""Environment configuration. Read at call time so tests can change the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass

MIN_SECRET_LENGTH = 32


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    service_jwt_secret: str
    database_url: str | None
    port: int
    env: str


def load_settings() -> Settings:
    env = os.environ.get("SCHEDULER_ENV", "production")
    secret = os.environ.get("SERVICE_JWT_SECRET", "")
    if env != "test" and len(secret) < MIN_SECRET_LENGTH:
        raise ConfigError(f"SERVICE_JWT_SECRET is required and must be {MIN_SECRET_LENGTH}+ chars")
    database_url = os.environ.get("DATABASE_URL") or None
    port = int(os.environ.get("PORT", "4100"))
    return Settings(service_jwt_secret=secret, database_url=database_url, port=port, env=env)
