"""UTC helpers and opaque `createdAt|id` cursors (ADR 0003)."""

import base64
import binascii
from datetime import UTC, datetime

from app.errors import validation_failed


def now_ms() -> datetime:
    """Current UTC time truncated to milliseconds (BSON precision)."""
    n = datetime.now(UTC)
    return n.replace(microsecond=n.microsecond // 1000 * 1000)


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def iso(value: datetime) -> str:
    """ISO 8601 UTC with milliseconds and `Z`, like JavaScript toISOString()."""
    v = as_utc(value)
    return v.strftime("%Y-%m-%dT%H:%M:%S.") + f"{v.microsecond // 1000:03d}Z"


def encode_cursor(created_at: datetime, doc_id: str) -> str:
    return base64.urlsafe_b64encode(f"{iso(created_at)}|{doc_id}".encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        stamp, _, doc_id = raw.partition("|")
        if not doc_id:
            raise ValueError("missing id")
        return as_utc(datetime.fromisoformat(stamp)), doc_id
    except (binascii.Error, ValueError, UnicodeDecodeError):
        raise validation_failed("Invalid cursor") from None


def before_cursor(cursor: str | None) -> dict:
    """Mongo filter fragment for 'strictly after the cursor' in (createdAt desc, _id desc)."""
    if not cursor:
        return {}
    created_at, doc_id = decode_cursor(cursor)
    return {
        "$or": [
            {"createdAt": {"$lt": created_at}},
            {"createdAt": created_at, "_id": {"$lt": doc_id}},
        ]
    }
