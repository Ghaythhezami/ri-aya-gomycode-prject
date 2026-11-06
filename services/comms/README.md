# riaya-comms

Notifications and staff chat on MongoDB, behind the NestJS API (ADR `docs/adr/0003-python-microservices.md`).
FastAPI, pydantic v2, pymongo native `AsyncMongoClient`. Python 3.12.

## Run

```bash
cd services/comms
uv sync                                   # installs Python 3.12 deps (dev + migrate groups)
export SERVICE_JWT_SECRET=<32+ chars, same value as the API>
uv run uvicorn app.main:app --port 4200
```

Vercel: `index.py` exposes `app`; runtime dependencies are in `requirements.txt`.
Docker: `docker build -t riaya-comms . && docker run -p 4200:4200 -e SERVICE_JWT_SECRET=... -e MONGODB_URI=... riaya-comms`.

## Environment

| Variable                      | Default                                       | Notes                                                                          |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| `SERVICE_JWT_SECRET`          | none, required                                | at least 32 characters (any length when `COMMS_ENV=test`)                      |
| `MONGODB_URI`                 | `mongodb://localhost:27017`                   |                                                                                |
| `MONGODB_DB`                  | `riaya_comms`                                 |                                                                                |
| `PORT`                        | `4200`                                        |                                                                                |
| `COMMS_ENV`                   | `production`                                  | `test` relaxes the secret length only; `development` enables the docs          |
| `REDIS_URL`                   | unset                                         | enables the `riaya:events` relay, Redis `jti` store and multi-instance fan-out |
| `REALTIME_CORS_ORIGINS`       | `http://localhost:3000,5173,5174,5175`        | comma-separated browser origins allowed to open the socket                     |
| `REALTIME_TRUST_PROXY`        | `false`                                       | `true` takes the client IP for the connect throttle from `X-Forwarded-For`     |
| `REALTIME_MAX_SOCKET_SECONDS` | `900`                                         | maximum socket lifetime; the client reconnects with a fresh ticket             |
| `DOCS_ENABLED`                | `false` (`true` when `COMMS_ENV=development`) | serves `/docs` and `/openapi.json`                                             |

Indexes are created idempotently at startup and again on the first request if the store was down.
The Mongo client uses `serverSelectionTimeoutMS=3000` and `maxPoolSize=10`.

## Authentication

`Authorization: Bearer <HS256 JWT>` with `iss=riaya-api`, `aud=riaya-comms`, `exp` (30 s leeway), and
required `sub` and `clinic_id`; optional `role`, `scope`. The tenant is only ever `clinic_id`; bodies
that contain a `clinicId` are rejected with 422. `/v1/admin/*` need `scope=admin` (403 otherwise).
Anything else wrong with the token is a uniform 401.

Errors: `{ "code", "message", "details"? }` with `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404,
`VALIDATION_FAILED` 422 (`details`: `[{field, message, type}]`, never the submitted values),
`SERVICE_UNAVAILABLE` 503 (Mongo unreachable), `INTERNAL` 500 (no stack).
Logs are JSON lines (`requestId`, route template, status, duration, `clinicId`); no bodies or names.
`X-Request-Id` is passed through (`[A-Za-z0-9._-]{1,64}`) or generated, and echoed on the response.

## Endpoints

All JSON, camelCase, times ISO 8601 UTC like `2026-11-06T09:30:00.000Z`. Cursors are opaque
base64 of `createdAt|id`; ordering is `createdAt desc, id desc`; a bad cursor is 422.

| Method and path                        | Body / query                                                   | Response                                                                            |
| -------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /health`                          | open                                                           | `{status, store: "up"\|"down", realtime: {sockets, redis: "up"\|"down"\|"none"}}`   |
| `POST /v1/notifications`               | `NotificationIn`                                               | `{id, created}` (201 new, 200 duplicate `dedupeKey`)                                |
| `POST /v1/notifications/bulk`          | `{items: NotificationIn[1..1000]}`                             | `{created, duplicates}`                                                             |
| `GET /v1/notifications`                | `category`, `unread`, `cursor`, `limit` 1-100 (20)             | `{items: NotificationDto[], nextCursor, unreadCount}` (`unreadCount` capped at 100) |
| `GET /v1/notifications/unread-count`   |                                                                | `{count, capped}` (`count` ≤ 100; `capped` true when 100 reached, UI shows 99+)     |
| `POST /v1/notifications/{id}/read`     |                                                                | `{success: true}`, 404 when not visible                                             |
| `POST /v1/notifications/read-all`      |                                                                | `{updated}` = capped unread count just before (O(1), moves the watermark)           |
| `GET /v1/notifications/stats`          | `from`, `to` (date or datetime; default last 30 days; max 366) | `{from, to, total, byCategory:[{category,count,unread}], byDay:[{date,count}]}`     |
| `GET /v1/conversations`                |                                                                | `ConversationOut[]` (newest activity first, max 200)                                |
| `POST /v1/conversations`               | `{memberIds, title?}`                                          | `ConversationOut` (201 new, 200 reused 1:1)                                         |
| `GET /v1/conversations/{id}/messages`  | `cursor`, `limit` 1-50 (30)                                    | `{items: MessageOut[], nextCursor}` newest first                                    |
| `POST /v1/conversations/{id}/messages` | `{body}` 1-2000 chars after trim                               | `MessageOut` (201)                                                                  |
| `POST /v1/conversations/{id}/read`     |                                                                | `{updated}`                                                                         |
| `POST /v1/admin/reset`                 | `scope=admin`                                                  | `{notifications, conversations, messages, reads}` deleted counts                    |
| `POST /v1/admin/import`                | `scope=admin`, `ImportIn`                                      | `{notifications, conversations, messages, reads, skipped}`                          |

`NotificationIn`: `{userId?, category, titleKey, bodyKey, params?, entityType?, entityId?, dedupeKey}`.
A notification is visible to `sub` when `userId == sub` or `userId` is null.

Read state: `read-all` stores one watermark per user in `notification_reads`
(`{_id: "<clinicId>:<userId>", clinicId, userId, readAllAt}`, server time, millisecond precision) and
never touches notification documents. A notification is read for user U when
`createdAt <= readAllAt(U)` or `U in readBy` (single `POST /{id}/read` still does `$addToSet readBy`,
and is a no-op when the watermark already covers it). The unread filter adds `createdAt > readAllAt`
so the index range shrinks; unread counts use `count_documents(limit=100)`, queries are pinned to the
`clinic_user_created` index with `hint` so the clinic-agnostic TTL index is never chosen.

`NotificationDto` (identical to `@riaya/shared`): `{id, category, titleKey, bodyKey, params, entityType, entityId, read, createdAt}`.

```json
// ConversationOut
{ "id": "…", "title": null, "isGroup": false, "memberIds": ["u1", "u2"],
  "lastMessage": { "body": "hi", "createdAt": "2026-11-06T09:30:00.000Z", "senderId": "u1" },
  "unreadCount": 2, "createdAt": "…", "updatedAt": "…" }

// MessageOut
{ "id": "…", "conversationId": "…", "senderId": "u1", "body": "hi",
  "readBy": ["u1"], "readByOthers": false, "createdAt": "2026-11-06T09:30:00.000Z" }
```

Conversations and messages carry ids only; the API resolves names. `lastMessage` is `null` for an
empty conversation. A conversation the caller is not a member of (or that belongs to another clinic,
or does not exist) is a 404 on every route.

Conversation rules: the caller is always added, member ids are deduplicated and sorted; fewer than two
members is 422; two members without a title reuse the existing conversation with exactly those two
members (also race-safe: the id is deterministic for a titleless pair); more than two members, or a
title, always creates a new conversation (`isGroup = members > 2`).

Unread counts for conversations are computed per request by one aggregation over the listed
conversations (`conversationId $in`, `senderId != sub`, `readBy $ne sub`, `$group`), using the
`{conversationId, createdAt, _id}` index. No counters are stored, so nothing can drift.

Example:

```bash
TOKEN=$(python -c "import jwt,time;print(jwt.encode({'iss':'riaya-api','aud':'riaya-comms','sub':'<user>','clinic_id':'<clinic>','exp':int(time.time())+60},'$SERVICE_JWT_SECRET',algorithm='HS256'))")
curl -H "Authorization: Bearer $TOKEN" "http://localhost:4200/v1/notifications?limit=5&unread=true"
curl -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"category":"SYSTEM","titleKey":"t","bodyKey":"b","dedupeKey":"evt-1"}' \
  http://localhost:4200/v1/notifications
```

### Admin import payload

```json
{
  "notifications": [
    {
      "id": "…",
      "userId": null,
      "category": "SYSTEM",
      "titleKey": "…",
      "bodyKey": "…",
      "params": {},
      "entityType": null,
      "entityId": null,
      "dedupeKey": "…",
      "readBy": [],
      "createdAt": "2026-11-01T08:00:00Z"
    }
  ],
  "conversations": [
    {
      "id": "…",
      "title": null,
      "isGroup": false,
      "memberIds": ["u1", "u2"],
      "createdAt": "…",
      "updatedAt": "…"
    }
  ],
  "messages": [
    {
      "id": "…",
      "conversationId": "…",
      "senderId": "u1",
      "body": "…",
      "readBy": ["u1"],
      "createdAt": "…"
    }
  ],
  "reads": [{ "userId": "u1", "readAllAt": "2026-11-02T00:00:00Z" }] // optional, default []
}
```

Up to 10 000 items per array. Documents are upserted by `id` inside the caller's clinic (`clinicId`
comes from the token and is rejected in the body); `createdAt` and `readBy` are kept. An id or
`dedupeKey` that already belongs to another clinic is skipped and counted in `skipped`.

## Collections and indexes

`notifications` (unique `dedupeKey`; `{clinicId, userId, createdAt:-1, _id:-1}`; TTL on `createdAt`, 90 days),
`conversations` (`{clinicId, memberIds, updatedAt:-1}`), `messages` (`{conversationId, createdAt:-1, _id:-1}`,
`{clinicId, createdAt:-1}`), `notification_reads` (only `_id` lookups). `_id` is a string UUID exposed as `id`.

## Tests

```bash
uv run ruff check . && uv run ruff format --check . && uv run pytest -q
```

Tests use the real MongoDB at `MONGODB_URI` (default `mongodb://localhost:27017`) in a unique
`riaya_comms_test_<random>` database that is dropped at the end; the suite skips cleanly if Mongo
is unreachable.

## Benchmark

```bash
uv run python scripts/bench_notifications.py        # 1,000,000 notifications, db riaya_comms_bench (dropped after)
```

Prints timings of unread-count (before and after read-all), first page, unread-only page, read-all and stats, plus the winning-plan index names.

## Migration from PostgreSQL

```bash
PG_URL=postgresql://... MONGODB_URI=... MONGODB_DB=riaya_comms uv run python scripts/migrate_from_postgres.py
```

Reads `notifications`, `chat_conversations`, `chat_messages` (joined to the conversation for
`clinicId`) with server-side cursors in chunks of 5 000 and upserts by id, so it is idempotent.
Prints counts only. Migrated notifications older than 90 days are removed by the TTL index.

## Realtime (Socket.IO)

`python-socketio` is mounted on the same port at `/socket.io` (`socketio.ASGIApp(sio, other_asgi_app=api)`),
so `uvicorn app.main:app` serves REST and sockets. ADR 0004 section 4.

Connect flow: the SPA calls `POST /api/realtime/ticket` on the NestJS API (JWT, `viewNotifications`,
10/min) and connects with `io(url, { path: "/socket.io", auth: { ticket } })`. The ticket is an HS256 JWT
signed with `SERVICE_JWT_SECRET`: `iss riaya-api`, `aud riaya-realtime`, `sub`, `clinic_id`, `role`,
`jti`, 60 s. It is verified once on connect and its `jti` is consumed (`SET riaya:rt:jti:<jti> 1 NX EX 120`
with `REDIS_URL`, an in-memory TTL set without; if Redis is configured but down, connections are
refused). Refusals are `connect_error` with `{message, data: {code}}`, `code` one of `UNAUTHORIZED`,
`RATE_LIMITED` (20 attempts/min per IP, per instance) or `TOO_MANY_CONNECTIONS` (5 sockets per user,
per instance). The socket joins `user:<sub>` and `clinic:<clinic_id>`; clients cannot join rooms.

| Event (server to client)                                                                   | Room                                                    | Payload                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------- |
| `notification.created`                                                                     | `user:<id>` (targeted) or `clinic:<id>` (`userId` null) | `{notification: NotificationDto (read=false), unreadCount}`         |
| `notification.read`                                                                        | `user:<sub>` after read / read-all                      | `{unreadCount}`                                                     |
| `chat.message`                                                                             | `user:<member>` for every member                        | `{conversationId, message: MessageOut}`                             |
| `chat.read`                                                                                | `user:<member>` for every member                        | `{conversationId, userId}`                                          |
| `queue.updated`, `appointment.created`, `appointment.cancelled`, `appointment.rescheduled` | `clinic:<clinicId>`                                     | the envelope `payload` of `packages/shared/src/schemas/realtime.ts` |

`unreadCount` is the capped count of the REST API (at most 100). For a targeted notification it is the
recipient's count; for a broadcast it is `null` because the value differs per member, so the client
refetches `GET /v1/notifications/unread-count`. Bulk imports push at most 50 notifications; larger
imports are picked up by polling. Emitting never fails the REST write.

Relay: with `REDIS_URL` a background task subscribes to `riaya:events`, validates the envelope
(contract version 1, strict payloads, same rules as the NestJS relay), drops invalid messages (logged
without content) and emits `event` with its `payload` to `clinic:<clinicId>` of the sockets on this
instance, reconnecting with backoff (1 s up to 30 s). Several instances share rooms through
`socketio.AsyncRedisManager(REDIS_URL)`. Logs contain counts and error class names only.

Hardening: a socket lives at most `REALTIME_MAX_SOCKET_SECONDS`, and the API's internal
`membership.suspended` / `membership.role_changed` events (`{clinicId, payload: {userId}}` on
`riaya:events`) disconnect that user's sockets in that clinic; comms never emits them to browsers.
With `REALTIME_TRUST_PROXY=true` the rightmost `X-Forwarded-For` entry is the client IP. In production
(`COMMS_ENV` not `development`/`test`) sockets are refused with `UNAVAILABLE`, and a warning is logged
at startup, when `REALTIME_CORS_ORIGINS` or `REDIS_URL` is unset; REST keeps working. Tickets over 4096
characters and auth objects with more than 8 keys are refused, other auth keys are ignored, and inbound
messages are capped at 16 KiB. The notification `dedupeKey` is unique per clinic (`clinic_dedupe_unique`);
the old global `dedupeKey_unique` index is dropped at startup.

Hosting: sockets and the subscriber need a long-running process (Docker, Fly, Render, a VM), not
Vercel functions. Run one process per container and put the instances behind a load balancer with
sticky sessions or websocket-only transport. Without `REALTIME_PUBLIC_URL` on the API the ticket
endpoint answers `{url: null, ticket: null}` and the SPA keeps polling.
