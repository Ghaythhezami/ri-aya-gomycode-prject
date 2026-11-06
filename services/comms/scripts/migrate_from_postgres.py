"""Copy notifications and chat from PostgreSQL (Prisma tables) into MongoDB.

Env: PG_URL (required), MONGODB_URI, MONGODB_DB. Idempotent: documents are upserted by id,
so the script can be re-run. Prints counts only. Run from services/comms:

    uv run python scripts/migrate_from_postgres.py

Note: the notifications TTL index (90 days) will expire migrated rows older than that.
"""

import os
import sys
from datetime import UTC
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from pymongo import MongoClient, ReplaceOne
from pymongo.errors import BulkWriteError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.db import INDEXES  # noqa: E402

CHUNK = 5000

QUERIES = {
    "notifications": """
        SELECT id, "clinicId", "userId", category, "titleKey", "bodyKey", params,
               "entityType", "entityId", "dedupeKey", "readBy", "createdAt"
        FROM notifications ORDER BY "createdAt", id
    """,
    "conversations": """
        SELECT id, "clinicId", title, "isGroup", "memberIds", "createdAt", "updatedAt"
        FROM chat_conversations ORDER BY "createdAt", id
    """,
    "messages": """
        SELECT m.id, c."clinicId", m."conversationId", m."senderId", m.body, m."readBy",
               m."createdAt"
        FROM chat_messages m JOIN chat_conversations c ON c.id = m."conversationId"
        ORDER BY m."createdAt", m.id
    """,
}


def utc(value):
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def convert(name: str, row: dict) -> dict:
    doc = {"_id": row["id"], "clinicId": row["clinicId"], "createdAt": utc(row["createdAt"])}
    if name == "notifications":
        doc.update(
            userId=row["userId"],
            category=row["category"],
            titleKey=row["titleKey"],
            bodyKey=row["bodyKey"],
            params=row["params"] or {},
            entityType=row["entityType"],
            entityId=row["entityId"],
            dedupeKey=row["dedupeKey"],
            readBy=list(row["readBy"] or []),
        )
    elif name == "conversations":
        doc.update(
            title=row["title"],
            isGroup=row["isGroup"],
            memberIds=sorted(set(row["memberIds"])),
            updatedAt=utc(row["updatedAt"]),
        )
    else:
        doc.update(
            conversationId=row["conversationId"],
            senderId=row["senderId"],
            body=row["body"],
            readBy=list(row["readBy"] or []),
        )
    return doc


def flush(col, batch: list[dict]) -> tuple[int, int]:
    ops = [ReplaceOne({"_id": d["_id"], "clinicId": d["clinicId"]}, d, upsert=True) for d in batch]
    try:
        col.bulk_write(ops, ordered=False)
    except BulkWriteError as exc:
        skipped = len(exc.details.get("writeErrors", []))
        return len(batch) - skipped, skipped
    return len(batch), 0


def main() -> None:
    pg_url = os.environ.get("PG_URL")
    if not pg_url:
        sys.exit("PG_URL is required")
    mongo = MongoClient(os.environ.get("MONGODB_URI") or "mongodb://localhost:27017", tz_aware=True)
    db = mongo[os.environ.get("MONGODB_DB") or "riaya_comms"]
    for name, models in INDEXES.items():
        db[name].create_indexes(models)

    totals: dict[str, tuple[int, int, int]] = {}
    with psycopg.connect(pg_url, row_factory=dict_row) as conn:
        for name, sql in QUERIES.items():
            read = written = skipped = 0
            # A named cursor is server-side: rows stream in chunks, memory stays flat.
            with conn.cursor(name=f"migrate_{name}") as cur:
                cur.itersize = CHUNK
                cur.execute(sql)
                while rows := cur.fetchmany(CHUNK):
                    read += len(rows)
                    ok, skip = flush(db[name], [convert(name, r) for r in rows])
                    written, skipped = written + ok, skipped + skip
            totals[name] = (read, written, skipped)
            print(f"{name}: read={read} written={written} skipped={skipped}")
    for name in QUERIES:
        print(f"mongo {name}: {db[name].estimated_document_count()}")
    mongo.close()


if __name__ == "__main__":
    main()
