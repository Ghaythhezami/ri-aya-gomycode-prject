"""Chat repository (MongoDB).

Unread counts are computed on read with one aggregation over the member's conversations
(`$match` on `conversationId $in` uses the `{conversationId, createdAt, _id}` index, then `$group`).
No counters are stored, so imports, resets and concurrent writers cannot drift; the cost is
proportional to the messages of the listed conversations (list is capped at 200).
"""

import asyncio
import uuid
from uuid import NAMESPACE_URL

from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.errors import not_found, validation_failed
from app.timeutil import before_cursor, encode_cursor, iso, now_ms

SORT = [("createdAt", -1), ("_id", -1)]
MAX_CONVERSATIONS = 200


def message_dto(doc: dict) -> dict:
    read_by = doc.get("readBy", [])
    return {
        "id": doc["_id"],
        "conversationId": doc["conversationId"],
        "senderId": doc["senderId"],
        "body": doc["body"],
        "readBy": read_by,
        "readByOthers": any(r != doc["senderId"] for r in read_by),
        "createdAt": iso(doc["createdAt"]),
    }


def conversation_dto(doc: dict, last: dict | None, unread: int) -> dict:
    return {
        "id": doc["_id"],
        "title": doc.get("title"),
        "isGroup": doc["isGroup"],
        "memberIds": doc["memberIds"],
        "lastMessage": (
            {
                "body": last["body"],
                "createdAt": iso(last["createdAt"]),
                "senderId": last["senderId"],
            }
            if last
            else None
        ),
        "unreadCount": unread,
        "createdAt": iso(doc["createdAt"]),
        "updatedAt": iso(doc["updatedAt"]),
    }


def pair_id(clinic_id: str, members: list[str]) -> str:
    """Deterministic id for a titleless 1:1, so concurrent creates collapse into one document."""
    return str(uuid.uuid5(NAMESPACE_URL, f"riaya-comms:{clinic_id}:{'|'.join(members)}"))


class ChatRepo:
    def __init__(self, db: AsyncDatabase):
        self.conversations = db["conversations"]
        self.messages = db["messages"]

    async def _decorate(self, docs: list[dict], clinic_id: str, user_id: str) -> list[dict]:
        if not docs:
            return []
        ids = [d["_id"] for d in docs]

        async def last_of(conversation_id: str) -> dict | None:
            return await self.messages.find_one(
                {"conversationId": conversation_id, "clinicId": clinic_id}, sort=SORT
            )

        async def unread() -> dict[str, int]:
            cursor = await self.messages.aggregate(
                [
                    {
                        "$match": {
                            "conversationId": {"$in": ids},
                            "clinicId": clinic_id,
                            "senderId": {"$ne": user_id},
                            "readBy": {"$ne": user_id},
                        }
                    },
                    {"$group": {"_id": "$conversationId", "n": {"$sum": 1}}},
                ]
            )
            return {g["_id"]: g["n"] async for g in cursor}

        lasts, counts = await asyncio.gather(asyncio.gather(*(last_of(i) for i in ids)), unread())
        return [
            conversation_dto(d, last, counts.get(d["_id"], 0))
            for d, last in zip(docs, lasts, strict=True)
        ]

    async def list_for(self, clinic_id: str, user_id: str) -> list[dict]:
        docs = await self.conversations.find(
            {"clinicId": clinic_id, "memberIds": user_id},
            sort=[("updatedAt", -1), ("_id", -1)],
            limit=MAX_CONVERSATIONS,
        ).to_list(MAX_CONVERSATIONS)
        return await self._decorate(docs, clinic_id, user_id)

    async def create(
        self, clinic_id: str, user_id: str, member_ids: list[str], title: str | None
    ) -> tuple[dict, bool]:
        members = sorted({user_id, *member_ids})
        if len(members) < 2:
            raise validation_failed("A conversation needs at least two members")
        title = (title or "").strip() or None
        is_group = len(members) > 2
        doc: dict | None = None
        if not is_group and title is None:
            doc = await self.conversations.find_one(
                {
                    "clinicId": clinic_id,
                    "isGroup": False,
                    "memberIds": {"$all": members, "$size": 2},
                }
            )
        created = False
        if doc is None:
            now = now_ms()
            doc = {
                "_id": pair_id(clinic_id, members)
                if not is_group and title is None
                else str(uuid.uuid4()),
                "clinicId": clinic_id,
                "title": title,
                "isGroup": is_group,
                "memberIds": members,
                "createdAt": now,
                "updatedAt": now,
            }
            try:
                await self.conversations.insert_one(doc)
                created = True
            except DuplicateKeyError:
                doc = await self.conversations.find_one({"_id": doc["_id"], "clinicId": clinic_id})
                if doc is None:
                    raise
        return (await self._decorate([doc], clinic_id, user_id))[0], created

    async def member_conversation(self, clinic_id: str, user_id: str, conversation_id: str) -> dict:
        doc = await self.conversations.find_one(
            {"_id": conversation_id, "clinicId": clinic_id, "memberIds": user_id}
        )
        if doc is None:  # unknown, other clinic or not a member: indistinguishable
            raise not_found("Conversation not found")
        return doc

    async def list_messages(
        self, clinic_id: str, user_id: str, conversation_id: str, cursor: str | None, limit: int
    ) -> dict:
        await self.member_conversation(clinic_id, user_id, conversation_id)
        flt = {"conversationId": conversation_id, "clinicId": clinic_id, **before_cursor(cursor)}
        rows = await self.messages.find(flt, sort=SORT, limit=limit + 1).to_list(limit + 1)
        page = rows[:limit]
        next_cursor = (
            encode_cursor(page[-1]["createdAt"], page[-1]["_id"])
            if len(rows) > limit and page
            else None
        )
        return {"items": [message_dto(m) for m in page], "nextCursor": next_cursor}

    async def post_message(
        self, clinic_id: str, user_id: str, conversation_id: str, body: str
    ) -> dict:
        await self.member_conversation(clinic_id, user_id, conversation_id)
        now = now_ms()
        doc = {
            "_id": str(uuid.uuid4()),
            "clinicId": clinic_id,
            "conversationId": conversation_id,
            "senderId": user_id,
            "body": body,
            "readBy": [user_id],
            "createdAt": now,
        }
        await self.messages.insert_one(doc)
        await self.conversations.update_one(
            {"_id": conversation_id, "clinicId": clinic_id}, {"$set": {"updatedAt": now}}
        )
        return message_dto(doc)

    async def mark_read(self, clinic_id: str, user_id: str, conversation_id: str) -> int:
        await self.member_conversation(clinic_id, user_id, conversation_id)
        result = await self.messages.update_many(
            {"conversationId": conversation_id, "clinicId": clinic_id, "readBy": {"$ne": user_id}},
            {"$addToSet": {"readBy": user_id}},
        )
        return result.modified_count
