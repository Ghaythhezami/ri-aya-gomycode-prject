# Test Report: Database Schema and Migrations (v1)

## 1. Summary

- **Date:** 2026-10-31
- **Feature:** database-schema-and-migrations
- **Version:** v1
- **Total ACs:** 9
- **Tested ACs:** 9
- **Coverage:** 100%
- **Tests Passed:** 14/14 (0 failed, 0 skipped)

## 2. How the numbers were produced

- **Framework:** `node --test` (built in; no dependency added). The feature's deliverable is a
  Prisma schema, a SQL migration and a seed script rather than application code, so shelling out
  to `prisma` and `psql` shows what actually happened to the database instead of asserting on
  the text that was meant to cause it.
- **Command:**
  ```bash
  node --test --test-concurrency=1 \
                test/database-schema-and-migrations/schema.test.mjs \
                test/database-schema-and-migrations/migrations.test.mjs \
                test/database-schema-and-migrations/seed.test.mjs
  ```
- **Result:** exit **0** — 14 tests, 14 passed, 0 failed, 0 skipped.
  - `schema.test.mjs` 5/5 — no database needed.
  - `migrations.test.mjs` 4/4 — against a real PostgreSQL server.
  - `seed.test.mjs` 5/5 — against a real PostgreSQL server.
- **Why `--test-concurrency=1`.** Node runs test _files_ in parallel by default. With three
  files each driving `prisma` and its own database on one machine, they contend: a recorded
  parallel run measured the seed at **71 s** instead of 21 s and the whole suite at 158 s
  instead of 88 s. That is a property of the harness, not of the seed, but a budget measured
  under self-inflicted contention is not a measurement. Serialising the files makes the NFR
  numbers reproducible and matches how CI would run a database suite.
- **Location:** `test/database-schema-and-migrations/` (feature folder per the placement rule).
- Every test name carries its requirement or AC ID (CON-405).

### The database the suite uses

The suite starts and reuses its **own** `postgres:16-alpine` container on port **55432**
(`riaya-bp002-test-pg`), and each test file gets its own database inside it:
`riaya_bp002_mig`, `riaya_bp002_additive`, `riaya_bp002_seed`.

This is deliberate. `prisma migrate deploy` connects from the host, and on this machine the
compose database publishes 5432 while a native PostgreSQL 17 Windows service holds 5432 as
well — so the connection reached whichever listener answered first. That produced two
misleading failures before it was diagnosed: `permission denied to create database`, and
`P1003: Database riaya_bp002_additive does not exist` for a database `psql` had just created
inside the container. A container on its own port removes the coin toss. When Docker is
unavailable the database tests skip with that reason rather than failing.

## 3. AC → test mapping

| AC     | Test     | What it asserts                                                                                         | Result |
| ------ | -------- | ------------------------------------------------------------------------------------------------------- | ------ |
| AC-001 | TEST-001 | `Patient`, `Doctor` and `Appointment` exist, each with `clinicId` as a real foreign key to `Clinic`     | pass   |
| AC-001 | TEST-002 | `Appointment` references both `Patient` and `Doctor`                                                    | pass   |
| AC-002 | TEST-006 | `migrate deploy` on an empty database creates the clinical tables, both migrations recorded finished    | pass   |
| AC-003 | TEST-009 | The migration is additive (no DROP/TRUNCATE/ALTER COLUMN) and pre-existing clinic and user rows survive | pass   |
| AC-004 | TEST-008 | A second `migrate deploy` reports no pending migrations and changes no counts                           | pass   |
| AC-005 | TEST-003 | `@@index([doctorId, startsAt])` and `@@index([patientId])` are declared on `Appointment`                | pass   |
| AC-006 | TEST-010 | The seed creates 3 clinics, 10 doctors, 200 patients, 600 appointments                                  | pass   |
| AC-007 | TEST-012 | A second seed run changes no count and creates no duplicate rows                                        | pass   |
| AC-008 | TEST-013 | Every seeded patient and user email uses a reserved fixture domain; no required field is null           | pass   |
| AC-009 | TEST-004 | The ERD names `PATIENT`, `DOCTOR`, `APPOINTMENT`, `CLINIC` and relates them                             | pass   |
| AC-009 | TEST-005 | The ERD names both indexes and points at `schema.prisma` as the source of truth                         | pass   |

Requirement coverage: FR-001 to FR-008 and NFR-001 to NFR-004 are all mapped in
`governance/database-schema-and-migrations/v1/traceability.json`, every row `complete`.

## 4. Non-functional results

| NFR     | Measured                                                                                        | Budget | Result |
| ------- | ----------------------------------------------------------------------------------------------- | ------ | ------ |
| NFR-001 | `migrate deploy` on an empty database: **10.1 s** in the recorded run, 7.4 s when run alone     | 60 s   | pass   |
| NFR-003 | Seed: **21.2 s** from empty in the recorded run, 19.1 s alone; the repeat seed alone **11.6 s** | 60 s   | pass   |

Both are single runs on a developer machine with Docker Desktop, not a benchmark. They answer
the question the NFR asks — "can CI run this unattended inside a minute?" — with an order of
magnitude of headroom, and are recorded as measurements rather than targets.

## 5. Notes and judgement calls

- **TEST-014 covers CON-519, not an AC.** The seed must refuse `NODE_ENV=production`. It is
  tested because a fixture generator that can write to a production database is a hazard the
  constitution names explicitly, and the guard runs before any database work, so the test needs
  no database.
- **TEST-009 was initially a false positive.** It asserted the clinical migration contains no
  `TRUNCATE`, and matched the word inside the migration's own comment ("no table or column is
  removed, truncated"). Comments are now stripped before scanning. A check that fails on
  documentation is not a check.
- **The additive claim is tested twice**: statically, that the SQL contains no destructive
  statement; and behaviourally, by applying the tenancy migration to a populated database and
  confirming the rows survive the clinical one.
- **`endsAt > startsAt` is not tested** because it cannot be expressed in Prisma; EC-003 records
  the gap and assigns enforcement to BP-019 rather than pretending the schema covers it.
- **The suite creates a container on first run.** `docker ps --filter name=riaya-bp002-test-pg`
  shows it; `docker rm -f riaya-bp002-test-pg` removes it. It is not part of `docker-compose.yml`
  because it exists only for this suite.
