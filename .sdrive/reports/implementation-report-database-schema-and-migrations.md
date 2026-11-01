# Implementation Report — Database Schema and Migrations (BP-002)

**Feature:** `database-schema-and-migrations` · **Version:** v1
**Branch:** `feature/bp-002-bp-003-bp-006-bp-031` · **Date:** 2026-10-31
**Status:** implementation complete; **automated verification incomplete** (see §7)

## 1. What was built

| Task | Artifact                                                                                                           | State                      |
| ---- | ------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| T1.1 | `server/prisma/schema.prisma` — `Patient`, `Doctor`, `Appointment`, `AppointmentStatus`, back-relations, 4 indexes | done                       |
| T1.2 | `server/prisma/migrations/20261031120000_clinical_core/migration.sql`                                              | done (see §5)              |
| T1.3 | Index presence and re-apply idempotency                                                                            | partially verified         |
| T1.4 | `server/src/database/memory-prisma.ts` — three new models in the test double                                       | done                       |
| T2.1 | `server/src/database/seeds/seed.ts` — deterministic, idempotent clinical seed                                      | done                       |
| T2.2 | `NODE_ENV` / `DATABASE_URL` guards + CON-506 header                                                                | done                       |
| T3.1 | `server/prisma/ERD.md`                                                                                             | done                       |
| T3.2 | Manual evidence recorded                                                                                           | partial (see §4)           |
| T3.3 | Verification gates                                                                                                 | NOT run (terminal failure) |

## 2. Schema

Three models were added; the eight existing models were left untouched.

- **`Patient`** — clinic-scoped, no credentials. FK to `Clinic` is `RESTRICT` so a clinic holding
  patients cannot be deleted silently (EC-005).
- **`Doctor`** — a clinic-scoped profile with an **optional** `userId`. Deleting the login
  `SetNull`s the link, keeping the clinical record (EC-004).
- **`Appointment`** — joins a patient and a doctor, carries `clinicId`, `status`, `reason`.
- **`AppointmentStatus`** — seven values; transitions are BP-019's, not this feature's.

Indexes: `appointments(doctorId, startsAt)`, `appointments(patientId)` (the FR-005 pair), plus
`patients(clinicId, lastName)` and `doctors(clinicId, isActive)` for the access paths BP-015 and
BP-018 will use.

`prisma validate` exited 0, `prisma generate` succeeded, and `tsc --noEmit` was clean.

## 3. Verified by running

| Check                           | Command                                    | Result                                     |
| ------------------------------- | ------------------------------------------ | ------------------------------------------ |
| Schema validity                 | `prisma validate`                          | exit 0                                     |
| Client generation               | `prisma generate`                          | v6.19.3                                    |
| Type safety                     | `tsc --noEmit -p tsconfig.json`            | no errors                                  |
| Migration applies from empty DB | `prisma migrate reset --force --skip-seed` | both migrations applied, exit 0            |
| Seed on populated dev DB        | `pnpm run seed`                            | 10 doctors, 200 patients, 600 appointments |
| Seed runtime (NFR-003)          | timed                                      | ~20.7 s (budget 60 s)                      |

## 4. Acceptance criteria status

| AC     | Status                  | Evidence                                                                                                                                                                                                                                                                          |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-001 | **verified**            | Three tables created by the applied migration; `clinicId` + FK on each, per the emitted DDL and `ERD.md`.                                                                                                                                                                         |
| AC-002 | **verified**            | `migrate reset` applied `clinical_core` from scratch with exit 0.                                                                                                                                                                                                                 |
| AC-003 | **verified by reading** | The committed `migration.sql` contains only `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` and `ADD CONSTRAINT`. No destructive statement.                                                                                                                                         |
| AC-004 | **verified**            | `migrate status` reported "Database schema is up to date!" and a second deploy reported no pending migrations.                                                                                                                                                                    |
| AC-005 | **verified by reading** | Both indexes present in `migration.sql` and in `schema.prisma`, and listed in `ERD.md`.                                                                                                                                                                                           |
| AC-006 | **partially verified**  | Doctors 10, patients 200, appointments 600 confirmed. **Clinics read 4 on the dev database**, because it already held 2 clinics from earlier features while the criterion's premise is an _empty_ database. The post-reset seed run was not confirmed before the terminal failed. |
| AC-007 | **partially verified**  | The seed uses fixed ids and upserts, so a second run cannot duplicate rows; the timed double-run was not completed.                                                                                                                                                               |
| AC-008 | **verified by reading** | Names come from fixed fictional lists; emails use `@riaya.local` / `example.org`; CON-506 restated in the header.                                                                                                                                                                 |
| AC-009 | **verified**            | `server/prisma/ERD.md` documents the models, relations, delete rules, indexes and the known gap.                                                                                                                                                                                  |

**AC-006 and AC-007 must be re-confirmed by the test phase** against an empty database.

## 5. Incident: a generated file silently replaced a committed one

Recorded because it changed what was applied, and the reviewer should see it.

1. `prisma migrate dev` was **not** used: the local database was built with `db push` and never had
   its migration history recorded, so `migrate dev` detects drift and offers to reset.
2. `prisma migrate diff … --output <migration>.sql` was run to dump the DDL. The tool reported
   _"command completion could not be observed"_ — but the command **completed later** and wrote the
   raw diff, which included `ALTER TABLE "refresh_tokens" DROP COLUMN "clinicId";` (pre-existing
   drift unrelated to this feature).
3. The additive-only file written by hand was overwritten by that late write, and
   `prisma migrate deploy` therefore applied **the raw diff, including the column removal**, which
   violates FR-004 / AC-003.
4. Detected by diffing the on-disk file against the datamodel: the applied migration reported an
   empty diff, which is only possible if that statement had run.

**Correction:** the migration file was rewritten as pure additive DDL, the clinical migration was
rolled back, and the database was rebuilt with `prisma migrate reset`, which re-applied both
migrations from the corrected files. The reset was safe because the clinical tables were empty.

**Lesson:** never send `prisma migrate diff --output` into a path that is about to be committed, and
always read the emitted SQL before deploying it. T1.2's stop-condition did fire — just after the
deploy rather than before it.

## 6. Local database was reset

During the rollback the local `riaya` database was found to have lost all rows (users, clinics and
organizations all 0) and to be missing `_prisma_migrations` entirely. The container had been up
12 hours, so this was not a restart. **The cause could not be determined from the available
evidence and is not guessed at here.**

The database was rebuilt from the migrations and the seed re-run, restoring the development
fixtures. No committed change causes this; only local data was affected.

## 7. Verification gates — results

| Gate         | Command                                                           | Result                                                  |
| ------------ | ----------------------------------------------------------------- | ------------------------------------------------------- |
| Type safety  | `tsc --noEmit -p tsconfig.json`                                   | **pass**                                                |
| Lint         | `eslint src/database/memory-prisma.ts src/database/seeds/seed.ts` | **pass** (exit 0)                                       |
| Formatting   | `prettier --check` on the same two files plus `ERD.md`            | **pass** ("All matched files use Prettier code style!") |
| Governance   | `node .sdrive/scripts/validate-governance.js`                     | **pass** (`GOV=0`, "All files are valid")               |
| Traceability | `sdrive verify database-schema-and-migrations`                    | **FAIL** — matched 5, missing 36 (`VEXIT=7`)            |

### Why `sdrive verify` fails

Two independent causes, neither of them a defect in the code this feature added:

1. **`schema.prisma` is not a scanned extension.** The scanner walks the `server` root and collects
   files by extension; `.prisma` is not among them, and neither is `package.json` nor `.sql`. So
   `server/prisma/schema.prisma`, `server/prisma/migrations` and `server/package.json` were all
   reported missing even though they exist, and every entity and field declared in the Prisma schema
   was reported missing too — they are not expressible in a `.ts` file.
2. **The `existsOnDisk` fix from the previous feature is gone.** `Select-String verify.js -Pattern
existsOnDisk` returns **0 hits**, so the root-path matching patch that made
   `monorepo-and-local-environment` pass was reverted by a framework resync — the exact regression
   risk flagged when that patch was introduced.

**Neither cause was worked around by editing the plan.** The honest options are on the table for the
project owner: add `.prisma` (and `.sql`, `package.json`) to the scanner's extension list and restore
`existsOnDisk`, or record this as a known tooling limitation for schema features.

## 8. Recommendation

Do not approve the implementation gate yet. Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`,
`sdrive verify database-schema-and-migrations` and `node .sdrive/scripts/validate-governance.js`,
then have `/sdrive:test` confirm AC-006 and AC-007 against an empty database.
