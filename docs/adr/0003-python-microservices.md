# ADR 0003 — Python microservices for smart scheduling and communication

Status: accepted (2026-11-06)

## Context

The team agreed in the project sessions that smart scheduling should run as a small Python API that
analyses data and returns assignments, and the brief places high-volume, append-heavy data
(notifications, chat messages) in MongoDB. The NestJS API stays the only public entry point: it
owns authentication, roles, tenant scope, audit and the booking transaction.

## Decision

Two Python 3.12 services (FastAPI, pydantic v2, uvicorn), each in its own folder and deployable on
its own:

| Service           | Folder               | Port | Store                      | Owns                                               |
| ----------------- | -------------------- | ---- | -------------------------- | -------------------------------------------------- |
| `riaya-scheduler` | `services/scheduler` | 4100 | PostgreSQL (read-only use) | optimiser (`/v1/optimize`), large-history insights |
| `riaya-comms`     | `services/comms`     | 4200 | MongoDB (`riaya_comms`)    | notifications, chat conversations and messages     |

```
SPA ──REST──▶ NestJS API (JWT, roles, TenantContext) ──service JWT──▶ riaya-scheduler ──▶ PostgreSQL
                     │                                └──service JWT──▶ riaya-comms     ──▶ MongoDB
                     └── PostgreSQL (transactions, audit), Redis (cache, locks, lockout)
```

Each integration is switched on by an environment variable in the API (`SCHEDULER_URL`,
`COMMS_URL`). Without it the API keeps its in-process implementation, so local development and the
hosted demo never depend on a service being up.

- Optimiser: when the Python call fails or times out (3 s), the API falls back to the TypeScript
  optimiser and records `engine` in the proposal. The two implementations must return identical
  results for the shared fixtures (`services/scheduler/tests/fixtures`, generated from the
  TypeScript optimiser by `server/scripts/export-optimizer-fixtures.ts`).
- Insights have no fallback: the API answers `503 SERVICE_UNAVAILABLE`.
- Communication: when `COMMS_URL` is set, notifications and chat read and write MongoDB through
  `riaya-comms`; reminder deliveries stay in PostgreSQL (they are transactional with appointments).

## Service authentication and tenant scope

The API signs a short-lived HS256 JWT per request with `SERVICE_JWT_SECRET` (32+ characters,
shared by the API and the services):

| Claim       | Value                                                    |
| ----------- | -------------------------------------------------------- |
| `iss`       | `riaya-api`                                              |
| `aud`       | `riaya-scheduler` or `riaya-comms`                       |
| `sub`       | acting user id, or `system`                              |
| `clinic_id` | clinic id from the caller's verified JWT (TenantContext) |
| `role`      | caller role (`SUPER_ADMIN`, `CLINIC_ADMIN`, …, `SYSTEM`) |
| `scope`     | optional, `admin` for reset/import                       |
| `iat`/`exp` | lifetime 60 s                                            |

Services verify signature, `iss`, `aud` and `exp` (30 s leeway at most), reject anything else with
401, and take the tenant only from `clinic_id`. No request body or query carries a clinic id.
`GET /health` is open and reports the store state (`{status: "ok"|"degraded", store: "up"|"down"}`).

## Wire format

- JSON, camelCase field names (pydantic alias generator; services accept and emit camelCase).
- Times: optimiser uses epoch milliseconds exactly like `server/src/scheduling/optimizer.ts`;
  everything else ISO 8601 UTC strings.
- Errors: `{ "code": "...", "message": "...", "details"?: ... }` with codes `UNAUTHORIZED`,
  `FORBIDDEN`, `VALIDATION_FAILED`, `NOT_FOUND`, `SERVICE_UNAVAILABLE`, `INTERNAL`.
  Validation errors return 422 with `details` listing the fields. No stack traces, no personal data
  in logs (log ids and counts only).

## riaya-scheduler contract

`POST /v1/optimize` — body `OptimizerInput`, response `OptimizerResult`, both exactly the
TypeScript types in `server/src/scheduling/optimizer.ts` (same algorithm, same constants
`MAX_PASSES`, `IMPROVEMENT_EPSILON`, `IDLE_DOCTOR_FREE_MINUTES`, same metrics as
`server/src/scheduling/metrics.ts`, same deterministic tie-breaking). Pure computation, no database.

`POST /v1/insights` — body `{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "timeZone": "Africa/Tunis" }`
(range up to 730 days). Reads the clinic's appointments from PostgreSQL with a server-side cursor in
chunks of 10 000 rows and aggregates with numpy, so memory stays flat whatever the history size.
Response:

```jsonc
{
  "range": { "from": "…", "to": "…", "timeZone": "…" },
  "totals": { "appointments": 0, "completed": 0, "noShows": 0, "cancelled": 0, "noShowRate": 0.0 },
  "demand": { "matrix": [[0, …24], …7], "peak": [{ "weekday": 1, "hour": 9, "count": 0 }] },   // weekday 0 = Monday, local time
  "noShow": {
    "byWeekday": [{ "key": "0", "rate": 0.0, "count": 0 }],
    "byHour": [{ "key": "9", "rate": 0.0, "count": 0 }],
    "byType": [{ "key": "CONSULTATION", "rate": 0.0, "count": 0 }],
    "byLeadTime": [{ "key": "0-1d" | "2-7d" | "8-30d" | "31d+", "rate": 0.0, "count": 0 }]
  },
  "doctors": [{ "doctorId": "…", "appointments": 0, "bookedMinutes": 0, "noShowRate": 0.0, "avgDurationMinutes": 0.0 }],
  "forecast": [{ "date": "YYYY-MM-DD", "expected": 0.0 }],            // next 14 days
  "recommendations": [
    { "kind": "HIGH_NO_SHOW_SLOT", "params": { "weekday": 4, "hour": 9, "rate": 0.21, "count": 34 } },
    { "kind": "PEAK_HOURS", "params": { "cells": [{ "weekday": 4, "hour": 11, "count": 25 }] } },
    { "kind": "UNDERUSED_DOCTOR", "params": { "doctorId": "…", "bookedMinutes": 0, "medianMinutes": 0 } }
  ],
  "meta": { "rowsScanned": 0, "chunks": 0, "durationMs": 0, "engine": "numpy" }
}
```

Rates are Bayesian-smoothed towards the clinic's overall no-show rate (prior weight 20) so small
buckets do not produce extreme values. The no-show denominator is appointments that reached a
final state (completed or no-show); each bucket's `count` is that denominator. `totals.appointments`
includes cancelled bookings, `demand` excludes them. The forecast is an exponentially weighted mean of the same
weekday over the last 8 weeks.

## riaya-comms contract

The acting user is `sub`; a notification is visible to it when `userId == sub` or `userId` is null.

| Method and path                        | Purpose                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `POST /v1/notifications`               | create one (body = `CreateNotificationInput` without `clinicId`); idempotent on `dedupeKey` → `{ id, created }` |
| `POST /v1/notifications/bulk`          | up to 1 000 items, unordered insert, duplicates ignored → `{ created, duplicates }`                             |
| `GET /v1/notifications`                | `category`, `unread`, `cursor`, `limit` (1–100, default 20) → `NotificationPage` (shared schema)                |
| `GET /v1/notifications/unread-count`   | `{ count }`                                                                                                     |
| `POST /v1/notifications/{id}/read`     | `{ success: true }`, 404 when not visible                                                                       |
| `POST /v1/notifications/read-all`      | `{ updated }`                                                                                                   |
| `GET /v1/notifications/stats`          | `from`, `to` → counts per category and per day (aggregation pipeline)                                           |
| `GET /v1/conversations`                | the member's conversations, newest activity first, with `lastMessage` and `unreadCount`                         |
| `POST /v1/conversations`               | `{ memberIds, title? }` (caller added; a 1:1 pair is reused) → conversation                                     |
| `GET /v1/conversations/{id}/messages`  | `cursor`, `limit` → `{ items, nextCursor }`, newest first; 404 when not a member                                |
| `POST /v1/conversations/{id}/messages` | `{ body }` (1–2 000 characters, stored as text, escaped at render) → message                                    |
| `POST /v1/conversations/{id}/read`     | marks the member's unread messages read → `{ updated }`                                                         |
| `POST /v1/admin/reset`                 | `scope=admin`: delete the clinic's documents                                                                    |
| `POST /v1/admin/import`                | `scope=admin`: upsert `{ notifications, conversations, messages }` by id (demo seed, migration)                 |

Conversations and messages return ids only (`memberIds`, `senderId`); the API resolves names from
PostgreSQL. The API checks that every member is an active staff user of the clinic before it calls
`POST /v1/conversations`.

MongoDB collections and indexes:

- `notifications`: unique `dedupeKey`; `{clinicId, userId, createdAt: -1, _id: -1}`; TTL on
  `createdAt` after 90 days (brief RT-3).
- `conversations`: `{clinicId, memberIds, updatedAt: -1}`.
- `messages`: `{conversationId, createdAt: -1, _id: -1}`; `{clinicId, createdAt: -1}`.

Cursors are opaque base64 strings of `createdAt|id`.

## Consequences

- Heavy analysis (years of appointments) runs outside the API process and scales separately.
- One more secret (`SERVICE_JWT_SECRET`) and two more deployments to operate; both are optional.
- The TypeScript optimiser stays as the fallback, so its tests and the parity fixtures must be kept
  in step: a change to one implementation changes both.
