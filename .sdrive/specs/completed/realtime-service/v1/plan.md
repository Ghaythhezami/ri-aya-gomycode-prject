---
title: Realtime service - Technical Plan
status: backlog
version: v1
feature: realtime-service
productItems: [BP-031]
branch: feature/realtime-service
created: 2026-11-04
updated: 2026-11-04
---

# Realtime service (BP-031) - Technical Plan

## 1. Architecture

### 1.1 Approach

`realtime/` is a fourth pnpm workspace package: a headless NestJS service that owns one job in
this version - **authenticated, tenant-scoped fan-out delivery**. It does not own a screen, a
collection, or a domain rule.

The three responsibilities are deliberately separable:

1. **Admission** - the handshake verifies the access token `server` already issues, derives the
   connection's scope from its claims, and joins the room. No scope is ever read from a message.
2. **Transport** - the Socket.IO server with the Redis adapter, so a publish on any instance
   reaches clients on every instance.
3. **Relay** - one Redis subscription on `riaya:events`, one schema validation, one emit into
   `clinic:<id>`.

Everything the service knows about an event lives in `packages/shared`. Nothing in `realtime/src`
declares an event shape, and nothing there imports from `server/src` (CON-106, NFR-004).

**What this is not.** There is no persistence, no replay, no presence, no deduplication, and no
chat. Delivery is at-most-once (`EC-003`, `EC-005`). A client that is disconnected for a minute
misses that minute and refetches on reconnect. That contract has to be visible to RT-2/RT-3 now,
because it is much cheaper to design for than to retrofit.

### 1.2 Package and process shape

| Concern                 | Decision                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace               | add `realtime` to `pnpm-workspace.yaml` next to `web`, `server`, `backoffice`                                                                                                                                                                           |
| HTTP + sockets          | one Express process, one port (`REALTIME_PORT`, default `4001`): Socket.IO on `/socket.io`, health on `/health/*`                                                                                                                                       |
| Build/lint/test scripts | mirror `server` (`nest build`, `eslint --max-warnings=0`, `tsc --noEmit`, `jest --runInBand`) so `pnpm -r` in CI needs no new workflow                                                                                                                  |
| Tests                   | colocated `*.spec.ts` under `realtime/src`, matching CON-403's shape for `server`                                                                                                                                                                       |
| Logging                 | `nestjs-pino`, same record shape and redact list as `server`, **copied** into `realtime/src/logging` - a cross-app import would violate CON-106 or force the config into `packages/shared`, which the summarised-contract rule (NFR-004) does not cover |
| Root `dev` script       | left unchanged; add `dev:realtime` only, so `pnpm dev` still works without Redis and Mongo running                                                                                                                                                      |

The Nest application uses the Express adapter because Socket.IO attaches to the same HTTP server
and the health probes need real routes. `@nestjs/platform-socket.io` + `@nestjs/platform-express`
are both required dependencies.

### 1.3 Connection lifecycle

```
client connects
  -> allowRequest(ip)            per-IP connect-attempt counter (NFR-013)
  -> token extraction            handshake.auth.token, else Authorization: Bearer
  -> verify(JWT_ACCESS_SECRET)   signature + exp; any failure -> one generic reason
  -> validate claims             sub, clinic_id, role (zod, unknown keys rejected)
  -> connection accepted
       socket.data = { userId, clinicId, role, exp }
       join user:<userId>
       join clinic:<clinicId>
       arm expiry timer at exp (clamped)
  -> disconnect: clear timer, leave rooms
```

Details that are easy to get wrong, and therefore part of the plan:

- **Rejection happens before `join`.** A rejected connection must never hold a membership.
- **One refusal reason.** Expired, malformed, and wrong-signature are indistinguishable to the
  client (`AC-002`).
- **`socket.data` is the only scope source.** A `room:join` handler accepts a room only when it
  equals one derived from `socket.data`, and refuses everything else without adding membership
  (`FR-005`, `AC-004`). Own-room re-join is a no-op (`EC-008`).
- **Expiry timer is clamped.** `setTimeout` above 2^31-1 ms fires immediately; the delay is capped
  and re-armed rather than passed through.

### 1.4 Redis: three clients, not two

The adapter and the relay need different Redis connections and must not share one:

| Client   | Mode       | Purpose                                                              |
| -------- | ---------- | -------------------------------------------------------------------- |
| `pub`    | normal     | adapter publishes, and is not in subscriber mode                     |
| `sub`    | subscriber | adapter's own pattern subscriptions, created as a duplicate of `pub` |
| `events` | subscriber | `SUBSCRIBE riaya:events` for the relay                               |

A connection in subscriber mode cannot issue normal commands, which is why the third client
exists. This is the single most common way to break a Socket.IO + pub/sub service, so it is
written down rather than left to the implementation.

`riaya:events` and the adapter's channels do not collide: the adapter publishes under its own
prefix (`socket.io#<namespace>#`). The relay therefore sees only domain events, not adapter
traffic.

**Startup with Redis down.** The clients are created with `lazyConnect` and a retry strategy
inherited from `server/src/cache/redis-cache.service.ts` (`retryStrategy` capped at 5 s,
`maxRetriesPerRequest: null` on the subscribers so a reconnect does not surface as a command
error). The HTTP server and connections are accepted regardless; readiness reports `degraded`
until the adapter reconnects (`FR-007`, `AC-009`, `AC-010`, `EC-010`).

**Adapter and relay do not depend on each other's channel**, so a relay at-most-once loss during an
outage is a delivery gap, not a startup failure.

### 1.5 Event contract and relay

The contract lives in `packages/shared/src/schemas/realtime.ts` and follows the `zod` skill
already in `.sdrive/skills/` (one schema per contract, `z.infer`, no side effects, re-exported
from `src/index.ts`).

```ts
// envelope, shared by every event
{
  event: 'appointment.created' | 'appointment.cancelled'
       | 'appointment.rescheduled' | 'queue.updated',
  contractVersion: 1,          // z.literal(1): a producer bump must be a deliberate change
  clinicId: string,            // branded with the same shape the token carries
  occurredAt: string,          // ISO 8601, validated not just typed
  payload: <event-specific, strict>
}
```

`contractVersion` is a `z.literal(1)` rather than a number. A producer that bumps to 2 should fail
validation loudly at the relay, not be accepted silently as "close enough" (`AC-012`).

Payload shapes are the **v1 minimum** for the consumers named in the spec - the queue display and
the schedule board:

| Event                     | Payload fields                                                       |
| ------------------------- | -------------------------------------------------------------------- |
| `appointment.created`     | `appointmentId`, `doctorId`, `startsAt`, `durationMinutes`, `status` |
| `appointment.cancelled`   | `appointmentId`, `cancelledAt`, `reason?`                            |
| `appointment.rescheduled` | `appointmentId`, `fromStartsAt`, `toStartsAt`, `durationMinutes`     |
| `queue.updated`           | `date`, `waiting`, `inProgress`, `completed`                         |

These are declared here, in `packages/shared`, so APP-1 and QUE-1 adopt them at _their_ Gate 1
instead of inventing a second shape (`RISK-002`). If those features need a field, they extend the
schema and bump `contractVersion`; the relay validates, it does not translate.

Relay steps, in order:

1. Receive a message on `riaya:events`.
2. `JSON.parse` - a parse failure is logged with the channel and dropped.
3. `realtimeEventSchema.safeParse` - a failure is logged with the channel and the **failing field
   path**, then dropped. Nothing throws out of the handler (`FR-009`, `AC-012`).
4. Resolve `clinic:<clinicId>` and check membership cluster-wide with
   `server.in(room).fetchSockets()`. Empty means the event is dropped and logged at debug
   (`AC-013`, `EC-006`).
5. `server.to(room).emit(envelope.event, envelope)` - the validated envelope goes out unchanged,
   under the event name it carried. No re-shaping, no re-serialisation into a different object
   (`AC-011`).

Step 4 costs one adapter round-trip per event. That is the honest price of a correct "no listeners"
log across instances: `adapter.rooms` only knows locally-connected sockets, so it would report an
empty room that another instance is serving. At v1 volume this is affordable; if it shows up in the
p95 budget (NFR-002), the fix is to sample the log rather than skip the drop (`RISK-007`).

`maxHttpBufferSize` is set to **16 KB**, so an oversized frame is rejected by the transport and
the connection stays open (`EC-007`).

### 1.6 Health

Two probes, deliberately different from `server`'s single `/health`:

| Route               | Semantics                                                          |
| ------------------- | ------------------------------------------------------------------ |
| `GET /health/live`  | process is up; always `200`, no dependency is consulted (`AC-015`) |
| `GET /health/ready` | reports Redis and Mongo **separately** (`FR-011`)                  |

The asymmetry is intentional and matches the acceptance criteria:

- **Redis down** -> `200` with `status: "degraded"` and `redis: "down"`. Sockets still work on
  this instance and the adapter self-heals, so failing readiness would take a working pod out of
  rotation during a transient blip (`AC-009`).
- **Mongo down** -> `503` with `status: "degraded"`, `mongo: "down"`. There is no collection in
  v1, so sockets keep working while readiness fails (`AC-016`, `EC-004`). This is a deliberate
  choice, not an oversight: an unreachable Mongo is a configuration error that should be visible
  to a deploy, whereas a Redis reconnect is routine.

Both probes are excluded from any throttling and need no authentication.

### 1.7 Components

`create` = does not exist. `modify` = exists, needs changes. `reuse` = satisfies the requirement
unchanged.

| Component              | Action | Path                                                      | Notes                                                                           |
| ---------------------- | ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `workspace-manifest`   | modify | `pnpm-workspace.yaml`                                     | add `realtime` to `packages`                                                    |
| `realtime-package`     | create | `realtime/package.json`                                   | scripts mirror `server`; `@riaya/shared: workspace:*`                           |
| `realtime-tsconfig`    | create | `realtime/tsconfig.json`, `tsconfig.build.json`           | `strict`, `noUnusedLocals`, same target as `server`                             |
| `realtime-eslint`      | create | `realtime/eslint.config.mjs`                              | flat config, `--max-warnings=0` (CON-205)                                       |
| `realtime-jest`        | create | `realtime/jest.config.cjs`                                | `rootDir: src`, `testRegex: .*\.spec\.ts$` (CON-403)                            |
| `realtime-bootstrap`   | create | `realtime/src/main.ts`                                    | Express adapter, Helmet, pino, `enableShutdownHooks`                            |
| `realtime-app-module`  | create | `realtime/src/app.module.ts`                              | module graph, config first                                                      |
| `realtime-config`      | create | `realtime/src/config/`                                    | typed env read + validation, no defaults that work in production                |
| `realtime-logging`     | create | `realtime/src/logging/`                                   | pino config copied from `server`, redact list extended with `token`, `clinicId` |
| `socket-auth`          | create | `realtime/src/auth/`                                      | token extraction + verification + claim validation                              |
| `socket-gateway`       | create | `realtime/src/realtime/realtime.gateway.ts`               | connection binding, join guard, expiry timer                                    |
| `connect-throttle`     | create | `realtime/src/realtime/connect-throttle.ts`               | per-IP `allowRequest` counter                                                   |
| `redis-adapter`        | create | `realtime/src/redis/redis-clients.ts`, `redis-adapter.ts` | three clients; adapter wiring; reconnect reporting                              |
| `event-relay`          | create | `realtime/src/relay/event-relay.service.ts`               | subscribe, validate, emit, drop-and-log                                         |
| `health-controller`    | create | `realtime/src/health/`                                    | `/health/live`, `/health/ready`                                                 |
| `mongo-connection`     | create | `realtime/src/database/mongo.module.ts`                   | `MongooseModule.forRootAsync`, no `forFeature`                                  |
| `event-contract`       | create | `packages/shared/src/schemas/realtime.ts`                 | envelope + four events                                                          |
| `shared-index`         | modify | `packages/shared/src/index.ts`                            | re-export the realtime schema module                                            |
| `realtime-env-example` | create | `realtime/.env.example`                                   | every new key, no working production default                                    |
| `realtime-dockerfile`  | create | `realtime/Dockerfile`                                     | multi-stage, builds in CI                                                       |
| `compose-service`      | modify | `docker-compose.yml`                                      | add `realtime`, depends on `redis` + `mongo` health                             |
| `root-scripts`         | modify | `package.json`                                            | add `dev:realtime`; leave `dev` alone                                           |

`server/src/health`, `server/src/cache/redis-cache.service.ts` and `server/src/logging` are
**read as prior art, never imported** (CON-106). That is why the plan lists `create` rather than
`reuse + modify` for the logging and health components.

## 2. Data model

Nothing is persisted (`NFR-003`). The only data artefact is the wire contract, which is modelled
here because the traceability matrix needs a named entity and because its shape is the thing
every producer must match.

**Entity `RealtimeEvent` - `action: create`, not persisted.** Lives in `packages/shared` as a Zod
schema plus its inferred TypeScript type:

| Field             | Type               | Rule                                                       |
| ----------------- | ------------------ | ---------------------------------------------------------- |
| `event`           | enum of four names | strict; an unknown name fails validation                   |
| `contractVersion` | `1`                | literal; bumping is a deliberate contract change           |
| `clinicId`        | string             | required; the room is derived from it, never from a client |
| `occurredAt`      | ISO 8601 string    | validated as a date, not a free string                     |
| `payload`         | per-event object   | strict objects; unknown fields rejected (CON-515)          |

**Entity `MongoConnection` - `action: no_change`.** The connection exists; no collection does.
`readyState` is read for readiness only.

`flowDescription`: a producer publishes one message to `riaya:events`;
the relay validates it against the shared schema and emits it under the same event name to
`clinic:<clinicId>`; every socket already joined to that room receives it once (`AC-008`,
`AC-011`). No step reads or writes a database.

## 3. API contracts

| Method | Path            | Action | Auth | Requirements                 |
| ------ | --------------- | ------ | ---- | ---------------------------- |
| `GET`  | `/health/live`  | create | no   | `FR-011`, `AC-015`           |
| `GET`  | `/health/ready` | create | no   | `FR-011`, `AC-016`, `AC-009` |

The Socket.IO surface (`/socket.io`) is not REST and has no entry above: its "authentication" is
the handshake in §1.3, and its only client-callable handler is the constrained `room:join` from
`FR-005`. Registering any other client-emitted handler is a scope-widening change and needs a new
version of this spec.

## 4. Security baseline expansion

Every `REQUIRED` control in `.sdrive/constitution.md` §5 is expanded below. `CON-518` is not, and
the rationale is recorded in `spec.md` under **Security Baseline**:

| Control | Requirement | Implementation                                                                                  | Task           |
| ------- | ----------- | ----------------------------------------------------------------------------------------------- | -------------- |
| CON-511 | `NFR-010`   | handshake verifies access token; refresh token rejected                                         | `T3.1`, `T3.2` |
| CON-512 | `NFR-011`   | rooms derived from claims; `room:join` allow-list                                               | `T3.4`, `T3.5` |
| CON-513 | `NFR-012`   | `helmet()` on the HTTP surface                                                                  | `T7.1`         |
| CON-514 | `NFR-013`   | per-IP connect-attempt throttle via `allowRequest`                                              | `T7.2`         |
| CON-515 | `NFR-014`   | zod validation of claims **and** every relayed payload, unknown keys rejected                   | `T3.3`, `T4.4` |
| CON-516 | `NFR-015`   | no raw Mongo access; no collection exists to query                                              | `T7.4`         |
| CON-517 | `NFR-016`   | payloads transported as data; no HTML construction anywhere                                     | `T4.4`         |
| CON-518 | -           | **NOT APPLICABLE** - bearer token in handshake, no ambient cookie; only idempotent `GET` routes | -              |
| CON-519 | `NFR-017`   | env-only secrets; `token`/`clinicId` added to the redact list                                   | `T2.2`, `T7.5` |
| CON-520 | `NFR-018`   | Helmet HSTS enabled outside local development                                                   | `T7.1`         |

The connect throttle is a fixed-window counter in Redis keyed by IP, with a process-local fallback
when Redis is unavailable. Failure mode is **closed for the connection it is limiting**: an
unparseable or over-limit attempt is refused, and a Redis error falls back to the local counter
rather than opening the door. It is not allowed to throw out of `allowRequest`, which would take
the whole server down for one bad client.

## 5. Performance

`NFR-002` (p95 publish-to-delivery <= 500 ms at 200 connections on one instance) is met by
construction rather than by tuning: the relay does no I/O beyond one Redis message and one
cluster-wide room check, and no payload is transformed. The two costs worth naming are the
`fetchSockets()` call in step 4 of §1.5 and the JSON round-trip, both of which stay well under the
budget at 200 connections but are the first things to measure if the number is ever missed.

No metric, trace, or OpenTelemetry instrumentation is added - that is out of scope in the spec, and
`/sdrive:performance` is where a real measurement belongs.

## 6. Dependencies

Versions are the Nest 11-compatible lines confirmed against the registry; the two majors that
would break DI here are `@nestjs/websockets` and `@nestjs/mongoose` at 12.x.

| Package                                                                                                                                                                                                                                | Type     | Action    | Notes                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------------------------- |
| `socket.io`                                                                                                                                                                                                                            | library  | add       | `^4.8.4`; skill: socket.io                                    |
| `@nestjs/websockets`                                                                                                                                                                                                                   | library  | add       | `^11.2.8`; Nest 11 peer, do not take 12.x                     |
| `@nestjs/platform-socket.io`                                                                                                                                                                                                           | library  | add       | `^11.2.8`                                                     |
| `@nestjs/platform-express`                                                                                                                                                                                                             | library  | add       | health routes on the same HTTP server                         |
| `@socket.io/redis-adapter`                                                                                                                                                                                                             | library  | add       | `^8.3.0`                                                      |
| `ioredis`                                                                                                                                                                                                                              | library  | add       | `^5.8.1`, same range as `server`                              |
| `@nestjs/mongoose`                                                                                                                                                                                                                     | library  | add       | `^11.0.4`; skill: mongoose                                    |
| `mongoose`                                                                                                                                                                                                                             | library  | add       | `^8.24.8`; peer also allows 9, 8 chosen deliberately          |
| `@nestjs/config`                                                                                                                                                                                                                       | library  | add       | same as `server`                                              |
| `@nestjs/jwt`                                                                                                                                                                                                                          | library  | add       | verify the existing token with the same lib `server` signs it |
| `helmet`                                                                                                                                                                                                                               | library  | add       | CON-513, CON-520                                              |
| `nestjs-pino`, `pino-http`                                                                                                                                                                                                             | library  | add       | same pipeline as `server`                                     |
| `@riaya/shared`                                                                                                                                                                                                                        | internal | add       | `workspace:*`; the event contract                             |
| `zod`                                                                                                                                                                                                                                  | library  | no_change | already pinned workspace-wide at `^4.6.7`                     |
| `socket.io-client`                                                                                                                                                                                                                     | library  | add       | dev-only; colocated specs, never imported by production code  |
| `jest`, `ts-jest`, `@types/jest`, `typescript`, `eslint`, `typescript-eslint`, `@eslint/js`, `globals`, `eslint-config-prettier`, `@nestjs/cli`, `@nestjs/testing`, `@types/node`, `reflect-metadata`, `rxjs`, `dotenv`, `pino-pretty` | library  | add       | same set `server` uses, same ranges where it has one          |

`ioredis` is deliberately **not** bumped to 6.x: `@socket.io/redis-adapter@8` is written against
the 5.x API and a second ioredis major in the tree is a runtime hazard with no benefit here.

## 7. Existing asset check (anti-redundancy)

| Found                                                                                   | Decision                                                                                  |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/shared` exists with three schema modules and a single entry point             | `modify` - add `schemas/realtime.ts` and one export line                                  |
| `docker-compose.yml` already declares `redis` and `mongo` with healthchecks             | `reuse` those services; `modify` only to add the `realtime` service                       |
| `server/src/logging` already has the pino config, redact list and level resolution      | **not reusable across apps** (CON-106) - copy the conventions into `realtime/src/logging` |
| `server/src/health` has one `/health` returning a combined status                       | shape does not meet `FR-011` (live vs ready); `create` a separate controller              |
| `server/src/cache/redis-cache.service.ts` already encodes the ioredis reconnect pattern | read as prior art; `create` the client factory in `realtime`, do not import               |
| `server/src/auth/jwt.strategy.ts` already defines the claim names and secret            | read it; the claim names are `sub`, `clinic_id`, `role`. No second scheme is written      |
| root `package.json` runs `pnpm -r` for lint/typecheck/test/build                        | `reuse` - a new workspace package is picked up automatically; only the lockfile changes   |
| `.env.example` exists per package (`web`, `server`, `backoffice`)                       | `create` `realtime/.env.example` in the same pattern                                      |
| `socket.io`, `mongoose`, `@socket.io/redis-adapter`                                     | absent everywhere - all `create`                                                          |
| `realtime/`                                                                             | absent - `create`                                                                         |

## 8. Decisions and open items

1. **CON-101 (needs the owner).** The constitution pins the workspace to exactly `web`, `server`
   and `backoffice`; this plan adds a fourth package. Gate 1 recorded the deviation as
   `RISK-001`/assumption 1 and was approved on that basis, so the work proceeds. What is still
   open is _how_ it is recorded: amend CON-101, or keep an accepted exception. Nothing in this
   plan changes either way - the amendment is an owner edit to `.sdrive/constitution.md`, not a
   code change, and this feature does not touch the constitution.
2. **No membership re-verification on the socket.** `server`'s strategy re-reads the user and the
   membership on every request. `realtime` cannot: it has no Postgres client and must not import
   `server` (CON-106). A revoked membership therefore keeps an already-open socket until that
   token expires - at most 15 minutes - and `AC-007` disconnects it at that moment. Recorded as
   `RISK-006`; closing it needs a revocation feed, which is not in this version.
3. **Payload fields are a v1 minimum.** See §1.5. APP-1 and QUE-1 reconcile at their own Gate 1;
   the schema is theirs to extend with a `contractVersion` bump.
4. **Root `dev` script is not extended.** Starting realtime inside `pnpm dev` would make the
   existing three-app workflow fail on a machine without Redis and Mongo. `dev:realtime` is
   explicit instead.
5. **Skills.** `.sdrive/skills/socket.io` and `.sdrive/skills/mongoose` were written in this run
   and are marked `verified: false` - no upstream skill repository was fetched and the official
   documentation could not be retrieved, so both files state project rules and defer API detail to
   the vendors' docs. This is `RISK-003`; `/sdrive:apply` may still install the packages, but a
   behaviour question should be answered from the official documentation rather than from those
   files.

## 9. Risks

| ID         | Risk                                                                    | Mitigation                                                                                                |
| ---------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `RISK-001` | CON-101 pins three packages; this adds a fourth                         | recorded at Gate 1; owner amends the constitution or accepts the exception (§8.1)                         |
| `RISK-002` | The four events have no producers until APP-1/QUE-1                     | contract lives in `packages/shared`; producers import it; `AC-014` asserts the shared import              |
| `RISK-003` | No verified `socket.io`/`mongoose` skill                                | both skills written and flagged unverified; official docs are the authority (§8.5)                        |
| `RISK-004` | Sharing `JWT_ACCESS_SECRET` widens the blast radius of a leak           | env-only, never logged, `token`/`clinicId` added to the redact list (`T7.5`)                              |
| `RISK-005` | At-most-once delivery loses events during a Redis outage                | documented (`EC-003`); consumers refetch state on reconnect                                               |
| `RISK-006` | A revoked membership keeps a live socket until token expiry             | bounded by the 15-minute token and the expiry disconnect (`AC-007`); a revocation feed is a later version |
| `RISK-007` | `fetchSockets()` per event costs an adapter round-trip                  | measured against `NFR-002`; if it bites, sample the drop log rather than skip the check                   |
| `RISK-008` | A second Nest major (`@nestjs/*` 12.x) resolved into the tree breaks DI | every Nest package pinned to its 11.x line and listed in §6                                               |
