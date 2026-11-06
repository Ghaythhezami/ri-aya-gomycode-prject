"""Socket.IO realtime layer (ADR 0004 section 4).

Browsers connect with a one-time ticket minted by the NestJS API (`POST /api/realtime/ticket`):
an HS256 JWT signed with SERVICE_JWT_SECRET (`iss riaya-api`, `aud riaya-realtime`, 60 s, `jti`).
Rooms: `user:<sub>` and `clinic:<clinic_id>`. Events come from this service's own writes and from
the `riaya:events` Redis channel (domain events published by the API). Nothing personal is logged.
"""

import asyncio
import contextlib
import datetime as dt
import json
import logging
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Annotated

import jwt
import socketio
from fastapi import Request
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictInt, ValidationError
from redis import asyncio as aioredis

from app.config import load_settings

log = logging.getLogger("comms")

EVENTS_CHANNEL = "riaya:events"
CONTRACT_VERSION = 1
TICKET_ISSUER = "riaya-api"
TICKET_AUDIENCE = "riaya-realtime"
TICKET_LEEWAY_SECONDS = 5
JTI_TTL_SECONDS = 120
JTI_PREFIX = "riaya:rt:jti:"
DEFAULT_ORIGINS = (
    "http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175"
)
DEFAULT_CONNECT_LIMIT = 20  # connection attempts per IP per window
CONNECT_WINDOW_SECONDS = 60
DEFAULT_MAX_SOCKETS_PER_USER = 5
EMIT_TIMEOUT_SECONDS = 2.0
DEFAULT_MAX_SOCKET_SECONDS = 900  # sockets outlive membership changes at most this long
MAX_TICKET_LENGTH = 4096
MAX_AUTH_KEYS = 8
MAX_HTTP_BUFFER_BYTES = 16 * 1024  # bounds every inbound message, including the connect auth
# Internal events published by the API: consumed here, never relayed to browsers.
MEMBERSHIP_EVENTS = ("membership.suspended", "membership.role_changed")
BULK_EMIT_LIMIT = 50  # bulk imports push at most this many notifications


def user_room(user_id: str) -> str:
    return f"user:{user_id}"


def clinic_room(clinic_id: str) -> str:
    return f"clinic:{clinic_id}"


def refused(code: str) -> socketio.exceptions.ConnectionRefusedError:
    """Refusal the client sees as `connect_error` with `{message: code, data: {code}}`."""
    return socketio.exceptions.ConnectionRefusedError(code, {"code": code})


# ----------------------------------------------------------------------------- envelope contract
# Mirrors packages/shared/src/schemas/realtime.ts (strict objects, contract version 1).

Ident = Annotated[str, Field(min_length=1, max_length=64)]
Minutes = Annotated[StrictInt, Field(gt=0, le=24 * 60)]
Count = Annotated[StrictInt, Field(ge=0)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _AppointmentCreated(_Strict):
    appointmentId: Ident  # noqa: N815
    doctorId: Ident  # noqa: N815
    startsAt: AwareDatetime  # noqa: N815
    durationMinutes: Minutes  # noqa: N815
    status: Annotated[str, Field(pattern=r"^(SCHEDULED|CONFIRMED)$")]


class _AppointmentCancelled(_Strict):
    appointmentId: Ident  # noqa: N815
    cancelledAt: AwareDatetime  # noqa: N815
    reason: Annotated[str, Field(min_length=1, max_length=500)] | None = None


class _AppointmentRescheduled(_Strict):
    appointmentId: Ident  # noqa: N815
    fromStartsAt: AwareDatetime  # noqa: N815
    toStartsAt: AwareDatetime  # noqa: N815
    durationMinutes: Minutes  # noqa: N815


class _QueueUpdated(_Strict):
    date: dt.date
    waiting: Count
    inProgress: Count  # noqa: N815
    completed: Count


PAYLOAD_MODELS: dict[str, type[BaseModel]] = {
    "appointment.created": _AppointmentCreated,
    "appointment.cancelled": _AppointmentCancelled,
    "appointment.rescheduled": _AppointmentRescheduled,
    "queue.updated": _QueueUpdated,
}


class _Envelope(_Strict):
    event: str
    contractVersion: StrictInt  # noqa: N815
    clinicId: Ident  # noqa: N815
    occurredAt: AwareDatetime  # noqa: N815
    payload: dict


def parse_envelope(raw: str | bytes) -> tuple[str, str, dict] | None:
    """Validated `(event, clinic_id, payload)`, or None when the message must be dropped."""
    try:
        envelope = _Envelope.model_validate(json.loads(raw))
        model = PAYLOAD_MODELS.get(envelope.event)
        if model is None or envelope.contractVersion != CONTRACT_VERSION:
            return None
        model.model_validate(envelope.payload)
    except (ValueError, ValidationError, TypeError):
        return None
    return envelope.event, envelope.clinicId, envelope.payload


# ----------------------------------------------------------------------------- helpers


class JtiStore:
    """Consumes each ticket `jti` once: Redis `SET NX EX` when available, else in memory."""

    def __init__(self, redis: aioredis.Redis | None):
        self.redis = redis
        self.seen: dict[str, float] = {}

    async def consume(self, jti: str) -> bool:
        if self.redis is not None:
            return bool(await self.redis.set(JTI_PREFIX + jti, "1", nx=True, ex=JTI_TTL_SECONDS))
        now = time.monotonic()
        for key in [k for k, until in self.seen.items() if until <= now]:
            del self.seen[key]
        if jti in self.seen:
            return False
        self.seen[jti] = now + JTI_TTL_SECONDS
        return True


class ConnectThrottle:
    """Sliding window of connection attempts per IP (per instance)."""

    def __init__(self, limit: int, window: float = CONNECT_WINDOW_SECONDS):
        self.limit = limit
        self.window = window
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        if len(self.hits) > 10_000:  # bound memory under a spray of addresses
            for k in [k for k, q in self.hits.items() if not q or q[-1] <= now - self.window]:
                del self.hits[k]
        hits = self.hits[key]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        return True


@dataclass(frozen=True)
class Session:
    user_id: str
    clinic_id: str


def get_realtime(request: Request) -> "Realtime":
    """FastAPI dependency: the Realtime hub attached to the app."""
    return request.app.state.realtime


def parse_origins(value: str | None) -> list[str]:
    return [o.strip() for o in (value or DEFAULT_ORIGINS).split(",") if o.strip()]


def is_production(env: str | None = None) -> bool:
    """Anything but an explicit development or test environment is production (fail closed)."""
    return (env or os.environ.get("COMMS_ENV", "production")) not in ("development", "test")


def parse_membership_event(raw: str | bytes) -> tuple[str, str, str] | None:
    """`(event, clinic_id, user_id)` for membership.suspended / membership.role_changed."""
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(data, dict) or data.get("event") not in MEMBERSHIP_EVENTS:
        return None
    clinic_id, payload = data.get("clinicId"), data.get("payload")
    user_id = payload.get("userId") if isinstance(payload, dict) else None
    if not all(isinstance(v, str) and 0 < len(v) <= 64 for v in (clinic_id, user_id)):
        return None
    return data["event"], clinic_id, user_id


class Realtime:
    def __init__(
        self,
        *,
        redis_url: str | None = None,
        cors_origins: list[str] | None = None,
        connect_limit: int = DEFAULT_CONNECT_LIMIT,
        max_sockets_per_user: int = DEFAULT_MAX_SOCKETS_PER_USER,
        trust_proxy: bool = False,
        production: bool = False,
        max_socket_seconds: float = DEFAULT_MAX_SOCKET_SECONDS,
    ):
        self.redis_url = redis_url or None
        self.max_sockets_per_user = max_sockets_per_user
        self.trust_proxy = trust_proxy
        self.max_socket_seconds = max_socket_seconds
        self.timers: dict[str, asyncio.TimerHandle] = {}
        # Production never falls back to localhost origins, and in-memory jti replay protection is
        # per instance, so both gaps refuse sockets (REST keeps working).
        self.disabled_reason: str | None = None
        if production and cors_origins is None:
            self.disabled_reason = "REALTIME_CORS_ORIGINS is not set"
        elif production and not self.redis_url:
            self.disabled_reason = "REDIS_URL is not set"
        if self.disabled_reason:
            cors_origins = []
        self.sio = socketio.AsyncServer(
            async_mode="asgi",
            cors_allowed_origins=cors_origins if cors_origins is not None else parse_origins(None),
            max_http_buffer_size=MAX_HTTP_BUFFER_BYTES,
            client_manager=socketio.AsyncRedisManager(self.redis_url) if self.redis_url else None,
            logger=False,
            engineio_logger=False,
        )
        self.redis = aioredis.from_url(self.redis_url) if self.redis_url else None
        self.jti = JtiStore(self.redis)
        self.throttle = ConnectThrottle(connect_limit)
        self.sessions: dict[str, Session] = {}
        self.redis_state = "down" if self.redis_url else "none"
        self.relay_task: asyncio.Task | None = None
        self.sio.on("connect", self._on_connect)
        self.sio.on("disconnect", self._on_disconnect)

    @classmethod
    def from_env(cls) -> "Realtime":
        origins = os.environ.get("REALTIME_CORS_ORIGINS", "").strip()
        production = is_production()
        return cls(
            redis_url=os.environ.get("REDIS_URL"),
            cors_origins=parse_origins(origins) if origins else None,
            trust_proxy=os.environ.get("REALTIME_TRUST_PROXY", "").lower() == "true",
            production=production,
            max_socket_seconds=float(
                os.environ.get("REALTIME_MAX_SOCKET_SECONDS") or DEFAULT_MAX_SOCKET_SECONDS
            ),
        )

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        if self.disabled_reason:
            log.warning(
                "realtime sockets disabled",
                extra={"fields": {"reason": self.disabled_reason}},
            )
        if self.redis_url and self.relay_task is None:
            self.relay_task = asyncio.create_task(self._relay_loop(), name="realtime-relay")

    async def stop(self) -> None:
        for timer in self.timers.values():
            timer.cancel()
        self.timers.clear()
        if self.relay_task is not None:
            self.relay_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self.relay_task
            self.relay_task = None
        if self.redis is not None:
            with contextlib.suppress(Exception):
                await self.redis.aclose()

    def status(self) -> dict:
        return {"sockets": len(self.sessions), "redis": self.redis_state}

    # ------------------------------------------------------------------ connection
    def _client_ip(self, environ: dict) -> str:
        if self.trust_proxy:
            forwarded = environ.get("HTTP_X_FORWARDED_FOR", "")
            if forwarded.strip():
                # The rightmost entry is the hop appended by our trusted proxy; the leftmost
                # is client-controlled and spoofable.
                last = forwarded.split(",")[-1].strip()
                if last:
                    return last
        return environ.get("REMOTE_ADDR") or "unknown"

    def verify_ticket(self, ticket: object) -> dict:
        if not isinstance(ticket, str) or not ticket or len(ticket) > MAX_TICKET_LENGTH:
            raise refused("UNAUTHORIZED")
        try:
            claims = jwt.decode(
                ticket,
                load_settings().jwt_secret,
                algorithms=["HS256"],
                audience=TICKET_AUDIENCE,
                issuer=TICKET_ISSUER,
                leeway=TICKET_LEEWAY_SECONDS,
                options={"require": ["exp", "iss", "aud", "sub", "clinic_id", "jti"]},
            )
        except jwt.PyJWTError:
            raise refused("UNAUTHORIZED") from None
        for key in ("sub", "clinic_id", "jti"):
            if not isinstance(claims.get(key), str) or not claims[key]:
                raise refused("UNAUTHORIZED")
        return claims

    async def _on_connect(self, sid: str, environ: dict, auth: object = None) -> None:
        if self.disabled_reason:
            raise refused("UNAVAILABLE")
        if not self.throttle.allow(self._client_ip(environ)):
            log.warning("realtime connect throttled")
            raise refused("RATE_LIMITED")
        # Only `ticket` is read; any other auth key is ignored, and a bloated object is refused.
        if isinstance(auth, dict) and len(auth) > MAX_AUTH_KEYS:
            raise refused("UNAUTHORIZED")
        claims = self.verify_ticket(auth.get("ticket") if isinstance(auth, dict) else None)
        try:
            fresh = await self.jti.consume(claims["jti"])
        except Exception as exc:  # fail closed: without the store a replay cannot be excluded
            log.error("jti store unavailable", extra={"fields": {"error": type(exc).__name__}})
            raise refused("UNAUTHORIZED") from None
        if not fresh:
            raise refused("UNAUTHORIZED")
        session = Session(user_id=claims["sub"], clinic_id=claims["clinic_id"])
        # No await between the count and the registration, so concurrent connects cannot overshoot.
        if sum(1 for s in self.sessions.values() if s == session) >= self.max_sockets_per_user:
            raise refused("TOO_MANY_CONNECTIONS")
        self.sessions[sid] = session
        if self.max_socket_seconds > 0:
            loop = asyncio.get_running_loop()
            self.timers[sid] = loop.call_later(
                self.max_socket_seconds, lambda: asyncio.ensure_future(self._expire(sid))
            )
        await self.sio.enter_room(sid, user_room(session.user_id))
        await self.sio.enter_room(sid, clinic_room(session.clinic_id))
        log.info("realtime connected", extra={"fields": {"sockets": len(self.sessions)}})

    async def _on_disconnect(self, sid: str, *_: object) -> None:
        self.sessions.pop(sid, None)
        timer = self.timers.pop(sid, None)
        if timer is not None:
            timer.cancel()

    async def _expire(self, sid: str) -> None:
        """Maximum socket lifetime reached: the client reconnects with a fresh ticket."""
        self.timers.pop(sid, None)
        if sid in self.sessions:
            with contextlib.suppress(Exception):
                await self.sio.disconnect(sid)

    async def disconnect_user(self, clinic_id: str, user_id: str) -> int:
        """Drop this instance's sockets of a user in a clinic (membership changed)."""
        target = Session(user_id=user_id, clinic_id=clinic_id)
        sids = [sid for sid, s in self.sessions.items() if s == target]
        for sid in sids:
            with contextlib.suppress(Exception):
                await self.sio.disconnect(sid)
        return len(sids)

    # ------------------------------------------------------------------ emitters (never raise)
    async def _emit(self, event: str, data: dict, rooms: list[str], *, local: bool = False) -> None:
        try:
            for room in rooms:
                await asyncio.wait_for(
                    self.sio.emit(event, data, room=room, ignore_queue=local),
                    timeout=EMIT_TIMEOUT_SECONDS,
                )
        except Exception as exc:
            fields = {"event": event, "error": type(exc).__name__}
            log.warning("realtime emit failed", extra={"fields": fields})

    async def notification_created(
        self, clinic_id: str, user_id: str | None, dto: dict, unread_count: int | None
    ) -> None:
        """Targeted: `unreadCount` is the user's capped count. Broadcast: `unreadCount` is null
        (the count differs per member, so each client refetches `/unread-count`)."""
        room = user_room(user_id) if user_id else clinic_room(clinic_id)
        await self._emit(
            "notification.created", {"notification": dto, "unreadCount": unread_count}, [room]
        )

    async def notification_read(self, user_id: str, unread_count: int) -> None:
        await self._emit("notification.read", {"unreadCount": unread_count}, [user_room(user_id)])

    async def chat_message(self, conversation_id: str, message: dict, members: list[str]) -> None:
        payload = {"conversationId": conversation_id, "message": message}
        await self._emit("chat.message", payload, [user_room(m) for m in members])

    async def chat_read(self, conversation_id: str, user_id: str, members: list[str]) -> None:
        payload = {"conversationId": conversation_id, "userId": user_id}
        await self._emit("chat.read", payload, [user_room(m) for m in members])

    # ------------------------------------------------------------------ redis relay
    async def handle_relay_message(self, raw: str | bytes) -> bool:
        membership = parse_membership_event(raw)
        if membership is not None:
            _, clinic_id, user_id = membership
            count = await self.disconnect_user(clinic_id, user_id)
            log.info("realtime membership change", extra={"fields": {"disconnected": count}})
            return True  # consumed here, never emitted to browsers
        parsed = parse_envelope(raw)
        if parsed is None:
            log.warning("realtime event dropped: invalid envelope")
            return False
        event, clinic_id, payload = parsed
        # Every instance relays to its own sockets, so do not fan out through the manager again.
        await self._emit(event, payload, [clinic_room(clinic_id)], local=True)
        return True

    async def _relay_loop(self) -> None:
        delay = 1.0
        while True:
            client = aioredis.from_url(self.redis_url, health_check_interval=30)
            pubsub = client.pubsub()
            try:
                await pubsub.subscribe(EVENTS_CHANNEL)
                self.redis_state = "up"
                delay = 1.0
                async for message in pubsub.listen():
                    if message.get("type") == "message":
                        await self.handle_relay_message(message["data"])
                raise ConnectionError("subscription ended")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.redis_state = "down"
                fields = {"error": type(exc).__name__, "retryInSeconds": delay}
                log.warning("realtime relay disconnected", extra={"fields": fields})
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30.0)
            finally:
                with contextlib.suppress(Exception):
                    await pubsub.aclose()
                    await client.aclose()
