"""Lazy MongoDB client (pymongo native async) and idempotent index creation."""

import logging

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient, IndexModel
from pymongo.asynchronous.database import AsyncDatabase

from app.config import load_settings

log = logging.getLogger("comms")

NOTIFICATION_TTL_SECONDS = 90 * 24 * 3600

# Shared with scripts/migrate_from_postgres.py (sync pymongo accepts the same IndexModel).
INDEXES: dict[str, list[IndexModel]] = {
    "notifications": [
        IndexModel([("dedupeKey", ASCENDING)], name="dedupeKey_unique", unique=True),
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
    return AsyncMongoClient(uri, serverSelectionTimeoutMS=3000, maxPoolSize=10, tz_aware=True)


def get_client() -> AsyncMongoClient:
    global _client
    if _client is None:
        _client = make_client(load_settings().mongodb_uri)
    return _client


async def ensure_indexes(db: AsyncDatabase) -> None:
    for name, models in INDEXES.items():
        await db[name].create_indexes(models)


async def get_db() -> AsyncDatabase:
    """FastAPI dependency: the database, with indexes ensured once per process."""
    global _indexed
    db = get_client()[load_settings().mongodb_db]
    if not _indexed:
        await ensure_indexes(db)
        _indexed = True
        log.info("indexes ensured", extra={"fields": {"collections": len(INDEXES)}})
    return db


async def ping() -> bool:
    try:
        await get_client().admin.command("ping")
        return True
    except Exception:
        return False


async def close_client() -> None:
    global _client, _indexed
    if _client is not None:
        await _client.close()
    _client = None
    _indexed = False
