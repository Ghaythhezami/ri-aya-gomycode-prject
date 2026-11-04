---
title: Realtime service - Tasks
status: backlog
version: v1
feature: realtime-service
branch: feature/realtime-service
created: 2026-11-04
updated: 2026-11-04
---

# Tasks - Realtime service (BP-031)

Production code only. Test authoring and execution belong to `/sdrive:test`.

Requirement links are in parentheses at the end of each task and mirror `traceability.json`.
Acceptance criteria are linked there, not here, so this list does not drift from the matrix.

## P1 - Workspace and package skeleton

- [ ] T1.1 - Add `realtime` to the `packages` list in `pnpm-workspace.yaml`, keeping `packages/*` and every existing entry untouched. (FR-001)
- [ ] T1.2 - Create `realtime/package.json` with `start`, `start:dev`, `start:prod`, `build`, `lint` (`--max-warnings=0`), `typecheck` and `test` scripts mirroring `server`, and declare the dependencies from `plan.md` §6 at the pinned ranges. (FR-001, NFR-007)
- [ ] T1.3 - Create `realtime/tsconfig.json` and `tsconfig.build.json` with `strict`, `noUnusedLocals`, `noUnusedParameters` and the same module settings `server` uses. (FR-001, NFR-005)
- [ ] T1.4 - Create `realtime/nest-cli.json` and the flat `realtime/eslint.config.mjs` matching `server`'s rules, so lint fails on a warning rather than reporting it. (FR-001, NFR-005)
- [ ] T1.5 - Create `realtime/jest.config.cjs` with `rootDir: 'src'` and `testRegex: '.*\\.spec\\.ts$'`, matching CON-403. (FR-001)
- [ ] T1.6 - Create `realtime/.env.example` documenting `REALTIME_PORT`, `JWT_ACCESS_SECRET`, `REDIS_URL`, `MONGO_URI`, `REALTIME_CORS_ORIGINS`, `LOG_LEVEL` and `NODE_ENV`, with no value that works as a production default. (NFR-008, NFR-017)
- [ ] T1.7 - Create `realtime/Dockerfile` as a multi-stage pnpm workspace build that produces a runnable image without the dev dependencies. (NFR-007)

## P2 - Application shell, configuration and health

- [ ] T2.1 - Create `realtime/src/main.ts`: Nest with the Express adapter, `helmet()`, the pino logger, `enableShutdownHooks()`, listening on `REALTIME_PORT` (default `4001`) with no global path prefix, so `/health/live` is reachable as written. (FR-002, NFR-012, NFR-018)
- [ ] T2.2 - Create `realtime/src/config/` reading and validating every environment variable at boot, failing with the variable's name when a required one is missing, and never logging a value. (NFR-008, NFR-017)
- [ ] T2.3 - Create `realtime/src/logging/` with the same pino record shape, level resolution and redact list as `server`, copied rather than imported (CON-106), extended with `token`, `accessToken` and `clinicId`. (NFR-006, NFR-017)
- [ ] T2.4 - Create `realtime/src/app.module.ts` wiring config, logging, mongo, redis, auth, gateway, relay and health in an order where the logger exists before any module that logs during construction. (FR-001)
- [ ] T2.5 - Create `realtime/src/health/` with `GET /health/live` (200, no dependency consulted) and `GET /health/ready` (per-dependency status for Redis and Mongo; 503 only when Mongo is down). (FR-011, AC-015, AC-016)
- [ ] T2.6 - On `SIGTERM`, stop accepting connections, close the Socket.IO server, quit the three Redis clients and exit inside the shutdown timeout. (NFR-007)

## P3 - Authentication and tenancy binding

- [ ] T3.1 - Extract the access token from the handshake `auth.token` payload, falling back to an `Authorization: Bearer` header, and treat both as untrusted input (bounded length, string only). (FR-003, NFR-010)
- [ ] T3.2 - Verify the token with `JWT_ACCESS_SECRET` using the same library and algorithm family `server` signs with, enforcing `exp`, and refuse with one generic `UNAUTHORIZED` reason for every failure mode. (FR-003, NFR-010, AC-001, AC-002)
- [ ] T3.3 - Validate the verified claims with a strict zod schema requiring `sub`, `clinic_id` and `role`, rejecting unknown or absent keys, and refuse the connection when they are missing. (NFR-014)
- [ ] T3.4 - On acceptance, write `{ userId, clinicId, role, exp }` to `socket.data` and join `user:<userId>` and `clinic:<clinicId>` server-side with no client involvement. (FR-004, AC-003, AC-006)
- [ ] T3.5 - Register a `room:join` handler that accepts only rooms derived from `socket.data`, refuses every other room without adding membership, and treats an own-room re-join as a no-op. (FR-005, NFR-011, AC-004, EC-008)
- [ ] T3.6 - Arm a clamped timer at the token's `exp` that disconnects the socket at expiry, and clear it on disconnect. (AC-007, EC-002)

## P4 - Redis adapter and relay

- [ ] T4.1 - Create the three-client factory: a normal `pub` client, a duplicated `sub` client in subscriber mode, and a separate `events` subscriber, all `lazyConnect` with a capped retry strategy and no command error on reconnect. (FR-006)
- [ ] T4.2 - Wire `@socket.io/redis-adapter` with the `pub`/`sub` pair so a publish from any instance reaches clients on every instance. (FR-006, AC-008)
- [ ] T4.3 - Start and accept connections while Redis is unreachable, expose the adapter/Redis state to the readiness probe, and resume relaying when the adapter reconnects without a restart. (FR-007, FR-011, AC-009, AC-010, EC-010)
- [ ] T4.4 - Create `realtime/src/relay/event-relay.service.ts` subscribing to `riaya:events`: parse, validate against the shared schema, then emit the unchanged envelope under its own event name to `clinic:<clinicId>`. (FR-008, FR-009, NFR-016, AC-011)
- [ ] T4.5 - On a parse or validation failure, drop the event and log a warning naming the channel and the failing field path, without throwing out of the handler. (FR-009, AC-012)
- [ ] T4.6 - When a valid event names a clinic with no connected sockets - checked cluster-wide, not just locally - drop it and log at debug. (FR-008, AC-013, EC-006)
- [ ] T4.7 - Set `maxHttpBufferSize` to 16 KB so an oversized frame is rejected without closing the connection. (EC-007)

## P5 - Shared event contract

- [ ] T5.1 - Create `packages/shared/src/schemas/realtime.ts` with the `RealtimeEvent` envelope (`event`, `contractVersion: 1`, `clinicId`, `occurredAt`, `payload`) and strict payload schemas for `appointment.created`, `appointment.cancelled`, `appointment.rescheduled` and `queue.updated`, following the `zod` skill's rules (no side effects, `z.infer`, one schema per contract). (FR-010, AC-014)
- [ ] T5.2 - Re-export the module from `packages/shared/src/index.ts` so consumers import from `@riaya/shared` and never from a deep path. (FR-010, NFR-004)
- [ ] T5.3 - Import the schema in the relay from `@riaya/shared` only, and assert in review that no event shape is re-declared under `realtime/src`. (FR-010, NFR-004)

## P6 - MongoDB connection

- [ ] T6.1 - Create `realtime/src/database/mongo.module.ts` with `MongooseModule.forRootAsync` reading `MONGO_URI`, `serverSelectionTimeoutMS` around 2 s, and no `forFeature`, `@Schema` or model anywhere in the package. (FR-012, NFR-003)
- [ ] T6.2 - Connect asynchronously so an unreachable Mongo does not block bootstrap, and report `readyState` in the readiness probe. (FR-011, AC-016, EC-004)

## P7 - Security hardening

- [ ] T7.1 - Apply Helmet to the HTTP surface with HSTS enabled outside local development. (NFR-012, NFR-018)
- [ ] T7.2 - Throttle connection attempts per IP through the Socket.IO `allowRequest` hook using a fixed-window Redis counter with a process-local fallback, refusing over-limit attempts and never throwing out of the hook. (NFR-013)
- [ ] T7.3 - Configure the Socket.IO CORS allow-list from `REALTIME_CORS_ORIGINS` with no wildcard and no cookie credentials. (FR-002, NFR-011)
- [ ] T7.4 - Confirm no collection is declared, no Mongoose model is registered and no raw Mongo command is issued; the only Mongo interaction in the package is the connection itself. (NFR-015, NFR-003)
- [ ] T7.5 - Extend the redact list with the handshake token, the access token and the clinic claim, and confirm a rejected handshake logs the reason without the credential. (NFR-017, NFR-006)

## P8 - Local environment and packaging

- [ ] T8.1 - Add a `realtime` service to `docker-compose.yml` that depends on the existing `redis` and `mongo` health checks and passes the variables from `realtime/.env.example`. (NFR-007)
- [ ] T8.2 - Add a `dev:realtime` script to the root `package.json` without changing the existing `dev` script. (NFR-007)

## P9 - Verification

- [ ] T9.1 - Run `pnpm --filter realtime lint` and resolve every finding without disabling a rule. (NFR-005)
- [ ] T9.2 - Run `pnpm --filter realtime typecheck` and resolve every error. (NFR-005)
- [ ] T9.3 - Run `pnpm format:check` and `node .sdrive/scripts/validate-governance.js`; both must pass. (NFR-005, FR-001)
- [ ] T9.4 - Run `pnpm sdrive verify realtime-service` and account for every reported gap. (FR-001)
- [ ] T9.5 - With two instances started against the compose Redis, confirm a single publish to one clinic room reaches a client on each instance once. (AC-008)
- [ ] T9.6 - With Redis stopped, confirm the service starts, `/health/live` returns 200 and `/health/ready` reports degraded naming Redis; then start Redis and confirm relay resumes without a restart. (AC-009, AC-010)
- [ ] T9.7 - With Mongo stopped, confirm `/health/ready` returns 503 naming Mongo while socket connections still work. (AC-016)
