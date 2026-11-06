"""Environment configuration, read on every call so tests can change it."""

import os
from dataclasses import dataclass

MIN_SECRET_LENGTH = 32


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Settings:
    env: str
    jwt_secret: str
    mongodb_uri: str
    mongodb_db: str
    port: int


def load_settings() -> Settings:
    env = os.environ.get("COMMS_ENV", "production")
    secret = os.environ.get("SERVICE_JWT_SECRET", "")
    if env != "test" and len(secret) < MIN_SECRET_LENGTH:
        raise ConfigError(f"SERVICE_JWT_SECRET must be at least {MIN_SECRET_LENGTH} characters")
    if not secret:
        raise ConfigError("SERVICE_JWT_SECRET is required")
    return Settings(
        env=env,
        jwt_secret=secret,
        mongodb_uri=os.environ.get("MONGODB_URI") or "mongodb://localhost:27017",
        mongodb_db=os.environ.get("MONGODB_DB") or "riaya_comms",
        port=int(os.environ.get("PORT", "4200")),
    )
