"""Benchmark notifications at 1,000,000 documents in a throwaway database.

    uv run python scripts/bench_notifications.py [total]

Uses MONGODB_URI (default localhost) and the database `riaya_comms_bench`, dropped at the end.
Times the real repository code and prints the index names of each winning plan.
"""

import asyncio
import os
import random
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("COMMS_ENV", "test")
os.environ.setdefault("SERVICE_JWT_SECRET", "bench")

from pymongo import AsyncMongoClient  # noqa: E402

from app.db import ensure_indexes  # noqa: E402
from app.notifications import NotificationsRepo  # noqa: E402

TOTAL = int(sys.argv[1]) if len(sys.argv) > 1 else 1_000_000
BATCH = 1000
CONCURRENCY = 4
DB_NAME = "riaya_comms_bench"
CLINIC = "bench-clinic"
USERS = [f"user-{i}" for i in range(50)]
CATEGORIES = ["REMINDER", "CONFIRMATION", "CANCELLATION", "CONFLICT", "DELAY", "SYSTEM"]
ME = USERS[0]


def make_batch(start: int, now: datetime, rng: random.Random) -> list[dict]:
    docs = []
    for i in range(start, start + BATCH):
        roll = rng.random()
        user = None if roll < 0.2 else rng.choice(USERS)
        docs.append(
            {
                "_id": str(uuid.uuid4()),
                "clinicId": CLINIC,
                "userId": user,
                "category": rng.choice(CATEGORIES),
                "titleKey": "notifications.templates.reminder.title",
                "bodyKey": "notifications.templates.reminder.body",
                "params": {"time": "09:00"},
                "entityType": "appointment",
                "entityId": f"appt-{i % 5000}",
                "dedupeKey": f"bench-{i}",
                "readBy": [ME] if rng.random() < 0.3 else [],
                # spread over 80 days: inside the 90-day TTL window
                "createdAt": now - timedelta(seconds=rng.randint(0, 80 * 86400)),
            }
        )
    return docs


def index_names(plan) -> list[str]:
    found: list[str] = []
    if isinstance(plan, dict):
        if "indexName" in plan:
            found.append(plan["indexName"])
        for v in plan.values():
            found += index_names(v)
    elif isinstance(plan, list):
        for v in plan:
            found += index_names(v)
    return sorted(set(found))


async def winning_indexes(db, command: dict) -> list[str]:
    out = await db.command({"explain": command, "verbosity": "queryPlanner"})
    plan = out.get("queryPlanner", {}).get("winningPlan") or out
    names = index_names(plan)
    if not names and "stages" in out:  # sharded/aggregation shape
        names = index_names(out["stages"])
    return names or ["(none - collection scan)"]


async def timed(label: str, fn):
    started = time.perf_counter()
    result = await fn()
    ms = (time.perf_counter() - started) * 1000
    print(f"{label:<34} {ms:9.1f} ms   -> {result}")
    return ms


async def main() -> None:
    client = AsyncMongoClient(os.environ.get("MONGODB_URI") or "mongodb://localhost:27017")
    await client.drop_database(DB_NAME)
    db = client[DB_NAME]
    try:
        await ensure_indexes(db)
        col = db["notifications"]
        now = datetime.now(UTC).replace(microsecond=0)
        rng = random.Random(42)

        print(f"inserting {TOTAL:,} documents in batches of {BATCH} ...")
        started = time.perf_counter()
        sem = asyncio.Semaphore(CONCURRENCY)

        async def insert(start: int) -> None:
            async with sem:
                await col.insert_many(make_batch(start, now, rng), ordered=False)

        await asyncio.gather(*(insert(s) for s in range(0, TOTAL, BATCH)))
        secs = time.perf_counter() - started
        total = await col.count_documents({})
        print(f"insert: {TOTAL / secs:,.0f} docs/s ({secs:.1f} s), count={total:,}")

        repo = NotificationsRepo(db)
        visible = {"clinicId": CLINIC, "userId": {"$in": [ME, None]}}
        start, end = now - timedelta(days=30), now

        async def unread():
            count, capped = await repo.unread_count(CLINIC, ME)
            return f"count={count}, capped={capped}"

        async def first_page():
            page = await repo.list_page(
                CLINIC, ME, category=None, unread=False, cursor=None, limit=20
            )
            return f"{len(page['items'])} items, unread={page['unreadCount']}"

        async def first_unread_page():
            page = await repo.list_page(
                CLINIC, ME, category=None, unread=True, cursor=None, limit=20
            )
            return f"{len(page['items'])} items"

        async def stats():
            result = await repo.stats(CLINIC, ME, start, end, True)
            return f"total={result['total']:,}, days={len(result['byDay'])}"

        async def read_all():
            return f"updated={await repo.mark_all_read(CLINIC, ME)}"

        print()
        await timed("unread-count BEFORE read-all", unread)
        await timed("first page, limit 20", first_page)
        await timed("first page, unread only", first_unread_page)
        await timed("stats, 30 days", stats)
        await timed("read-all (user-0)", read_all)
        await asyncio.sleep(0.05)
        fresh = make_batch(TOTAL, datetime.now(UTC), random.Random(7))[:30]
        for d in fresh:
            d["userId"], d["readBy"], d["createdAt"] = ME, [], datetime.now(UTC)
        await col.insert_many(fresh)
        await timed("unread-count AFTER read-all", unread)
        await timed("first page, unread only (after)", first_unread_page)
        await timed("read-all again", read_all)
        await timed("unread-count after 2nd read-all", unread)

        mark = await repo.watermark(CLINIC, ME)
        print("\nwinning plan indexes (explain)")
        unread_filter = repo.unread_filter(CLINIC, ME, mark)
        plans = {
            "unread-count": {
                "count": "notifications",
                "query": unread_filter,
                "limit": 100,
                "hint": "clinic_user_created",
            },
            "unread-count (no mark)": {
                "count": "notifications",
                "query": repo.unread_filter(CLINIC, ME, None),
                "limit": 100,
            },
            "first page": {
                "find": "notifications",
                "filter": visible,
                "sort": {"createdAt": -1, "_id": -1},
                "limit": 21,
                "hint": "clinic_user_created",
            },
            "unread-only page": {
                "find": "notifications",
                "filter": unread_filter,
                "sort": {"createdAt": -1, "_id": -1},
                "limit": 21,
                "hint": "clinic_user_created",
            },
            "stats": {
                "aggregate": "notifications",
                "pipeline": NotificationsRepo.stats_pipeline(CLINIC, ME, start, end, True, mark),
                "cursor": {},
                "hint": "clinic_user_created",
            },
        }
        for label, command in plans.items():
            print(f"{label:<24} {', '.join(await winning_indexes(db, command))}")
    finally:
        await client.drop_database(DB_NAME)
        print(f"\ndropped {DB_NAME}")
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
