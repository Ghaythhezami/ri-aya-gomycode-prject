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

| Variable             | Default                     | Notes                                                     |
| -------------------- | --------------------------- | --------------------------------------------------------- |
| `SERVICE_JWT_SECRET` | none, required              | at least 32 characters (any length when `COMMS_ENV=test`) |
| `MONGODB_URI`        | `mongodb://localhost:27017` |                                                           |
| `MONGODB_DB`         | `riaya_comms`               |                                                           |
| `PORT`               | `4200`                      |                                                           |
| `COMMS_ENV`          | `production`                | `test` relaxes the secret length only                     |

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
| `GET /health`                          | open                                                           | `{status: "ok"\|"degraded", store: "up"\|"down"}`                                   |
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
