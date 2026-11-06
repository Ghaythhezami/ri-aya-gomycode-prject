"""Lazy MongoDB client (pymongo native async) and idempotent index creation."""

import logging

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient, IndexModel
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import OperationFailure

from app.config import load_settings

log = logging.getLogger("comms")

NOTIFICATION_TTL_SECONDS = 90 * 24 * 3600

# Shared with scripts/migrate_from_postgres.py (sync pymongo accepts the same IndexModel).
INDEXES: dict[str, list[IndexModel]] = {
    "notifications": [
        IndexModel(
            [("clinicId", ASCENDING), ("dedupeKey", ASCENDING)],
            name="clinic_dedupe_unique",
            unique=True,
        ),
        IndexModel(
            [
                ("clinicId", ASCENDING),
                ("userId", ASCENDING),
                ("createdAt", DESCENDING),
                ("_id", DESCENDING),
            ],
            name="clinic_user_created",
        ),
        IndexModel(
            [("createdAt", ASCENDING)],
            name="createdAt_ttl_90d",
            expireAfterSeconds=NOTIFICATION_TTL_SECONDS,
        ),
    ],
    "conversations": [
        IndexModel(
            [("clinicId", ASCENDING), ("memberIds", ASCENDING), ("updatedAt", DESCENDING)],
            name="clinic_members_updated",
        ),
    ],
    "messages": [
        IndexModel(
            [("conversationId", ASCENDING), ("createdAt", DESCENDING), ("_id", DESCENDING)],
            name="conversation_created",
        ),
        IndexModel([("clinicId", ASCENDING), ("createdAt", DESCENDING)], name="clinic_created"),
    ],
}

_client: AsyncMongoClient | None = None
_indexed = False


def make_client(uri: str) -> AsyncMongoClient:
    # Atlas over SRV + TLS takes ~3 s to the first answer from a cold container (DNS SRV/TXT
    # lookup, TLS, SCRAM), so a 3 s selection timeout reported a healthy cluster as down.
    return AsyncMongoClient(
        uri,
        serverSelectionTimeoutMS=10_000,
        connectTimeoutMS=10_000,
        maxPoolSize=10,
        tz_aware=True,
    )


def get_client() -> AsyncMongoClient:
    global _client
    if _client is None:
        _client = make_client(load_settings().mongodb_uri)
    return _client


LEGACY_INDEXES = {"notifications": ["dedupeKey_unique"]}  # global unique: a cross-tenant oracle
INDEX_NOT_FOUND = 27


async def ensure_indexes(db: AsyncDatabase) -> None:
    for name, models in INDEXES.items():
        await db[name].create_indexes(models)
    for name, legacy in LEGACY_INDEXES.items():
        for index in legacy:
            try:
                await db[name].drop_index(index)
            except OperationFailure as exc:
                if exc.code != INDEX_NOT_FOUND:
                    raise


async def get_db() -> AsyncDatabase:
    """FastAPI dependency: the database, with indexes ensured once per process."""
    global _indexed
    db = get_client()[load_settings().mongodb_db]
    if not _indexed:
        await ensure_indexes(db)
        _indexed = True
        log.info("indexes ensured", extra={"fields": {"collections": len(INDEXES)}})
    return db


_last_ping_error: str | None = None


async def ping() -> bool:
    global _last_ping_error
    try:
        await get_client().admin.command("ping")
        _last_ping_error = None
        return True
    except Exception as exc:  # noqa: BLE001 - health must never raise
        # Error class and server code only (8000 = Atlas bad auth); never the URI.
        reason = type(exc).__name__
        code = getattr(exc, "code", None)
        if code is not None:
            reason = f"{reason}:{code}"
        if reason != _last_ping_error:
            log.warning("mongo ping failed", extra={"fields": {"reason": reason}})
            _last_ping_error = reason
        return False


async def close_client() -> None:
    global _client, _indexed
    if _client is not None:
        await _client.close()
    _client = None
    _indexed = False
