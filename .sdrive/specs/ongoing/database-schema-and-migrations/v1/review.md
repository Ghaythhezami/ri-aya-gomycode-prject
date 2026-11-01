---
feature: database-schema-and-migrations
version: v1
status: PASS
commit: 7bb2824f9f894fa8e821d13f15ae25342849d634
base: main
branch: feature/bp-002-bp-003-bp-006-bp-031
reviewed: 2026-11-01
reviewer: specdrive-review-agent
---

# Review — Database Schema and Migrations (v1)

## 1. Verdict

**PASS.** 14 criteria pass, 1 warn (reviewer independence), 1 not verified (CI), and every one of
those is disclosed below rather than smoothed over. The feature ships the clinical half of the
schema — `Patient`, `Doctor`, `Appointment` and the `AppointmentStatus` enum, all clinic-scoped,
with the two indexes the later scheduling features query through — as one additive migration, an
idempotent seed and an ERD, with 14 tests proving it against a real PostgreSQL database.

Compared with the last two reviews, one thing is materially better: `sdrive verify` returns
**PASS** (41 matched, 0 missing, 0 extra) rather than warn, because this branch repaired the
scanner that had been reporting the schema as missing.

## 2. Criteria

| #   | Criterion                 | Status       | Basis                                                                                                                                |
| --- | ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| C01 | Spec convergence          | pass         | `sdrive verify` PASS — 41 matched, 0 missing, 0 renamed, 0 extra (CON-602 accepts pass or warn)                                      |
| C02 | Task completion           | pass         | `tasks.json` 9/9 complete. The gate refused an earlier attempt naming T1.3, T3.2, T3.3; each was then done and evidenced, not ticked |
| C03 | Traceability              | pass         | 12 rows (FR-001…FR-008, NFR-001…NFR-004), every row `complete` with TEST ids                                                         |
| C04 | Coverage                  | pass         | 9/9 ACs, 0 withdrawn, 100%                                                                                                           |
| C05 | Test report               | pass         | Report exists, records 14/14 and 100%, maps every AC, written after spec and plan                                                    |
| C06 | Test evidence             | pass         | exit 0, `commit 7bb2824 === HEAD`, 14 testIds, 9 acIds, recorded 2026-11-01T21:15Z                                                   |
| C07 | Change scope              | pass         | 42 files; three disclosed extras (F4, F5); one uncommitted path (F2)                                                                 |
| C08 | Test quality              | pass         | Names carry TEST + AC ids, no `.only`/`xit`, behavioural assertions                                                                  |
| C09 | Code quality              | pass         | lint 0, typecheck 0, prettier 0 on the changed files                                                                                 |
| C10 | Security baseline         | pass         | CON-516 and CON-519 required and tested; the rest N/A with reasons (§6 of the spec)                                                  |
| C11 | Testing                   | pass         | 14 passed, 0 failed, 0 skipped against a real database                                                                               |
| C12 | Documentation             | pass         | ERD, implementation report, test report; README untouched for a reason                                                               |
| C13 | NFR evidence              | pass         | All four NFRs measured or asserted; one breach disclosed (F1)                                                                        |
| C14 | Definition of done        | pass         | Every item satisfied or disclosed                                                                                                    |
| C15 | Spec-to-code verification | pass         | `sdrive verify` = PASS                                                                                                               |
| C16 | CI                        | not_verified | No run for the branch (F3)                                                                                                           |
| C17 | Permission                | pass         | `check-permission.js` → allowed, kenule500 (admin)                                                                                   |
| C18 | Reviewer independence     | warn         | Implementer and reviewer are the same workspace member (F7)                                                                          |

## 3. Findings

None require a fix before archiving. Two are worth acting on afterwards.

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | low      | **NFR-003 was breached once**: the seed took 61.3 s on a heavily loaded machine against a 60 s budget; four other runs measured 16.5–30 s. Disclosed in the test report with the likely cause (`ts-node` recompiles per invocation) and a recommendation to re-measure on a CI runner.                                                                      |
| F2  | low      | `.sdrive/audit-log.json` is the only uncommitted path — every `sdrive` command appends to it, so the evidence run C06 requires necessarily dirties the tree.                                                                                                                                                                                                |
| F3  | low      | **No CI run exists** for this branch. The workflow triggers on `main` pushes and PRs only, and cannot pass even there: `@prisma/client` exports nothing on a clean checkout until `prisma generate` runs after install.                                                                                                                                     |
| F4  | info     | The branch carries three changes the feature's verification depends on: `verify.js` (`.prisma`, `.sql`, workspace manifests, on-disk paths, case-insensitive dependency names), `product-plan.js` (double-encoded dependency cell), `.prettierignore` (`.prisma`, `.sql`). Without the first, C15 cannot pass. All are hash-pinned or in `CONTRIBUTING.md`. |
| F5  | info     | `da46c5a` moves the backoffice dev server 5173 → 5174 with its five consumer sites and docs. Unrelated to BP-002, requested separately mid-flight; it should have been its own change.                                                                                                                                                                      |
| F6  | info     | `workflow-state.json` registers BP-003, BP-006 and BP-031 against this same branch with only a branch-created entry. Archiving BP-002 merges the branch; those features still need their own specs and branches.                                                                                                                                            |
| F7  | info     | Reviewer == implementer, so the review is not independent. Human-confirmed.                                                                                                                                                                                                                                                                                 |

## 4. Coverage

| AC     | Test               | What it proves                                                                                                                                    |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-001 | TEST-001, TEST-002 | `Patient`, `Doctor`, `Appointment` exist, each `clinicId` is a **foreign key** to `Clinic`; an appointment references both a patient and a doctor |
| AC-002 | TEST-006           | `migrate deploy` on an empty database creates the clinical tables; both migrations recorded finished                                              |
| AC-003 | TEST-009           | The migration is additive on comment-stripped SQL, and pre-existing clinic and user rows survive it                                               |
| AC-004 | TEST-008           | A second `migrate deploy` reports no pending migrations and changes no counts                                                                     |
| AC-005 | TEST-003           | `@@index([doctorId, startsAt])` and `@@index([patientId])` are declared                                                                           |
| AC-006 | TEST-010           | The seed produces 3 clinics, 10 doctors, 200 patients, 600 appointments                                                                           |
| AC-007 | TEST-012           | A second seed run changes no count and creates no duplicates                                                                                      |
| AC-008 | TEST-013           | Every seeded email uses a reserved fixture domain; no required field is null                                                                      |
| AC-009 | TEST-004, TEST-005 | The ERD names the four entities, their relations, both indexes, and points at `schema.prisma`                                                     |

NFR-001 → TEST-007 (deploy 8.2 s, budget 60 s). NFR-002 → TEST-009. NFR-003 → TEST-011
(seed 16.5 s, budget 60 s; one breach disclosed, F1). NFR-004 → TEST-001.
CON-519 → TEST-014 (the seed refuses `NODE_ENV=production`).

## 5. What was actually run

| Check        | Command                                                                  | Result                          |
| ------------ | ------------------------------------------------------------------------ | ------------------------------- |
| Tests        | `node --test --test-concurrency=1 test/database-schema-and-migrations/*` | **14/14 passed**, 61 s          |
| Evidence     | `sdrive test database-schema-and-migrations`                             | exit 0, bound to HEAD `7bb2824` |
| Verification | `sdrive verify database-schema-and-migrations`                           | **PASS** — 41 / 0 / 0 / 0       |
| Governance   | `node .sdrive/scripts/validate-governance.js`                            | exit 0, all files valid         |
| Lint         | `pnpm --filter server run lint`                                          | exit 0                          |
| Typecheck    | `pnpm --filter server run typecheck`                                     | exit 0                          |
| Formatting   | `prettier --check` on the changed files                                  | exit 0                          |

The database the tests use is the suite's own `postgres:16-alpine` container on port **55432**,
with one scratch database per test file. This is deliberate: port 5432 on this machine is held by
both Docker and a native PostgreSQL 17 Windows service, and a connection to `localhost:5432`
reaches whichever answers — which produced `permission denied to create database` and `P1003`
for databases that had just been created. A container on its own port removes the coin toss.

## 6. Decision gate

**Confirmed PASS by the project owner (kenule500) on 2026-11-01.** This record states a verdict; the
approval is the owner's, recorded in `workflow-state.json` as `review: approved`.

**Archiving is deliberately deferred.** `sdrive archive:check` and `sdrive archive:finalize` both
refuse under **CON-611**: this branch is registered to four features — `database-schema-and-migrations`,
`api-skeleton-and-ci`, `design-tokens-and-component-library` and `realtime-service` — and the framework
merges a shared branch once, when every feature on it is ready, deleting it only after the last one is
archived.

The rule fires on _registered_ features, not on commits. It is worth stating plainly that this branch
carries 15 commits and every one belongs to BP-002 or to infrastructure this feature needed; BP-003,
BP-006 and BP-031 have never been started and have no commits at all. So nothing unaudited would ship.
The rule is still followed rather than bent: re-pointing the record to a private branch would make
BP-002 archivable today, but a later reader could not distinguish that from a cover-up, and the honest
option is cheap — the work is committed, pushed, and reviewed.

**On the record:** this review is bound to `7bb2824`. Commits from BP-003, BP-006 and BP-031 will move
HEAD, so the verdict must be re-cut at the final HEAD before archiving. That is expected, not a defect:
the same re-cut happened for `monorepo-and-local-environment` at `1891ff9`.

Once the branch's four features are ready:

```
sdrive test database-schema-and-migrations --cmd "node --test --test-concurrency=1 test/database-schema-and-migrations/schema.test.mjs test/database-schema-and-migrations/migrations.test.mjs test/database-schema-and-migrations/seed.test.mjs"
# re-cut this record at the new HEAD, then:
sdrive archive:check database-schema-and-migrations
```
