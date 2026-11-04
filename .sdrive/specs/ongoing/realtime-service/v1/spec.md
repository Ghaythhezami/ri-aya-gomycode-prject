---
title: Realtime service
status: backlog
version: v1
product_items: [BP-031]
created: 2026-11-04
updated: 2026-11-04
---

# Realtime Service (BP-031)

> **Product item:** `BP-031` — Milestone M5 — Optimisation & live queue — Priority P1 — Brief task RT-1
> **Branch / base:** `feature/realtime-service` / `main`

## Overview

- **Problem Statement**: The platform has no push channel. Every screen that will need one — the live
  queue, the schedule board, staff chat and the notification centre — either does not exist yet or
  would have to poll the REST API. `docker-compose.yml` already provisions the two backends this
  needs (`redis` and `mongo`), but nothing in the repo connects to Mongo, no service consumes Redis
  pub/sub, and there is no `socket.io` or `mongoose` dependency anywhere. There is also no agreed
  event contract, so the moment APP-1 and QUE-1 start emitting domain events there is nothing to
  define what those events look like or who may receive them.

- **Proposed Solution**: Add a fourth application, `realtime/`, as a NestJS service that owns exactly
  one job in this version: **authenticated, tenant-scoped, fan-out delivery**. It validates the
  existing access token during the Socket.IO handshake, binds each connection to a user and their
  active clinic, joins per-user and per-clinic rooms, and uses the Redis adapter so any instance can
  reach any client. It subscribes to a single Redis pub/sub channel, `riaya:events`, validates each
  payload against a Zod schema published from `packages/shared`, and forwards it to the clinic room
  named in the event. It connects to MongoDB to prove the connection but declares no collections
  until chat and notifications exist.

- **Target Audience**: The backend and frontend engineers who will build RT-2 (staff chat), RT-3
  (notification centre), QUE-2 (queue display) and the schedule board on top of this transport.
  Indirect users are clinic staff who expect a live queue that updates without a refresh.

- **Assumptions**:
  1. `realtime/` becomes a fourth pnpm workspace package. CON-101 says the workspace has "exactly"
     `web`, `server` and `backoffice`; `overview.md` says to plan `realtime-service` as new work. The
     conflict is recorded as RISK-001 and needs an owner decision at Gate 1, not a silent edit.
  2. The access token is the JWT already issued by `server`; this service validates it with the same
     secret from the environment (`JWT_ACCESS_SECRET`). There is no JWKS endpoint and none is added.
  3. The token carries the user id, the active clinic id and the role. The exact claim names are read
     from `server`'s auth code during planning; this spec names the values, not the claim keys.
  4. Delivery is **at-most-once**. Without persistence there is no replay, so a client that is
     disconnected misses events published while it was away. This is acceptable for v1 because the
     consumers can re-fetch state after reconnect.
  5. Sockets authenticate with the access token only. There is no refresh-token exchange on the
     socket, so a client must reconnect with a fresh token when the old one expires.
  6. MongoDB is reachable in local development via the existing compose file; nothing is stored in it
     in this version.

## User Stories

### US-001: Only authenticated clients connect

As a platform engineer, I want every socket connection to prove who it is before it receives
anything, so that an anonymous client cannot listen to clinic traffic.

**Acceptance Criteria:**

- AC-001: Given a connection attempt with no token, when the handshake is processed, then the
  connection is rejected with a `connect_error` and no room membership is created.
- AC-002: Given a token with a bad signature or an expiry in the past, when the client connects, then
  the handshake is rejected, and the client receives the same generic refusal reason regardless of
  which check failed.
- AC-003: Given a valid access token for user `U` in clinic `C` with role `R`, when the client
  connects, then the connection is bound to `U`, `C` and `R`, and the socket is joined to `user:<U>`
  and `clinic:<C>` with no client-side join call.
- AC-004: Given a socket bound to clinic `C`, when the client asks to join `clinic:<other>`, then the
  request is refused, no membership is added, and the socket never receives an event from `<other>`.

### US-002: A connection only carries its own clinic's traffic

As a receptionist, I want realtime updates from my clinic only, so that I never see another clinic's
patients or queue.

**Acceptance Criteria:**

- AC-005: Given two clients bound to different clinics, when an event is published to `clinic:<C>`,
  then the client bound to `C` receives it and the other client receives nothing.
- AC-006: Given a client that drops and reconnects with a valid token, when it reconnects, then it is
  rejoined to its user and clinic rooms without a client-side join call.
- AC-007: Given a connected socket whose token expires while connected, when that expiry moment is
  reached, then the server disconnects that socket and the client must present a fresh token to
  reconnect.

### US-003: Delivery survives more than one instance

As an operator, I want two instances of the service to behave as one, so that scaling out does not
silently split my users into two worlds.

**Acceptance Criteria:**

- AC-008: Given two service instances sharing one Redis, when a client is connected to each instance
  and both are in `clinic:<C>`, then a single publish to that room delivers the event to each client
  once.
- AC-009: Given Redis is unreachable when the service starts, when it boots, then it starts and
  accepts connections, `/health/live` returns 200, and `/health/ready` reports degraded naming Redis.
- AC-010: Given Redis becomes reachable after startup, when the adapter reconnects, then events
  published to `riaya:events` are relayed again without restarting the process.

### US-004: Domain events reach the right clinic room

As an engineer building appointments or the queue, I want to publish one event and have every clinic
screen see it, so that I do not write fan-out code per screen.

**Acceptance Criteria:**

- AC-011: Given a valid `appointment.created` event published on `riaya:events` with clinic `C`, when
  the service receives it, then it is forwarded to `clinic:<C>` with the event name preserved and its
  payload unchanged.
- AC-012: Given a payload that fails schema validation, when it is received, then it is not
  forwarded, a warning is logged naming the channel and the failing field, and the process keeps
  running.
- AC-013: Given a valid event naming a clinic with no connected sockets, when it is received, then it
  is dropped without error and the drop is logged.
- AC-014: Given the four contract events, when the shared Zod schemas are inspected in
  `packages/shared`, then each event declares its required fields and a contract version, and both
  the service and the producer-side test import that same schema.

### US-005: An operator can tell whether the service is healthy

As an operator, I want liveness and readiness to be separate and to name the failing dependency, so
that a Mongo outage does not make me restart a working socket server.

**Acceptance Criteria:**

- AC-015: Given the service is running, when `GET /health/live` is called, then it returns 200.
- AC-016: Given MongoDB is unreachable, when `GET /health/ready` is called, then it returns 503
  naming Mongo as the failed dependency, while socket connections continue to work.

## Requirements

### Functional Requirements

- FR-001: The repository MUST add `realtime/` as a fourth pnpm workspace package containing a NestJS
  application with strict TypeScript, its own ESLint configuration and a `dev`/`build`/`test` script
  set that mirrors `server`.
- FR-002: The service MUST run a Socket.IO server on its own port (`REALTIME_PORT`, default `4001`)
  with the Socket.IO path `/socket.io`.
- FR-003: The handshake MUST require a valid access token supplied in the Socket.IO `auth` payload or
  an `Authorization: Bearer` header, and MUST reject the connection before any room join when it is
  missing, malformed, expired or signed with the wrong key.
- FR-004: On a successful handshake the connection MUST be bound to the user id, active clinic id and
  role carried by the token, and the socket MUST be joined to `user:<userId>` and `clinic:<clinicId>`.
- FR-005: The service MUST refuse any attempt to join a room for a clinic other than the one bound to
  the connection, and MUST NOT expose a room whose name a client can forge into another tenant.
- FR-006: The Socket.IO server MUST use the Redis adapter so that a publish from any instance reaches
  clients connected to every instance.
- FR-007: When Redis is unreachable at startup the service MUST still start and serve connections on
  that instance, and MUST report `degraded` from the readiness probe until the adapter reconnects.
- FR-008: The service MUST subscribe to the Redis pub/sub channel `riaya:events` and forward each
  received event, unchanged, to `clinic:<clinicId>` using the event name it carries.
- FR-009: Every relayed event MUST be validated against its Zod schema before forwarding; a payload
  that fails MUST be dropped, logged with the channel and the failing field, and MUST NOT crash the
  process.
- FR-010: The service MUST define the wire contract for `appointment.created`,
  `appointment.cancelled`, `appointment.rescheduled` and `queue.updated`, including a contract
  version field, in `packages/shared`.
- FR-011: The service MUST expose `GET /health/live` and `GET /health/ready`, reporting Redis and
  Mongo connectivity separately in the readiness response.
- FR-012: The service MUST connect to MongoDB with Mongoose at startup and MUST declare no
  collection in this version.

### Non-Functional Requirements

- NFR-001: Access tokens MUST be validated with the same secret and claim semantics as `server`; the
  service MUST NOT implement a second authentication scheme.
- NFR-002: Publish-to-delivery latency MUST be at or below 500 ms at p95 with 200 concurrent
  connections on a single instance.
- NFR-003: The service MUST NOT persist message content: no chat, notification or delivery-log
  collection may exist in v1, so no patient data is stored by this service.
- NFR-004: The service MUST NOT import from `server`, `web` or `backoffice` source (CON-106); every
  shared contract lives in `packages/shared`.
- NFR-005: The package MUST pass `tsc --noEmit` under strict mode and ESLint with zero warnings
  (CON-203, CON-205, CON-206).
- NFR-006: Logging MUST be structured and follow the conventions `server` already uses, so one log
  pipeline serves both processes.
- NFR-007: The service MUST be startable both with `pnpm --filter realtime dev` and from the existing
  compose file, and its Dockerfile MUST build in CI.
- NFR-008: Every new environment variable MUST be documented in `.env.example` and MUST have no
  committed default that works in production (CON-504, CON-519).
- NFR-010: Authentication (CON-511): the handshake MUST reject any connection without a valid access
  token, and MUST NOT accept a refresh token in its place.
- NFR-011: Authorization (CON-512): room membership MUST follow the role and clinic on the token; a
  connection MUST NOT be able to widen its own scope through any client-emitted message.
- NFR-012: Security headers (CON-513): the HTTP surface MUST apply Helmet.
- NFR-013: Rate limiting (CON-514): connection attempts per IP MUST be throttled, so a token-guessing
  loop cannot open connections without limit.
- NFR-014: Input validation (CON-515): every inbound payload, including handshake `auth` and every
  received domain event, MUST be validated against an explicit schema with unknown fields rejected.
- NFR-015: Injection protection (CON-516): the service MUST issue no raw query; MongoDB access, when
  a collection exists in a later version, MUST go through Mongoose models.
- NFR-016: XSS protection (CON-517): relayed payloads MUST be transported as data only, with no
  server-side HTML construction.
- NFR-017: Environment security (CON-519): secrets MUST be read from the environment only, never
  committed and never logged.
- NFR-018: HTTPS/HSTS (CON-520): Helmet's HSTS MUST be enabled and `COOKIE_SECURE` MUST be true
  outside local development.

## Security Baseline

Controls from `.sdrive/constitution.md` §5 (CON-511 to CON-520), as applied to this feature:

| Control                      | Status             | How this feature addresses it                                                                                                                                                                                                      |
| ---------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-511 Authentication       | Addressable        | `NFR-010`, `FR-003`, `AC-001`, `AC-002`                                                                                                                                                                                            |
| CON-512 Authorization        | Addressable        | `NFR-011`, `FR-005`, `AC-004`                                                                                                                                                                                                      |
| CON-513 Security headers     | Addressable        | `NFR-012` — Helmet on the health HTTP surface                                                                                                                                                                                      |
| CON-514 Rate limiting        | Addressable        | `NFR-013` — connect-attempt throttling                                                                                                                                                                                             |
| CON-515 Input validation     | Addressable        | `NFR-014`, `FR-009`, `AC-012`                                                                                                                                                                                                      |
| CON-516 Injection protection | Addressable        | `NFR-015` — no raw queries, no collections yet                                                                                                                                                                                     |
| CON-517 XSS protection       | Addressable        | `NFR-016`                                                                                                                                                                                                                          |
| CON-518 CSRF protection      | **NOT APPLICABLE** | Sockets authenticate with a bearer token in the handshake, not an ambient cookie, so there is no cross-site request to forge. The only HTTP routes are idempotent `GET` health probes. Recorded here rather than silently skipped. |
| CON-519 Environment security | Addressable        | `NFR-017`, `NFR-008`                                                                                                                                                                                                               |
| CON-520 HTTPS / HSTS         | Addressable        | `NFR-018`                                                                                                                                                                                                                          |

## UI/UX & Data Requirements

- **UI/UX**: None in this version. The service is headless; RT-2, RT-3 and QUE-2 own every screen
  that consumes it. No locale keys, no RTL surface, no design-system component is added.
- **Data**: No persisted domain data. The service reads Redis (pub/sub and the adapter) and opens a
  Mongoose connection without declaring a model. The event contract is the only data artefact and it
  lives in `packages/shared` as a Zod schema plus its TypeScript type.

## Edge Cases & Error States

- EC-001: A client disconnects and reconnects — it is rejoined to its rooms automatically; events
  published while it was gone are not replayed (at-most-once).
- EC-002: A token expires mid-connection — the socket is disconnected at the expiry moment rather
  than at the next message, so a stale credential never keeps listening.
- EC-003: Redis restarts — the adapter reconnects and relay resumes; events published during the
  outage are lost and this is documented rather than retried.
- EC-004: MongoDB is unreachable — readiness reports 503 naming Mongo, liveness stays 200, and
  sockets keep working because nothing in v1 reads Mongo.
- EC-005: The same event is published twice — both are delivered. There is no deduplication in v1
  because there is no persistence to deduplicate against.
- EC-006: An event names a clinic with no connected sockets — it is dropped and logged at debug level.
- EC-007: A payload exceeds 16 KB — Socket.IO rejects it at the configured buffer limit and the
  connection is not closed.
- EC-008: A client joins a room it already belongs to — the join is idempotent and emits no error.
- EC-009: The process receives SIGTERM — it stops accepting connections, closes the Redis adapter and
  exits within the shutdown timeout.
- EC-010: Two instances are started before Redis is up — both start degraded, and both recover when
  the adapter reconnects.

## Out of Scope

- Staff chat, typing indicators, read receipts and message history (RT-2).
- The notification centre and delivery logs (RT-3).
- Any message or notification persistence, and therefore any MongoDB collection.
- Appointment and queue producers: APP-1 and QUE-1 emit these events; this feature only defines and
  consumes the contract.
- Front-end socket clients, reconnection UX and the screens that consume the events.
- Presence, "who is online" indicators and admin socket inspection.
- Metrics, tracing and OpenTelemetry.
- Kubernetes manifests, autoscaling policy and multi-region Redis.

## Dependencies & Risks

- **Dependencies**:
  - BP-001 monorepo and local environment (archived) — supplies the workspace, lint, typecheck and CI.
  - BP-003 API skeleton and CI (archived) — the patterns this service mirrors.
  - BP-004 authentication (archived) — the access token this service validates.
  - BP-045 shared package (archived) — where the event contract is published from.
  - `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@socket.io/redis-adapter`,
    `ioredis`, `@nestjs/mongoose`, `mongoose`, `helmet`, `zod`.
  - The `redis` and `mongo` services already declared in `docker-compose.yml`.
- **Risks**:
  - RISK-001: CON-101 pins the workspace to exactly three packages, while `overview.md` plans
    `realtime-service`. Mitigation: record the deviation here; the owner amends CON-101 or decides
    the service lives elsewhere at Gate 1.
  - RISK-002: The four events have no producers until APP-1 and QUE-1 exist, so the contract can drift
    unnoticed. Mitigation: the schema lives in `packages/shared` and a producer-side contract test
    imports it (`AC-014`).
  - RISK-003: No `socket.io` or `mongoose` skill is installed, so implementation patterns would be
    invented. Mitigation: install approved skills before `/sdrive:apply`, or record "no external
    research available" in the plan.
  - RISK-004: Sharing `JWT_ACCESS_SECRET` widens the blast radius of a key leak to the whole platform.
    Mitigation: the secret stays environment-only (`NFR-017`) and is never logged.
  - RISK-005: At-most-once delivery loses events during a Redis outage. Mitigation: documented in
    EC-003 and covered by consumer-side refetch after reconnect.
