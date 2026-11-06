import os
import uuid
from datetime import UTC, datetime, timedelta

# Must be set before the app modules are imported.
TEST_SECRET = "test-only-secret-0123456789-abcdefghijklmnop"
TEST_DB = f"riaya_comms_test_{uuid.uuid4().hex[:8]}"
os.environ["COMMS_ENV"] = "test"
os.environ["SERVICE_JWT_SECRET"] = TEST_SECRET
os.environ["MONGODB_DB"] = TEST_DB
MONGO_URI = os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import httpx  # noqa: E402
import jwt  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from pymongo import MongoClient  # noqa: E402
from pymongo.errors import PyMongoError  # noqa: E402

from app import db as db_module  # noqa: E402
from app.main import app  # noqa: E402


def mongo_reachable() -> bool:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=1000)
    try:
        client.admin.command("ping")
        return True
    except PyMongoError:
        return False
    finally:
        client.close()


@pytest.fixture(scope="session", autouse=True)
def _mongo():
    if not mongo_reachable():
        pytest.skip("MongoDB is not reachable", allow_module_level=False)
    yield
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=1000)
    client.drop_database(TEST_DB)
    client.close()


def make_token(
    clinic: str = "clinic-a",
    sub: str = "user-1",
    scope: str | None = None,
    secret: str = TEST_SECRET,
    **overrides,
) -> str:
    now = datetime.now(UTC)
    claims = {
        "iss": "riaya-api",
        "aud": "riaya-comms",
        "sub": sub,
        "clinic_id": clinic,
        "role": "CLINIC_ADMIN",
        "iat": now,
        "exp": now + timedelta(seconds=60),
    }
    if scope:
        claims["scope"] = scope
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, secret, algorithm="HS256")


def auth(clinic: str = "clinic-a", sub: str = "user-1", scope: str | None = None) -> dict:
    return {"Authorization": f"Bearer {make_token(clinic, sub, scope)}"}


@pytest_asyncio.fixture(loop_scope="session")
async def client():
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        db = await db_module.get_db()
        for name in ("notifications", "conversations", "messages", "notification_reads"):
            await db[name].delete_many({})
        yield c


@pytest_asyncio.fixture(loop_scope="session")
async def db(client):
    return await db_module.get_db()


def notification(dedupe: str, **kw) -> dict:
    body = {
        "category": "REMINDER",
        "titleKey": "notifications.templates.reminder.title",
        "bodyKey": "notifications.templates.reminder.body",
        "params": {"time": "09:00", "n": 3},
        "entityType": "appointment",
        "entityId": "appt-1",
        "dedupeKey": dedupe,
    }
    body.update(kw)
    return body


def imported_notification(i: int, created_at: str, **kw) -> dict:
    body = {
        "id": f"n-{i:03d}",
        "category": "SYSTEM",
        "titleKey": "t",
        "bodyKey": "b",
        "dedupeKey": f"imp-{i}",
        "createdAt": created_at,
    }
    body.update(kw)
    return body
