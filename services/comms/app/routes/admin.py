import logging

from fastapi import APIRouter, Depends
from pymongo import ReplaceOne
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import BulkWriteError

from app.auth import Principal, require_admin
from app.db import get_db
from app.schemas import ImportIn, ImportOut, ResetOut
from app.timeutil import as_utc

router = APIRouter(prefix="/v1/admin", tags=["admin"])
log = logging.getLogger("comms")


@router.post("/reset", response_model=ResetOut)
async def reset(p: Principal = Depends(require_admin), db: AsyncDatabase = Depends(get_db)):
    counts = {}
    for name in ("notifications", "conversations", "messages", "notification_reads"):
        counts[name] = (await db[name].delete_many({"clinicId": p.clinic_id})).deleted_count
    log.info("admin reset", extra={"fields": {"clinicId": p.clinic_id, **counts}})
    counts["reads"] = counts.pop("notification_reads")
    return counts


async def _upsert(
    db: AsyncDatabase, name: str, clinic_id: str, docs: list[dict]
) -> tuple[int, int]:
    """Upsert by id inside the clinic. Returns (written, skipped)."""
    if not docs:
        return 0, 0
    ops = [ReplaceOne({"_id": d["_id"], "clinicId": clinic_id}, d, upsert=True) for d in docs]
    try:
        await db[name].bulk_write(ops, ordered=False)
    except BulkWriteError as exc:
        skipped = len(exc.details.get("writeErrors", []))
        return len(docs) - skipped, skipped
    return len(docs), 0


@router.post("/import", response_model=ImportOut)
async def import_documents(
    body: ImportIn, p: Principal = Depends(require_admin), db: AsyncDatabase = Depends(get_db)
):
    cid = p.clinic_id
    notifications = [
        {
            "_id": n.id,
            "clinicId": cid,
            "userId": n.user_id,
            "category": n.category,
            "titleKey": n.title_key,
            "bodyKey": n.body_key,
            "params": n.params,
            "entityType": n.entity_type,
            "entityId": n.entity_id,
            "dedupeKey": n.dedupe_key,
            "readBy": n.read_by,
            "createdAt": as_utc(n.created_at),
        }
        for n in body.notifications
    ]
    conversations = [
        {
            "_id": c.id,
            "clinicId": cid,
            "title": c.title,
            "isGroup": c.is_group,
            "memberIds": sorted(set(c.member_ids)),
            "createdAt": as_utc(c.created_at),
            "updatedAt": as_utc(c.updated_at or c.created_at),
        }
        for c in body.conversations
    ]
    messages = [
        {
            "_id": m.id,
            "clinicId": cid,
            "conversationId": m.conversation_id,
            "senderId": m.sender_id,
            "body": m.body,
            "readBy": m.read_by,
            "createdAt": as_utc(m.created_at),
        }
        for m in body.messages
    ]
    n_ok, n_skip = await _upsert(db, "notifications", cid, notifications)
    c_ok, c_skip = await _upsert(db, "conversations", cid, conversations)
    m_ok, m_skip = await _upsert(db, "messages", cid, messages)
    reads = [
        {
            "_id": f"{cid}:{r.user_id}",
            "clinicId": cid,
            "userId": r.user_id,
            "readAllAt": as_utc(r.read_all_at),
        }
        for r in body.reads
    ]
    r_ok, r_skip = await _upsert(db, "notification_reads", cid, reads)
    log.info(
        "admin import",
        extra={
            "fields": {
                "clinicId": cid,
                "notifications": n_ok,
                "conversations": c_ok,
                "messages": m_ok,
            }
        },
    )
    return {
        "notifications": n_ok,
        "conversations": c_ok,
        "messages": m_ok,
        "reads": r_ok,
        "skipped": n_skip + c_skip + m_skip + r_skip,
    }
