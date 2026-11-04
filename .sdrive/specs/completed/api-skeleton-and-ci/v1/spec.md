---
title: Specification — API Skeleton and CI (v1)
status: draft
created: 2026-11-01
updated: 2026-11-01
feature: api-skeleton-and-ci
version: 1
product_items: [BP-003]
branch: feature/bp-002-bp-003-bp-006-bp-031
---

# Specification — API Skeleton and CI (v1)

**Feature:** `api-skeleton-and-ci` · **Version:** v1 · **Product item:** BP-003 (P0, wave W1)
**Branch:** `feature/bp-002-bp-003-bp-006-bp-031`

## 1. Overview

### Problem statement

The API shell is largely built — a global `ValidationPipe`, a global `HttpExceptionFilter`, the
Swagger document, the global `ConfigModule` and a throttler all exist and are wired in `main.ts` and
`app.module.ts`. Two gaps remain, and both stay invisible until something breaks:

1. **There is no structured logging.** `NestFactory.create(AppModule)` uses Nest's default console
   logger: unstructured text, no request correlation, no redaction of secrets. Searching this codebase
   for `pino` returns **zero** hits; the ten `Logger` usages are the framework default. When a request
   fails in production an operator cannot tell which log lines belong to it, and a careless
   `log.debug(req)` can print a bearer token into a sink that outlives the incident.
2. **CI has never passed.** `.github/workflows/ci.yml` runs install, lint, typecheck, test and build —
   the right five gates — but omits `prisma generate`, so on a clean checkout `@prisma/client` exports
   nothing and `pnpm typecheck` fails with _"Module '@prisma/client' has no exported member
   'PrismaClient'"_. Both historical `main` runs are red. A pipeline nobody has seen green is not a
   gate; it is a decoration.

### Proposed solution

Add structured JSON logging with `nestjs-pino`: one line per request carrying a generated request id,
the route, the status and the duration; the same id attached to every line written while handling it,
echoed in an `X-Request-Id` response header; and redaction of `Authorization`, `Cookie` and password
fields before anything is serialised. Call sites keep using Nest's `Logger`, so application code does
not learn a second logging interface.

Make CI honest: add the `prisma generate` step, and the two hardening steps the auth feature's security
report asked for — `pnpm audit --prod` and a secret scan. The acceptance criterion is not "the YAML
mentions the gates" but "a pull request runs it and the result can be read".

### Target audience

- **Operators on call**, who need one JSON line per request and a way to follow one failing request.
- **Every later feature**, which will log through this and would otherwise invent its own scheme.
- **Reviewers**, who currently take "lint and typecheck pass locally" on trust because no CI run has
  ever succeeded.

### Assumptions

- No log shipping or aggregation infrastructure exists or is in scope; logs go to stdout as JSON, which
  is what a container platform collects.
- `nestjs-pino` is the right choice because it is the Nest integration for `pino` and keeps the
  `Logger` interface at call sites. It is a new runtime dependency.
- The server test suite needs neither PostgreSQL nor Redis in CI: it runs against the in-memory Prisma
  double and the Redis-gated suite skips itself. If that is false, the workflow gains service
  containers in this feature rather than failing silently.
- Node 20 in CI, as `ci.yml` already declares.

### Out of scope

- Log aggregation, retention, shipping or dashboards (Loki, Datadog, ELK).
- Metrics and distributed tracing (OpenTelemetry). Correlation ids are not spans.
- Changing the exception body shape, the validation rules or any status code.
- GitHub branch-protection settings (a repository setting, not code).
- Rewriting call sites to a new logger API: existing `Logger` usage keeps working.

## 2. User stories and acceptance criteria

### US-001 — An operator can follow one request through the logs

As the engineer woken up by an alert, I want each request to be one structured record with an id I can
search on, so that I can reconstruct a failure without reading interleaved prose.

| AC     | Criterion                                                                                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-001 | Given a request to any API route, when it completes, then exactly one JSON object is written to stdout with `reqId`, `req.method`, `req.url`, `res.statusCode` and `responseTime`.                         |
| AC-002 | Given a request, when the handler logs through Nest's `Logger`, then those lines carry the same `reqId` as the request record, and the response carries a matching `X-Request-Id` header.                  |
| AC-003 | Given a request carrying an `Authorization` header, a `Cookie` header and a body with a `password`, when the request record and handler logs are written, then none of those values appears in the output. |
| AC-004 | Given `LOG_LEVEL` is set, when the server starts, then that level is honoured; with no value it defaults to `info`. A 5xx response logs at `error`, a 4xx at `warn`, everything else at `info`.            |

### US-002 — A broken change cannot merge

As a reviewer, I want the pipeline to run every gate on a pull request and fail loudly, so that "it
passes locally" stops being the only evidence.

| AC     | Criterion                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-005 | Given a clean checkout, when the CI workflow runs, then install, Prisma client generation, lint, typecheck, test and build all succeed and the run is green.                                                        |
| AC-006 | Given a clean checkout without a generated Prisma client, when `pnpm typecheck` runs, then it fails; the workflow must therefore generate the client before typechecking. The step is load-bearing, not ceremonial. |
| AC-007 | Given the workflow, when it runs, then a production dependency audit and a secret scan execute, and a high or critical finding fails the job.                                                                       |

### US-003 — The existing API contract is preserved

As the client applications, I want the validation and error behaviour I depend on to keep working while
the shell changes around it.

| AC     | Criterion                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-008 | Given a request body with an unknown property, when it is validated, then the API still returns 400 and rejects the request (`whitelist` + `forbidNonWhitelisted` unchanged).  |
| AC-009 | Given a thrown `HttpException`, when the exception filter handles it, then the response body keeps its existing `statusCode`/`message` shape and now also carries `requestId`. |
| AC-010 | Given Swagger is enabled, when the app starts, then `/api/docs` still serves the document and logging does not alter that route.                                               |

## 3. Functional requirements

- **FR-001:** The server MUST emit one structured JSON log record per HTTP request containing a request
  id, method, url, status code and duration. (AC-001)
- **FR-002:** The request id MUST be attached to every log line written while that request is handled,
  and MUST be returned in an `X-Request-Id` response header. (AC-002)
- **FR-003:** Log output MUST redact `authorization`, `cookie`, `set-cookie`, `password`, `passwordHash`
  and `token` values at any depth. (AC-003)
- **FR-004:** The log level MUST come from `LOG_LEVEL`, defaulting to `info`, and response severity MUST
  map 5xx to `error`, 4xx to `warn`, otherwise `info`. (AC-004)
- **FR-005:** The CI workflow MUST generate the Prisma client after install and before typecheck. (AC-005, AC-006)
- **FR-006:** The CI workflow MUST run a production dependency audit and a secret scan, failing on high
  or critical findings. (AC-007)
- **FR-007:** The global `ValidationPipe` MUST keep `whitelist`, `forbidNonWhitelisted` and `transform`
  enabled. (AC-008)
- **FR-008:** `HttpExceptionFilter` MUST keep its current response shape and add `requestId`. (AC-009)
- **FR-009:** Swagger MUST remain served at `/api/docs`. (AC-010)

## 4. Non-functional requirements

- **NFR-001:** Logging MUST NOT add more than 5 ms to p95 latency on a local run of the health endpoint,
  measured before and after. (AC-001)
- **NFR-002:** Each record MUST be valid JSON on one line — no multi-line pretty printing in any
  environment — so a collector parses it without a multi-line pattern.
- **NFR-003:** The CI job MUST finish in under 15 minutes on `ubuntu-latest`, so a pull request is not
  blocked by the pipeline's own duration. (AC-005)
- **NFR-004:** Adding logging MUST NOT require changing call sites: existing `Logger` calls keep
  compiling and working. (AC-002)

## 5. Edge cases

| EC     | Case                                       | Expected behaviour                                                                                                                                                      |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC-001 | `LOG_LEVEL` holds an unknown value         | Fall back to `info` and log one warning naming the invalid value; never crash on startup.                                                                               |
| EC-002 | A client sends its own `X-Request-Id`      | Accept it only if it is a safe token (bounded length, `A-Za-z0-9-_`); otherwise generate a new one. Never echo arbitrary client input into logs or headers unvalidated. |
| EC-003 | The health endpoint is polled every second | Still one record per request, at `info`; no per-request handler chatter. Volume is an operational concern, not a reason to skip the record.                             |
| EC-004 | Tests run                                  | Logging is silenced under `NODE_ENV=test` so 50 passing tests do not produce thousands of lines; the logging test opts back in.                                         |
| EC-005 | A log call receives a circular object      | Serialise safely, and never throw from a logging call — a failed log must not fail the request.                                                                         |

## 6. Security baseline

Read from `.sdrive/constitution.md` §Security Baseline (CON-51x). This feature touches request handling
and output, so most controls apply.

| Control                           | Status         | Note                                                                                                          |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| CON-511 Authentication            | NOT APPLICABLE | No credential or login path changes.                                                                          |
| CON-512 Authorization             | NOT APPLICABLE | No route or guard is added.                                                                                   |
| CON-513 Security Headers (Helmet) | **REQUIRED**   | Helmet stays mounted, and logging must not bypass or reorder it.                                              |
| CON-514 Rate Limiting             | NOT APPLICABLE | The throttler is unchanged.                                                                                   |
| CON-515 Input Validation          | **REQUIRED**   | The `ValidationPipe` config is preserved (FR-007), and the echoed `X-Request-Id` is validated first (EC-002). |
| CON-516 NoSQL / Injection         | **REQUIRED**   | Client-supplied ids and header values are never interpolated into queries or log format strings.              |
| CON-517 XSS                       | NOT APPLICABLE | No UI renders this data.                                                                                      |
| CON-518 CSRF                      | NOT APPLICABLE | No state-changing route is added.                                                                             |
| CON-519 Environment Security      | **REQUIRED**   | Secrets must not reach logs (FR-003); the CI secret scan guards the repository (FR-006).                      |
| CON-520 Dependency Security       | **REQUIRED**   | A new runtime dependency is added, so `pnpm audit --prod` becomes part of CI in this feature (FR-006).        |

## 7. Dependencies

| Name                      | Type                    | Notes                                                                                                |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `nestjs-pino`             | library (new)           | Nest integration for pino; provides `LoggerModule` and the `Logger` service. Added with `pino-http`. |
| `pino-pretty`             | library (dev, optional) | Human-readable output locally only; never required in CI.                                            |
| `@nestjs/common` `Logger` | internal                | Existing call sites keep this interface (NFR-004).                                                   |
| GitHub Actions            | infrastructure          | `pnpm/action-setup@v4`, `actions/setup-node@v4`, and the secret-scan action.                         |

## 8. Risks

| ID       | Risk                                                         | Mitigation                                                                                                            |
| -------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| RISK-001 | A new dependency brings a CVE into the runtime               | `pnpm audit --prod` runs in CI from this feature on (FR-006); the version is pinned in the lockfile.                  |
| RISK-002 | Redaction misses a nested field and a token reaches the sink | AC-003 asserts on nested paths, not only top-level headers, and the redact list is one constant reviewed in the diff. |
| RISK-003 | CI minutes balloon with the audit and scan steps             | NFR-003 caps the job at 15 minutes; the audit is `--prod` only and the scan is diff-scoped.                           |
| RISK-004 | Logging becomes a latency tax on every request               | NFR-001 measures p95 before and after; pino writes asynchronously.                                                    |
| RISK-005 | Tests get noisy and slow from per-request records            | EC-004 silences logging under `NODE_ENV=test`; the logging test opts back in.                                         |
