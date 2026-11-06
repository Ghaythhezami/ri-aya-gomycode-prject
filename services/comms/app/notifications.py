"""Notification repository (MongoDB). Every query is scoped by `clinicId` from the token."""

import asyncio
import uuid
from datetime import datetime, timedelta

from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import BulkWriteError, DuplicateKeyError

from app.errors import AppError, not_found, validation_failed
from app.schemas import NotificationIn
from app.timeutil import as_utc, before_cursor, encode_cursor, iso, now_ms

SORT = [("createdAt", -1), ("_id", -1)]
DUPLICATE_KEY = 11000
MAX_STATS_DAYS = 366
UNREAD_CAP = 100
TENANT_INDEX = "clinic_user_created"  # never let the planner pick the clinic-agnostic TTL index


def visible(clinic_id: str, user_id: str) -> dict:
    """Visible to the user when targeted at them or at everyone (userId null)."""
    return {"clinicId": clinic_id, "userId": {"$in": [user_id, None]}}


def build_doc(clinic_id: str, item: NotificationIn, created_at: datetime | None = None) -> dict:
    return {
        "_id": str(uuid.uuid4()),
        "clinicId": clinic_id,
        "userId": item.user_id,
        "category": item.category,
        "titleKey": item.title_key,
        "bodyKey": item.body_key,
        "params": item.params,
        "entityType": item.entity_type,
        "entityId": item.entity_id,
        "dedupeKey": item.dedupe_key,
        "readBy": [],
        "createdAt": created_at or now_ms(),
    }


def to_dto(doc: dict, user_id: str, read_all_at: datetime | None = None) -> dict:
    return {
        "id": doc["_id"],
        "category": doc["category"],
        "titleKey": doc["titleKey"],
        "bodyKey": doc["bodyKey"],
        "params": doc.get("params") or {},
        "entityType": doc.get("entityType"),
        "entityId": doc.get("entityId"),
        "read": user_id in doc.get("readBy", [])
        or (read_all_at is not None and as_utc(doc["createdAt"]) <= read_all_at),
        "createdAt": iso(doc["createdAt"]),
    }


class NotificationsRepo:
    def __init__(self, db: AsyncDatabase):
        self.col = db["notifications"]
        self.reads = db["notification_reads"]

    async def watermark(self, clinic_id: str, user_id: str) -> datetime | None:
        """`readAllAt` of the user: everything created at or before it counts as read."""
        doc = await self.reads.find_one({"_id": f"{clinic_id}:{user_id}", "clinicId": clinic_id})
        return as_utc(doc["readAllAt"]) if doc else None

    def unread_filter(self, clinic_id: str, user_id: str, mark: datetime | None) -> dict:
        flt = {**visible(clinic_id, user_id), "readBy": {"$ne": user_id}}
        if mark is not None:
            flt["createdAt"] = {"$gt": mark}
        return flt

    async def create(self, clinic_id: str, item: NotificationIn) -> tuple[str, bool]:
        doc = build_doc(clinic_id, item)
        try:
            await self.col.insert_one(doc)
        except DuplicateKeyError:
            existing = await self.col.find_one(
                {"clinicId": clinic_id, "dedupeKey": item.dedupe_key}, projection={"_id": 1}
            )
            if existing is None:  # key belongs to another clinic: do not reveal it
                raise validation_failed("dedupeKey is not available") from None
            return existing["_id"], False
        return doc["_id"], True

    async def bulk(self, clinic_id: str, items: list[NotificationIn]) -> tuple[int, int]:
        docs = [build_doc(clinic_id, i) for i in items]
        duplicates = 0
        try:
            await self.col.insert_many(docs, ordered=False)
        except BulkWriteError as exc:
            errors = exc.details.get("writeErrors", [])
            if any(e.get("code") != DUPLICATE_KEY for e in errors):
                raise
            duplicates = len(errors)
        return len(docs) - duplicates, duplicates

    async def unread_count(
        self, clinic_id: str, user_id: str, mark: datetime | None = None, *, use_mark: bool = False
    ) -> tuple[int, bool]:
        """Capped count (at most UNREAD_CAP) and whether the cap was reached."""
        if not use_mark:
            mark = await self.watermark(clinic_id, user_id)
        count = await self.col.count_documents(
            self.unread_filter(clinic_id, user_id, mark), limit=UNREAD_CAP, hint=TENANT_INDEX
        )
        return count, count >= UNREAD_CAP

    async def list_page(
        self,
        clinic_id: str,
        user_id: str,
        *,
        category: str | None,
        unread: bool,
        cursor: str | None,
        limit: int,
    ) -> dict:
        mark = await self.watermark(clinic_id, user_id)
        flt = (
            self.unread_filter(clinic_id, user_id, mark) if unread else visible(clinic_id, user_id)
        )
        if category:
            flt["category"] = category
        flt.update(before_cursor(cursor))

        async def fetch() -> list[dict]:
            return await self.col.find(flt, sort=SORT, limit=limit + 1, hint=TENANT_INDEX).to_list(
                limit + 1
            )

        rows, (unread_count, _) = await asyncio.gather(
            fetch(), self.unread_count(clinic_id, user_id, mark, use_mark=True)
        )
        page = rows[:limit]
        next_cursor = (
            encode_cursor(page[-1]["createdAt"], page[-1]["_id"])
            if len(rows) > limit and page
            else None
        )
        return {
            "items": [to_dto(r, user_id, mark) for r in page],
            "nextCursor": next_cursor,
            "unreadCount": unread_count,
        }

    async def mark_read(self, clinic_id: str, user_id: str, notification_id: str) -> None:
        found = await self.col.find_one(
            {"_id": notification_id, **visible(clinic_id, user_id)},
            projection={"_id": 1, "createdAt": 1},
        )
        if found is None:
            raise not_found("Notification not found")
        mark = await self.watermark(clinic_id, user_id)
        if mark is not None and as_utc(found["createdAt"]) <= mark:
            return  # already covered by read-all
        await self.col.update_one(
            {"_id": notification_id, "clinicId": clinic_id}, {"$addToSet": {"readBy": user_id}}
        )

    async def mark_all_read(self, clinic_id: str, user_id: str) -> int:
        """O(1): move the user's watermark to now. Returns the (capped) unread count before."""
        before, _ = await self.unread_count(clinic_id, user_id)
        await self.reads.update_one(
            {"_id": f"{clinic_id}:{user_id}"},
            {
                "$max": {"readAllAt": now_ms()},
                "$setOnInsert": {"clinicId": clinic_id, "userId": user_id},
            },
            upsert=True,
        )
        return before

    @staticmethod
    def stats_pipeline(
        clinic_id: str,
        user_id: str,
        start: datetime,
        end: datetime,
        end_inclusive: bool,
        mark: datetime | None = None,
    ) -> list[dict]:
        upper = {"$lte": end} if end_inclusive else {"$lt": end}
        read_conditions: list[dict] = [{"$in": [user_id, "$readBy"]}]
        if mark is not None:
            read_conditions.append({"$lte": ["$createdAt", mark]})
        return [
            {"$match": {**visible(clinic_id, user_id), "createdAt": {"$gte": start, **upper}}},
            {
                "$facet": {
                    "byCategory": [
                        {
                            "$group": {
                                "_id": "$category",
                                "count": {"$sum": 1},
                                "unread": {"$sum": {"$cond": [{"$or": read_conditions}, 0, 1]}},
                            }
                        },
                        {"$sort": {"_id": 1}},
                    ],
                    "byDay": [
                        {
                            "$group": {
                                "_id": {
                                    "$dateToString": {
                                        "format": "%Y-%m-%d",
                                        "date": "$createdAt",
                                        "timezone": "UTC",
                                    }
                                },
                                "count": {"$sum": 1},
                            }
                        },
                        {"$sort": {"_id": 1}},
                    ],
                }
            },
        ]

    async def stats(
        self, clinic_id: str, user_id: str, start: datetime, end: datetime, end_inclusive: bool
    ) -> dict:
        if end < start:
            raise validation_failed("`from` must not be after `to`")
        if end - start > timedelta(days=MAX_STATS_DAYS):
            raise validation_failed(f"Range is limited to {MAX_STATS_DAYS} days")
        mark = await self.watermark(clinic_id, user_id)
        pipeline = self.stats_pipeline(clinic_id, user_id, start, end, end_inclusive, mark)
        cursor = await self.col.aggregate(pipeline, hint=TENANT_INDEX)
        facets = (await cursor.to_list(1))[0]
        by_category = [
            {"category": g["_id"], "count": g["count"], "unread": g["unread"]}
            for g in facets["byCategory"]
        ]
        return {
            "from": iso(start),
            "to": iso(end),
            "total": sum(c["count"] for c in by_category),
            "byCategory": by_category,
            "byDay": [{"date": g["_id"], "count": g["count"]} for g in facets["byDay"]],
        }


__all__ = ["AppError", "NotificationsRepo", "build_doc", "to_dto", "visible"]
