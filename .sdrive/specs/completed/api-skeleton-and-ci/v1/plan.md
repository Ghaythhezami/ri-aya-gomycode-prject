---
title: Technical Plan — API Skeleton and CI (v1)
status: draft
created: 2026-11-01
updated: 2026-11-01
feature: api-skeleton-and-ci
version: 1
---

# Technical Plan — API Skeleton and CI (v1)

## 1. Approach

Logging is added as one module, not sprinkled through the app. A `LoggingModule` wraps
`nestjs-pino`'s `LoggerModule` with a configuration this feature owns: the redact list, the level
resolution from `LOG_LEVEL`, the request-id generator and the status-to-severity mapping. `main.ts`
creates the app with `bufferLogs` and then uses that logger, so bootstrap output is structured and
**every existing Nest `Logger` call site inherits it without an edit** — which is exactly NFR-004.
The request id is generated in one place, validated when a client supplies one, echoed in
`X-Request-Id`, and attached to the request-scoped logger, so the exception filter reads it from the
request instead of inventing its own.

CI is fixed by adding the load-bearing `prisma generate` step and the two hardening steps the auth
security review asked for. The workflow is edited, not replaced.

## 2. Components

| Component                                            | Action | Purpose                                                                                                                                                |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/src/logging/logging.config.ts`               | create | `REDACT_PATHS`, `resolveLogLevel` (EC-001), `genReqId` with safe-token validation (EC-002), `customLogLevel` (5xx→error, 4xx→warn)                     |
| `server/src/logging/logging.module.ts`               | create | `LoggerModule.forRoot` over that config; silent under `NODE_ENV=test` (EC-004)                                                                         |
| `server/src/app.module.ts`                           | modify | Import `LoggingModule` first, so the logger exists before other modules initialise                                                                     |
| `server/src/main.ts`                                 | modify | `bufferLogs: true` + `app.useLogger(pinoLogger)`; helmet, cookie-parser, CORS, `ValidationPipe` and Swagger keep their order (CON-513, FR-007, FR-009) |
| `server/src/common/filters/http-exception.filter.ts` | modify | Add `requestId` to the body; `statusCode`/`message` unchanged (FR-008)                                                                                 |
| `server/package.json`                                | modify | `nestjs-pino`, `pino-http`; `pino-pretty` as a devDependency                                                                                           |
| `server/.env.example`                                | modify | Document `LOG_LEVEL` and its default                                                                                                                   |
| `.github/workflows/ci.yml`                           | modify | `prisma generate` before typecheck (FR-005); `pnpm audit --prod` and gitleaks (FR-006)                                                                 |
| `test/api-skeleton-and-ci/`                          | create | Filled by `/sdrive:test`, not by an implementation task                                                                                                |
| `CONTRIBUTING.md`                                    | modify | The logging contract: redact list location, how to add a field, `LOG_LEVEL` is the only knob                                                           |

## 3. Data model

No schema change and no migration. This feature changes request handling, not persistence.

Flow: request → `pino-http` assigns or validates the id → handler runs with it in scope → Nest
`Logger` writes JSON carrying it → response leaves with `X-Request-Id` → one record is emitted at
completion with status and duration.

## 4. API contract impact

None that a client can see, except one addition: `X-Request-Id` on every response, and `requestId`
inside the error body. Status codes, validation behaviour and the Swagger route are unchanged
(AC-008, AC-009, AC-010).

## 5. Security considerations

- **CON-519 / FR-003:** the redact list is one constant, reviewed in the diff, and covers nested paths
  so a token cannot reach the sink through object nesting.
- **CON-515 / EC-002:** a client-supplied `X-Request-Id` is validated as a bounded safe token before
  it is echoed or logged, so the header cannot be used to inject content into logs.
- **CON-520 / FR-006:** the new dependency is audited in CI from this feature on.
- Logging never throws and never blocks the response (EC-005).

## 6. Risks

| ID       | Risk                            | Mitigation                                                           |
| -------- | ------------------------------- | -------------------------------------------------------------------- |
| RISK-001 | New dependency brings a CVE     | `pnpm audit --prod` in CI; version pinned in the lockfile            |
| RISK-002 | Redaction misses a nested field | AC-003 asserts nested paths; one constant, reviewed                  |
| RISK-003 | CI duration balloons            | NFR-003 caps at 15 minutes; audit is `--prod`, scan is diff-scoped   |
| RISK-004 | Latency tax per request         | NFR-001 measures p95 before and after                                |
| RISK-005 | Noisy tests                     | EC-004 silences under `NODE_ENV=test`; the logging test opts back in |
