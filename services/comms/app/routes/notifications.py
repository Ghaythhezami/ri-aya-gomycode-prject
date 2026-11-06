from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Response
from pymongo.asynchronous.database import AsyncDatabase

from app.auth import Principal, authenticate
from app.db import get_db
from app.errors import validation_failed
from app.notifications import NotificationsRepo
from app.schemas import (
    BulkNotificationsIn,
    BulkOut,
    CountOut,
    CreatedOut,
    NotificationCategory,
    NotificationIn,
    NotificationPageOut,
    StatsOut,
    SuccessOut,
    UpdatedOut,
)
from app.timeutil import as_utc, now_ms

router = APIRouter(prefix="/v1/notifications", tags=["notifications"])


def repo(db: AsyncDatabase = Depends(get_db)) -> NotificationsRepo:
    return NotificationsRepo(db)


def parse_bound(value: str, name: str) -> tuple[datetime, bool]:
    """Returns (instant, was_date_only). A date-only value means the whole UTC day."""
    try:
        if len(value) == 10:
            d = date.fromisoformat(value)
            return datetime(d.year, d.month, d.day, tzinfo=UTC), True
        return as_utc(datetime.fromisoformat(value)), False
    except ValueError:
        raise validation_failed(f"`{name}` must be an ISO 8601 date or datetime") from None


@router.post("", response_model=CreatedOut, status_code=201)
async def create(
    body: NotificationIn,
    response: Response,
    p: Principal = Depends(authenticate),
    notifications: NotificationsRepo = Depends(repo),
):
    notification_id, created = await notifications.create(p.clinic_id, body)
    if not created:
        response.status_code = 200
    return {"id": notification_id, "created": created}


@router.post("/bulk", response_model=BulkOut)
async def bulk(
    body: BulkNotificationsIn,
    p: Principal = Depends(authenticate),
    notifications: NotificationsRepo = Depends(repo),
):
    created, duplicates = await notifications.bulk(p.clinic_id, body.items)
    return {"created": created, "duplicates": duplicates}


@router.get("", response_model=NotificationPageOut)
async def list_notifications(
    category: NotificationCategory | None = None,
    unread: bool = False,
    cursor: str | None = Query(default=None, max_length=300),
    limit: int = Query(default=20, ge=1, le=100),
    p: Principal = Depends(authenticate),
    notifications: NotificationsRepo = Depends(repo),
):
    return await notifications.list_page(
        p.clinic_id, p.user_id, category=category, unread=unread, cursor=cursor, limit=limit
    )


@router.get("/unread-count", response_model=CountOut)
async def unread_count(
    p: Principal = Depends(authenticate), notifications: NotificationsRepo = Depends(repo)
):
    count, capped = await notifications.unread_count(p.clinic_id, p.user_id)
    return {"count": count, "capped": capped}


@router.post("/read-all", response_model=UpdatedOut)
async def read_all(
    p: Principal = Depends(authenticate), notifications: NotificationsRepo = Depends(repo)
):
    return {"updated": await notifications.mark_all_read(p.clinic_id, p.user_id)}


@router.get("/stats", response_model=StatsOut, response_model_by_alias=True)
async def stats(
    from_: str | None = Query(default=None, alias="from", max_length=40),
    to: str | None = Query(default=None, max_length=40),
    p: Principal = Depends(authenticate),
    notifications: NotificationsRepo = Depends(repo),
):
    inclusive = True
    if to is None:
        end = now_ms()
    else:
        end, date_only = parse_bound(to, "to")
        if date_only:
            end, inclusive = end + timedelta(days=1), False
    start = parse_bound(from_, "from")[0] if from_ else end - timedelta(days=30)
    return await notifications.stats(p.clinic_id, p.user_id, start, end, inclusive)


@router.post("/{notification_id}/read", response_model=SuccessOut)
async def read_one(
    notification_id: str,
    p: Principal = Depends(authenticate),
    notifications: NotificationsRepo = Depends(repo),
):
    await notifications.mark_read(p.clinic_id, p.user_id, notification_id)
    return {"success": True}
