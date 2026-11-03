---
title: Execution Tasks — Database Schema and Migrations (v1)
status: backlog
created: 2026-10-31
updated: 2026-10-31
---

# Execution Tasks — Database Schema and Migrations (v1)

**Feature:** `database-schema-and-migrations` · **Version:** v1
**Branch:** `feature/bp-002-bp-003-bp-006-bp-031` (shared with BP-003, BP-006, BP-031)

No task here writes or runs a test. Acceptance-criterion tests belong to `/sdrive:test`, which fills
the `TEST-###` IDs in `traceability.json`.

## P1 — Schema and migration

| ID   | Task                                                                                                                                                                                                                                                                                          | Requirements                            | Acceptance criteria | Done? |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------- | ----- |
| T1.1 | Add `Patient`, `Doctor`, `Appointment` and the `AppointmentStatus` enum to `server/prisma/schema.prisma`, every table carrying `clinicId` with a FK to `Clinic`, plus `@@index([doctorId, startsAt])` and `@@index([patientId])` on `Appointment`. Leave the eight existing models untouched. | FR-001, FR-002, FR-003, FR-005, NFR-004 | AC-001, AC-005      | [x]   |
| T1.2 | Generate the migration with `prisma migrate dev --name clinical_core`, then **read the emitted `migration.sql`** and stop if it contains `DROP` or `TRUNCATE`. It must not modify `20261028235000_init_tenancy`.                                                                              | FR-004, NFR-002                         | AC-002, AC-003      | [x]   |
| T1.3 | Confirm both indexes appear in the emitted SQL and that a second `prisma migrate deploy` reports no pending migrations.                                                                                                                                                                       | FR-005, FR-004                          | AC-004, AC-005      | [x]   |
| T1.4 | Extend `server/src/database/memory-prisma.ts` with the same three models and their query surface, so the in-memory path the API tests use matches the schema.                                                                                                                                 | FR-001, FR-002, FR-003                  | AC-001              | [x]   |

## P2 — Seed

| ID   | Task                                                                                                                                                                                                                                         | Requirements            | Acceptance criteria    | Done? |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------- | ----- |
| T2.1 | Extend `server/src/database/seeds/seed.ts` with a deterministic generator (fixed seed, inline — no new package) and upserts that produce exactly 3 clinics, 10 doctors, 200 patients and 600 appointments, each clinic-scoped and fictional. | FR-006, FR-007, NFR-003 | AC-006, AC-007, AC-008 | [x]   |
| T2.2 | Guard the seed: read `DATABASE_URL` from the environment only, and refuse to run when `NODE_ENV=production`. Restate the CON-506 "local fixtures only" warning in the file header.                                                           | NFR-003, FR-007         | AC-008                 | [x]   |

## P3 — Documentation and verification

| ID   | Task                                                                                                                                                                                                           | Requirements              | Acceptance criteria                    | Done? |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------- | ----- |
| T3.1 | Write `server/prisma/ERD.md` with a Mermaid `erDiagram` covering `Patient`, `Doctor`, `Appointment` and their relations to `Clinic` and to each other, including the two indexes.                              | FR-008                    | AC-009                                 | [x]   |
| T3.2 | Record the manual evidence: run `prisma migrate deploy` twice (second run reports no pending migrations), run the seed twice (counts stay 3/10/200/600), and record both results in the implementation report. | NFR-001, NFR-002, NFR-003 | AC-002, AC-003, AC-004, AC-006, AC-007 | [x]   |
| T3.3 | Run the verification gates: `pnpm format:check` on the changed files, `pnpm lint`, `pnpm typecheck`, `sdrive verify database-schema-and-migrations`, and `node .sdrive/scripts/validate-governance.js`.        | —                         | —                                      | [x]   |
