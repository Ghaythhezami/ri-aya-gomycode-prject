"""Socket.IO layer against a real uvicorn server, MongoDB and (when reachable) Redis."""

import asyncio
import contextlib
import json
import os
import socket
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import jwt
import pytest
import pytest_asyncio
import redis.asyncio as aioredis
import socketio
import uvicorn

from app.main import create_app, docs_enabled
from app.realtime import ConnectThrottle, JtiStore, Realtime, parse_envelope
from tests.conftest import TEST_SECRET, make_token, notification

REDIS_URL = os.environ.get("REDIS_URL") or "redis://localhost:6379"


def _redis_reachable() -> bool:
    import redis

    try:
        return bool(redis.Redis.from_url(REDIS_URL, socket_connect_timeout=1).ping())
    except Exception:
        return False


HAS_REDIS = _redis_reachable()
needs_redis = pytest.mark.skipif(not HAS_REDIS, reason="Redis is not reachable")


def uid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def ticket(
    sub: str,
    clinic: str,
    *,
    jti: str | None = None,
    aud: str = "riaya-realtime",
    ttl: int = 60,
    secret: str = TEST_SECRET,
    drop: str | None = None,
) -> str:
    now = datetime.now(UTC)
    claims = {
        "iss": "riaya-api",
        "aud": aud,
        "sub": sub,
        "clinic_id": clinic,
        "role": "STAFF",
        "jti": jti or uuid.uuid4().hex,
        "iat": now,
        "exp": now + timedelta(seconds=ttl),
    }
    if drop:
        del claims[drop]
    return jwt.encode(claims, secret, algorithm="HS256")


@contextlib.asynccontextmanager
async def serve(hub: Realtime):
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    config = uvicorn.Config(
        create_app(hub), host="127.0.0.1", port=port, log_level="warning", lifespan="on"
    )
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    for _ in range(100):
        if server.started:
            break
        await asyncio.sleep(0.05)
    assert server.started
    try:
        yield f"http://127.0.0.1:{port}", hub
    finally:
        server.should_exit = True
        await task


@pytest_asyncio.fixture(loop_scope="session")
async def live():
    hub = Realtime(redis_url=REDIS_URL if HAS_REDIS else None, connect_limit=1000)
    async with serve(hub) as (url, hub):
        if HAS_REDIS:
            for _ in range(100):
                if hub.redis_state == "up":
                    break
                await asyncio.sleep(0.05)
        yield url, hub


class Listener:
    """A connected Socket.IO client that records every event it receives."""

    def __init__(self, url: str, auth: dict | None):
        self.url, self.auth = url, auth
        self.client = socketio.AsyncClient()
        self.events: list[tuple[str, dict]] = []
        self.error = None

    async def __aenter__(self):
        for name in (
            "notification.created",
            "notification.read",
            "chat.message",
            "chat.read",
            "queue.updated",
            "appointment.created",
        ):
            self.client.on(name, self._record(name))
        self.client.on("connect_error", self._on_error)
        try:
            await self.client.connect(self.url, auth=self.auth, transports=["websocket"], wait=True)
        except socketio.exceptions.ConnectionError as exc:
            raise socketio.exceptions.ConnectionError(json.dumps(self.error)) from exc
        return self

    async def __aexit__(self, *_):
        await self.client.disconnect()

    async def _on_error(self, data):
        self.error = data

    def _record(self, name: str):
        async def handler(data):
            self.events.append((name, data))

        return handler

    def named(self, name: str) -> list[dict]:
        return [d for n, d in self.events if n == name]

    async def wait_for(self, name: str, count: int = 1, timeout: float = 5.0) -> list[dict]:  # noqa: ASYNC109
        async with asyncio.timeout(timeout):
            while len(self.named(name)) < count:  # noqa: ASYNC110
                await asyncio.sleep(0.02)
        return self.named(name)


def connect(url: str, sub: str, clinic: str, **kw) -> Listener:
    return Listener(url, {"ticket": ticket(sub, clinic, **kw)})


async def settle() -> None:
    await asyncio.sleep(0.4)


def api(url: str, sub: str, clinic: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=url, headers={"Authorization": f"Bearer {make_token(clinic, sub)}"}, timeout=10
    )


# ----------------------------------------------------------------------------- ticket and rooms


async def test_valid_ticket_connects_and_joins_user_and_clinic_rooms(live):
    url, hub = live
    sub, clinic = uid("u"), uid("c")
    async with connect(url, sub, clinic) as c:
        sid = c.client.get_sid()
        rooms = set(hub.sio.manager.get_rooms(sid, "/"))
        assert {f"user:{sub}", f"clinic:{clinic}"} <= rooms
        assert hub.status()["sockets"] >= 1


@pytest.mark.parametrize(
    "kwargs",
    [
        {"ttl": -120},
        {"aud": "riaya-comms"},
        {"secret": "another-secret-0123456789-abcdefghijklmnopq"},
        {"drop": "jti"},
        {"drop": "clinic_id"},
    ],
    ids=["expired", "wrong-aud", "wrong-secret", "no-jti", "no-clinic"],
)
async def test_bad_tickets_are_refused(live, kwargs):
    url, _ = live
    with pytest.raises(socketio.exceptions.ConnectionError) as err:
        async with connect(url, uid("u"), uid("c"), **kwargs):
            pass
    assert "UNAUTHORIZED" in str(err.value)


async def test_missing_ticket_is_refused(live):
    url, _ = live
    with pytest.raises(socketio.exceptions.ConnectionError):
        async with Listener(url, None):
            pass


async def test_replayed_jti_is_refused(live):
    url, _ = live
    sub, clinic, jti = uid("u"), uid("c"), uid("jti")
    async with connect(url, sub, clinic, jti=jti):
        with pytest.raises(socketio.exceptions.ConnectionError) as err:
            async with connect(url, sub, clinic, jti=jti):
                pass
        assert "UNAUTHORIZED" in str(err.value)


async def test_jti_store_in_memory_consumes_once():
    store = JtiStore(None)
    assert await store.consume("a") is True
    assert await store.consume("a") is False
    assert await store.consume("b") is True


@needs_redis
async def test_jti_store_uses_redis_set_nx():
    r = aioredis.from_url(REDIS_URL)
    jti = uid("jti")
    try:
        store = JtiStore(r)
        assert await store.consume(jti) is True
        assert await store.consume(jti) is False
        assert 0 < await r.ttl(f"riaya:rt:jti:{jti}") <= 120
    finally:
        await r.delete(f"riaya:rt:jti:{jti}")
        await r.aclose()


# ----------------------------------------------------------------------------- throttle and caps


def test_connect_throttle_window():
    t = ConnectThrottle(limit=2, window=60)
    assert t.allow("1.1.1.1") and t.allow("1.1.1.1")
    assert not t.allow("1.1.1.1")
    assert t.allow("2.2.2.2")


async def test_connection_attempts_are_throttled_per_ip():
    hub = Realtime(connect_limit=2)
    async with serve(hub) as (url, _):
        sub, clinic = uid("u"), uid("c")
        async with connect(url, sub, clinic), connect(url, sub, clinic):
            with pytest.raises(socketio.exceptions.ConnectionError) as err:
                async with connect(url, sub, clinic):
                    pass
            assert "RATE_LIMITED" in str(err.value)


async def test_max_sockets_per_user():
    hub = Realtime(connect_limit=1000, max_sockets_per_user=2)
    async with serve(hub) as (url, _):
        sub, clinic = uid("u"), uid("c")
        async with connect(url, sub, clinic), connect(url, sub, clinic):
            with pytest.raises(socketio.exceptions.ConnectionError) as err:
                async with connect(url, sub, clinic):
                    pass
            assert "TOO_MANY_CONNECTIONS" in str(err.value)
            async with connect(url, uid("other"), clinic):  # another user is unaffected
                pass


# ----------------------------------------------------------------------------- notifications


async def test_targeted_notification_reaches_only_that_user(live):
    url, _ = live
    clinic, a, b = uid("c"), uid("a"), uid("b")
    async with connect(url, a, clinic) as ca, connect(url, b, clinic) as cb:
        async with api(url, "system", clinic) as http:
            r = await http.post("/v1/notifications", json=notification(uid("d"), userId=a))
            assert r.status_code == 201
        [event] = await ca.wait_for("notification.created")
        assert event["unreadCount"] == 1
        dto = event["notification"]
        assert dto["read"] is False and dto["category"] == "REMINDER"
        assert dto["id"] == r.json()["id"]
        await settle()
        assert cb.named("notification.created") == []


async def test_duplicate_notification_is_not_pushed_twice(live):
    url, _ = live
    clinic, a, key = uid("c"), uid("a"), uid("d")
    async with connect(url, a, clinic) as ca, api(url, "system", clinic) as http:
        await http.post("/v1/notifications", json=notification(key, userId=a))
        await http.post("/v1/notifications", json=notification(key, userId=a))
        await ca.wait_for("notification.created")
        await settle()
        assert len(ca.named("notification.created")) == 1


async def test_broadcast_notification_reaches_clinic_members_only(live):
    url, _ = live
    clinic, other = uid("c"), uid("c")
    async with (
        connect(url, uid("a"), clinic) as ca,
        connect(url, uid("b"), clinic) as cb,
        connect(url, uid("x"), other) as cx,
    ):
        async with api(url, "system", clinic) as http:
            r = await http.post("/v1/notifications", json=notification(uid("d")))
            assert r.status_code == 201
        for c in (ca, cb):
            [event] = await c.wait_for("notification.created")
            assert event["unreadCount"] is None  # per-member count: the client refetches
            assert event["notification"]["read"] is False
        await settle()
        assert cx.named("notification.created") == []


async def test_bulk_notifications_are_pushed(live):
    url, _ = live
    clinic, a = uid("c"), uid("a")
    async with connect(url, a, clinic) as ca, api(url, "system", clinic) as http:
        items = [notification(uid("d"), userId=a) for _ in range(3)]
        r = await http.post("/v1/notifications/bulk", json={"items": items})
        assert r.json() == {"created": 3, "duplicates": 0}
        await ca.wait_for("notification.created", count=3)


async def test_read_and_read_all_emit_unread_count_to_the_user(live):
    url, _ = live
    clinic, a = uid("c"), uid("a")
    async with connect(url, a, clinic) as ca, api(url, a, clinic) as http:
        ids = []
        for _ in range(2):
            r = await http.post("/v1/notifications", json=notification(uid("d"), userId=a))
            ids.append(r.json()["id"])
        await ca.wait_for("notification.created", count=2)
        assert (await http.post(f"/v1/notifications/{ids[0]}/read")).status_code == 200
        [first] = await ca.wait_for("notification.read")
        assert first == {"unreadCount": 1}
        assert (await http.post("/v1/notifications/read-all")).status_code == 200
        events = await ca.wait_for("notification.read", count=2)
        assert events[1] == {"unreadCount": 0}


# ----------------------------------------------------------------------------- chat


async def test_chat_message_and_read_reach_members_only(live):
    url, _ = live
    clinic = uid("c")
    a, b, outsider, other_clinic = uid("a"), uid("b"), uid("o"), uid("x")
    async with (
        connect(url, a, clinic) as ca,
        connect(url, b, clinic) as cb,
        connect(url, outsider, clinic) as co,
        connect(url, other_clinic, uid("c")) as cx,
        api(url, a, clinic) as http_a,
        api(url, b, clinic) as http_b,
    ):
        conv = (await http_a.post("/v1/conversations", json={"memberIds": [b]})).json()
        r = await http_a.post(f"/v1/conversations/{conv['id']}/messages", json={"body": "hello"})
        assert r.status_code == 201
        for c in (ca, cb):
            [event] = await c.wait_for("chat.message")
            assert event["conversationId"] == conv["id"]
            assert event["message"]["id"] == r.json()["id"]
            assert event["message"]["body"] == "hello"

        assert (await http_b.post(f"/v1/conversations/{conv['id']}/read")).status_code == 200
        for c in (ca, cb):
            [event] = await c.wait_for("chat.read")
            assert event == {"conversationId": conv["id"], "userId": b}
        await settle()
        for c in (co, cx):
            assert c.events == []


# ----------------------------------------------------------------------------- redis relay


def envelope(clinic: str, **overrides) -> dict:
    data = {
        "event": "queue.updated",
        "contractVersion": 1,
        "clinicId": clinic,
        "occurredAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "payload": {"date": "2026-11-06", "waiting": 3, "inProgress": 1, "completed": 5},
    }
    data.update(overrides)
    return data


def test_parse_envelope_validation():
    assert parse_envelope(json.dumps(envelope("c1"))) is not None
    bad = [
        envelope("c1", contractVersion=2),
        envelope("c1", event="queue.deleted"),
        envelope(
            "c1", payload={"date": "2026-11-06", "waiting": -1, "inProgress": 0, "completed": 0}
        ),
        envelope(
            "c1",
            payload={"date": "2026-11-06", "waiting": 1, "inProgress": 0, "completed": 0, "x": 1},
        ),
        envelope("c1", occurredAt="yesterday"),
        {**envelope("c1"), "extra": True},
    ]
    for item in bad:
        assert parse_envelope(json.dumps(item)) is None
    assert parse_envelope("not-json{") is None


@needs_redis
async def test_redis_relay_reaches_clinic_room_and_drops_invalid(live):
    url, hub = live
    clinic, other = uid("c"), uid("c")
    r = aioredis.from_url(REDIS_URL)
    try:
        async with (
            connect(url, uid("a"), clinic) as ca,
            connect(url, uid("b"), clinic) as cb,
            connect(url, uid("x"), other) as cx,
        ):
            invalid = envelope(clinic, contractVersion=99)
            bad_payload = envelope(clinic)
            bad_payload["payload"]["waiting"] = "many"
            for raw in (json.dumps(invalid), json.dumps(bad_payload), "not-json{"):
                await r.publish("riaya:events", raw)
            await settle()
            assert ca.events == [] and cb.events == []

            valid = envelope(clinic)
            await r.publish("riaya:events", json.dumps(valid))
            for c in (ca, cb):
                [event] = await c.wait_for("queue.updated")
                assert event == valid["payload"]
            await settle()
            assert cx.events == []
            assert len(ca.named("queue.updated")) == 1  # one copy, not one per fan-out path
    finally:
        await r.aclose()


# ----------------------------------------------------------------------------- health and docs


async def test_health_reports_realtime(live):
    url, hub = live
    async with httpx.AsyncClient(base_url=url) as http:
        body = (await http.get("/health")).json()
    assert body["realtime"]["redis"] == ("up" if HAS_REDIS else "none")
    assert isinstance(body["realtime"]["sockets"], int)


async def test_docs_are_disabled_by_default(live):
    url, _ = live
    async with httpx.AsyncClient(base_url=url) as http:
        assert (await http.get("/docs")).status_code == 404
        assert (await http.get("/openapi.json")).status_code == 404


def test_docs_enabled_rules(monkeypatch):
    monkeypatch.delenv("DOCS_ENABLED", raising=False)
    monkeypatch.setenv("COMMS_ENV", "production")
    assert docs_enabled() is False
    monkeypatch.setenv("COMMS_ENV", "development")
    assert docs_enabled() is True
    monkeypatch.setenv("DOCS_ENABLED", "false")
    assert docs_enabled() is False
    monkeypatch.setenv("COMMS_ENV", "production")
    monkeypatch.setenv("DOCS_ENABLED", "true")
    assert docs_enabled() is True


# ----------------------------------------------------------------------------- hardening


async def test_sockets_expire_after_the_maximum_lifetime():
    hub = Realtime(connect_limit=1000, max_socket_seconds=0.5)
    async with serve(hub) as (url, _):
        async with connect(url, uid("u"), uid("c")) as c:
            assert c.client.connected
            async with asyncio.timeout(5):
                while c.client.connected:  # noqa: ASYNC110
                    await asyncio.sleep(0.05)
            assert hub.sessions == {} and hub.timers == {}
            # a fresh ticket reconnects
            async with connect(url, uid("u"), uid("c")):
                pass


@needs_redis
@pytest.mark.parametrize("event", ["membership.suspended", "membership.role_changed"])
async def test_membership_events_disconnect_that_user_in_that_clinic(live, event):
    url, _ = live
    clinic, other_clinic, victim, bystander = uid("c"), uid("c"), uid("v"), uid("b")
    r = aioredis.from_url(REDIS_URL)
    try:
        async with (
            connect(url, victim, clinic) as cv,
            connect(url, victim, clinic) as cv2,
            connect(url, bystander, clinic) as cb,
            connect(url, victim, other_clinic) as cx,
        ):
            msg = {**envelope(clinic), "event": event, "payload": {"userId": victim}}
            await r.publish("riaya:events", json.dumps(msg))
            async with asyncio.timeout(5):
                while cv.client.connected or cv2.client.connected:  # noqa: ASYNC110
                    await asyncio.sleep(0.05)
            assert cb.client.connected and cx.client.connected
            assert cb.events == [] and cx.events == []  # never emitted to browsers
    finally:
        await r.aclose()


async def test_membership_event_parsing_is_strict():
    from app.realtime import parse_membership_event

    ok = {"event": "membership.suspended", "clinicId": "c", "payload": {"userId": "u"}}
    assert parse_membership_event(json.dumps(ok)) == ("membership.suspended", "c", "u")
    for bad in (
        {**ok, "event": "queue.updated"},
        {**ok, "payload": {}},
        {**ok, "payload": {"userId": 5}},
        {**ok, "clinicId": ""},
    ):
        assert parse_membership_event(json.dumps(bad)) is None
    assert parse_membership_event("nope{") is None


def test_forwarded_for_uses_the_rightmost_entry_only_when_trusted():
    environ = {"HTTP_X_FORWARDED_FOR": "6.6.6.6, 7.7.7.7", "REMOTE_ADDR": "10.0.0.1"}
    assert Realtime(trust_proxy=True)._client_ip(environ) == "7.7.7.7"
    assert Realtime(trust_proxy=False)._client_ip(environ) == "10.0.0.1"


async def test_production_without_cors_origins_refuses_sockets_but_serves_rest():
    hub = Realtime(redis_url=REDIS_URL if HAS_REDIS else "redis://localhost:6379", production=True)
    assert hub.disabled_reason and "CORS" in hub.disabled_reason
    async with serve(hub) as (url, _):
        with pytest.raises(socketio.exceptions.ConnectionError) as err:
            async with connect(url, uid("u"), uid("c")):
                pass
        assert "UNAVAILABLE" in str(err.value)
        async with httpx.AsyncClient(base_url=url) as http:
            assert (await http.get("/health")).status_code == 200


async def test_production_without_redis_refuses_sockets():
    hub = Realtime(cors_origins=["https://app.example.test"], production=True)
    assert hub.disabled_reason and "REDIS_URL" in hub.disabled_reason
    async with serve(hub) as (url, _):
        with pytest.raises(socketio.exceptions.ConnectionError) as err:
            async with connect(url, uid("u"), uid("c")):
                pass
        assert "UNAVAILABLE" in str(err.value)


@needs_redis
async def test_production_with_origins_and_redis_connects():
    hub = Realtime(redis_url=REDIS_URL, cors_origins=["https://app.example.test"], production=True)
    assert hub.disabled_reason is None
    async with serve(hub) as (url, _), connect(url, uid("u"), uid("c")) as c:
        assert c.client.connected


def test_from_env_production_defaults(monkeypatch):
    monkeypatch.setenv("COMMS_ENV", "production")
    monkeypatch.delenv("REALTIME_CORS_ORIGINS", raising=False)
    monkeypatch.setenv("REDIS_URL", REDIS_URL)
    assert Realtime.from_env().disabled_reason is not None
    monkeypatch.setenv("REALTIME_CORS_ORIGINS", "https://a.test, https://b.test")
    assert Realtime.from_env().disabled_reason is None
    monkeypatch.setenv("REALTIME_MAX_SOCKET_SECONDS", "30")
    assert Realtime.from_env().max_socket_seconds == 30
    monkeypatch.setenv("COMMS_ENV", "test")
    monkeypatch.delenv("REALTIME_CORS_ORIGINS")
    monkeypatch.delenv("REDIS_URL")
    assert Realtime.from_env().disabled_reason is None


async def test_oversized_ticket_and_auth_are_refused_and_extra_keys_ignored(live):
    url, _ = live
    sub, clinic = uid("u"), uid("c")
    with pytest.raises(socketio.exceptions.ConnectionError):
        async with Listener(url, {"ticket": "a" * 5000}):
            pass
    with pytest.raises(socketio.exceptions.ConnectionError):
        async with Listener(
            url, {**{f"k{i}": 1 for i in range(20)}, "ticket": ticket(sub, clinic)}
        ):
            pass
    async with Listener(url, {"ticket": ticket(sub, clinic), "role": "SUPER_ADMIN", "x": 1}) as c:
        assert c.client.connected
