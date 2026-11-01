---
title: Execution Tasks — API Skeleton and CI (v1)
status: draft
created: 2026-11-01
updated: 2026-11-01
feature: api-skeleton-and-ci
version: 1
---

# Execution Tasks — API Skeleton and CI (v1)

**Feature:** `api-skeleton-and-ci` · **Version:** v1
**Branch:** `feature/bp-002-bp-003-bp-006-bp-031` (shared with BP-002, BP-006, BP-031)

No task here writes a test. Acceptance-criterion tests belong to `/sdrive:test`, which fills the
`TEST-###` ids in `traceability.json`.

## P1 — Structured logging

| ID   | Task                                                                                                                                                                                           | Requirements                    | Acceptance criteria    | Done? |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------- | ----- |
| T1.1 | Create `logging.config.ts` (`REDACT_PATHS`, `resolveLogLevel`, `genReqId`, `customLogLevel`) and `logging.module.ts` (`LoggerModule.forRoot`, silent under `NODE_ENV=test`).                   | FR-001, FR-003, FR-004          | AC-001, AC-003, AC-004 | [ ]   |
| T1.2 | Import `LoggingModule` first in `app.module.ts`; create the app with `bufferLogs` and `app.useLogger` in `main.ts`, leaving helmet, CORS, `ValidationPipe` and Swagger in their current order. | FR-001, FR-002, FR-009, NFR-004 | AC-001, AC-002, AC-010 | [ ]   |
| T1.3 | Add `requestId` to the `HttpExceptionFilter` body without changing `statusCode` or `message`.                                                                                                  | FR-002, FR-008                  | AC-002, AC-009         | [ ]   |
| T1.4 | Add `nestjs-pino` and `pino-http`, add `pino-pretty` as a devDependency, refresh the lockfile, and document `LOG_LEVEL` in `server/.env.example`.                                              | FR-004                          | AC-004                 | [ ]   |

## P2 — CI pipeline

| ID   | Task                                                                                                                       | Requirements | Acceptance criteria | Done? |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------- | ----- |
| T2.1 | Add `pnpm --filter server exec prisma generate` between install and typecheck, with a comment saying why the step exists.  | FR-005       | AC-005, AC-006      | [ ]   |
| T2.2 | Add `pnpm audit --prod --audit-level=high` and a gitleaks secret scan, both failing the job on a high or critical finding. | FR-006       | AC-007              | [ ]   |

## P3 — Documentation and verification

| ID   | Task                                                                                                                                                                                      | Requirements     | Acceptance criteria | Done? |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------- | ----- |
| T3.1 | Record the logging contract in `CONTRIBUTING.md`: where the redact list lives, how to add a field, `LOG_LEVEL` is the only knob, logging is silent in tests.                              | NFR-004          | —                   | [ ]   |
| T3.2 | Measure p95 on the health endpoint before and after the change (NFR-001), and record both figures plus the CI run outcome and duration in the implementation report.                      | NFR-001, NFR-003 | AC-001, AC-005      | [ ]   |
| T3.3 | Run `pnpm lint`, `pnpm typecheck`, `prettier --check` on the changed files, `sdrive verify api-skeleton-and-ci` and `node .sdrive/scripts/validate-governance.js`; record the exit codes. | NFR-004          | —                   | [ ]   |
