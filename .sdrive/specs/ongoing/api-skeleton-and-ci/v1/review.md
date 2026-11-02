---
status: FAIL
feature: api-skeleton-and-ci
version: v1
commit: a09e8da4703cb8e9abb7ade709cf2305c9026a40
branch: feature/bp-002-bp-003-bp-006-bp-031
base: main
reviewedBy: kenule500
reviewedAt: 2026-11-02T11:39:32Z
coverage: 100
evidence: .sdrive/governance/api-skeleton-and-ci/v1/test-evidence.json
---

# Review Report: api-skeleton-and-ci (v1)

## 1. Audit Summary

- **Status:** FAIL
- **Date:** 2026-11-02
- **Reviewer:** kenule500 (independent: no — reviewer is also the implementation author; escalated, owner accepted)
- **Version:** v1
- **Commit:** `a09e8da4703cb8e9abb7ade709cf2305c9026a40`
- **Branch / base:** `feature/bp-002-bp-003-bp-006-bp-031` / `main`

The code is not what fails this review. The logging, the exception filter and the CI
workflow all hold up under audit. The feature fails because its own **completion and
evidence chain is not closed**: two tasks are still open, the implementation gate was
never approved, and the CI half of the feature has never produced a run.

## 2. Evidence

- **Test evidence:** `.sdrive/governance/api-skeleton-and-ci/v1/test-evidence.json` —
  `exitCode: 0`, `{passed: 72, failed: 0, skipped: 1, total: 73}`, commit
  `b496f360febe9012403df39c30c5846f6f92b99c`. The file is git-ignored by design
  (`.gitignore:35`) and is therefore not in the reviewed commit.
- **Test report:** `.sdrive/reports/tests/test-report-api-skeleton-and-ci-v1-2026-11-02-rerun.md`
  (11:25, newer than `spec.md` 22:43 and `plan.md` 22:52 on 2026-11-01).
- **Verification:** `.sdrive/governance/api-skeleton-and-ci/v1/verification.json` —
  `warn`, 9 matched, 0 missing, 1 withdrawn, 3 extra.
- **Audit chain:** `sdrive audit:verify` — 28 hashed events verified, 0 broken.
- **CI:** **not verified.** No run exists for `a09e8da`; `gh` and a GitHub runner are
  both unavailable in this environment.

## 3. Criteria Check

- [x] **Spec Convergence** — 10 ACs implemented; AC-001..004, 008, 009, 010 read as
      satisfied against the code.
- [ ] **Task Completion** — **FAIL.** `T3.2` and `T3.3` are `completed: false` in
      `tasks.json`.
- [x] **Traceability** — 13 rows, all `complete`, no empty cells.
- [x] **Coverage** — 100% (10/10 ACs tested, 73/73 tests accounted for, 72 passing,
      1 skipped for a recorded pre-existing reason).
- [x] **Test Report** — present, versioned filename, newer than spec and plan.
- [ ] **Test Evidence** — **FAIL.** Exit 0 and zero failures, but
      `commit !== HEAD`: the evidence is stamped `b496f36`, while `HEAD` is
      `a09e8da` (the artifact-only commit that followed).
- [x] **Change Scope** — 34 files in the four feature commits, all planned. The
      `main...HEAD` diff also carries BP-002 commits; they are separated by commit,
      not entangled (CON-611).
- [x] **Test Quality** — no `.only`, no `xit`, no `xdescribe`, no `test.skip` in the
      feature's test files; every test name carries its AC ID.
- [x] **Code Quality** — `pnpm typecheck` exit 0; `pnpm lint` exit 0 (warnings only,
      pre-existing `<img>` advice in `web/`).
- [ ] **Security** — **FAIL**, see §7. No secrets and no CVEs in the new code, but one
      `REQUIRED` baseline control is not wired as stated.
- [x] **Testing** — 72 passed, 0 failed, exit 0.
- [x] **Documentation** — `CONTRIBUTING.md` documents the redaction contract and
      `LOG_LEVEL` as the only knob (T3.1).
- [x] **NFR Evidence** — NFR-001 measured and recorded (§7); NFR-002/004 covered by
      tests; NFR-003 marked not verified.
- [ ] **Definition of Done** — **FAIL.** The implementation gate is `pending` and two
      tasks are open.
- [x] **Spec-to-Code Verification** — `sdrive verify` returns `warn`, which is accepted.
- [ ] **CI** — **FAIL / not verified.** No run exists for `HEAD`.
- [x] **Permission** — `check-permission.js slash /sdrive:review` allowed, kenule500
      admin.
- [ ] **Reviewer Independence** — **not independent.** The reviewer is the
      implementation author; recorded and escalated rather than silently
      self-approved.

## 4. Change Scope

- **Files changed:** 34 (four commits: `84011b6`, `56d0d59`, `b496f36`, `a09e8da`)
- **Planned files changed:** 34
- **Unplanned files:** 8 `.sdrive/` governance and report artifacts (traceability,
  verification, handoff, reports, `scripts/verify.js`) — governance scaffolding, not
  application drift.
- **Other-feature commits:** none inside the four feature commits. The `main...HEAD`
  range also contains the BP-002 (`database-schema-and-migrations`) commits, already
  reviewed separately at `7bb2824`.
- **Working tree:** clean.

Production files touched in the test phase and flagged for review sign-off:
`server/src/logging/logging.module.ts` (the `quietReqLogger` fix, `b496f36`),
`server/src/logging/app-log-stream.ts` and its spec (test-only transport).

## 5. Issues Found

| Severity | Issue                                                                                                                                                                                                                       | Location                                             | AC                     | Fix Required | Fix with         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------- | ------------ | ---------------- |
| High     | Implementation gate still `pending`; review cannot clear a feature whose human gate was never granted                                                                                                                       | `.sdrive/workflow-state.json`                        | —                      | Yes          | `/sdrive:apply`  |
| High     | CI never run for `HEAD`; AC-005/006/007 are recorded `Static` only, never `Pass`                                                                                                                                            | `.github/workflows/ci.yml`                           | AC-005, AC-006, AC-007 | Yes          | `/sdrive:test`   |
| High     | `pnpm audit --prod --audit-level=high` exits 1 (26 advisories: 15 high, 1 critical). None is in a newly added dependency; the critical is `server>typeorm>sqlite3>tar`. The audit step this feature adds would fail the job | `pnpm-lock.yaml`                                     | AC-007                 | Yes          | `/sdrive:secure` |
| High     | AC-009 says the body keeps `statusCode` and `message`; the filter emits `{ code, message, details, requestId }`. Not a regression — the spec wording does not match the implemented, already-reviewed contract              | `server/src/common/filters/http-exception.filter.ts` | AC-009                 | Yes          | `/sdrive:apply`  |
| Medium   | `test-evidence.json` commit (`b496f36`) is not `HEAD` (`a09e8da`); evidence must be re-stamped at the reviewed commit                                                                                                       | `.sdrive/governance/.../test-evidence.json`          | —                      | Yes          | `/sdrive:test`   |
| Medium   | `T3.2` and `T3.3` still `completed: false`                                                                                                                                                                                  | `.sdrive/governance/.../tasks.json`                  | AC-005                 | Yes          | `/sdrive:apply`  |
| Medium   | CON-515 says input validation comes from class-validator DTOs; logging accepts free-form options from `process.env` and validates them by hand (bounded length, safe-token regex). Compliant in effect, not by the letter   | `server/src/logging/logging.config.ts`               | —                      | Yes          | `/sdrive:secure` |
| Low      | Reviewer is the implementation author (independence)                                                                                                                                                                        | this report                                          | —                      | No           | `/sdrive:review` |
| Low      | AC-010's test lives in `test/`, a recorded CON-403 exception                                                                                                                                                                | `test/api-skeleton-and-ci/swagger.test.mjs`          | AC-010                 | No           | —                |
| Low      | `$queryRawUnsafe` wrapper is still exposed; its only caller passes the constant `'SELECT 1'`. Pre-existing, not touched by this feature                                                                                     | `server/src/database/prisma.service.ts:62`           | —                      | No           | —                |

## 6. Recommendations

- Run the CI workflow once on a runner and paste the run URL into the next review.
  AC-005/006/007 cannot become `Pass` without that run.
- Clear the audit before the first green CI run, or the job fails on its own audit
  step. The critical/high findings are in `typeorm`'s bundled `sqlite3` and in other
  workspaces, not in the logging stack this feature added.
- Consider re-stamping evidence in the same commit as the review artifacts, so
  `commit === HEAD` does not silently drift.
- The three-trial, alternating NFR-001 measurement is sound; keep that method.

## 7. Security & Performance

| Area                                               | Status                  | Reason / measurement                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security — secrets, dependencies, CON-51x baseline | **fail**                | No hardcoded secrets in the diff (no `gitleaks`/`trufflehog` installed; documented manual pattern scan over the added lines found only redaction-path names, `secrets.GITHUB_TOKEN` and `fixture-*` literals). New dependencies (`nestjs-pino`, `pino-http`, `pino-pretty`, `ioredis`, `dotenv`) carry 0 advisories. The failure is the CON-515 baseline letter and the failing audit gate (AC-007). |
| Performance — NFRs, SEO                            | **fail** (NFR-003 only) | NFR-001: median of 3 alternating trials, p95 18.22 ms `silent` vs 17.72 ms `info`, delta −0.50 ms against a +5 ms budget — pass. NFR-002: single-line JSON asserted in tests — pass. NFR-004: no call sites changed — pass. NFR-003 (CI under 15 min): **not verified**, no runner.                                                                                                                  |

CON-51x baseline, each control confirmed in the request path:

| ID      | Control              | Status | Evidence                                                                                                                  |
| ------- | -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| CON-511 | Authentication       | pass   | `server/src/auth/` (JWT strategy, argon2, rotating refresh)                                                               |
| CON-512 | Authorization        | pass   | `common/guards/roles.guard.ts`, `@Roles()` on users                                                                       |
| CON-513 | Security headers     | pass   | `main.ts:25` `app.use(helmet())`                                                                                          |
| CON-514 | Rate limiting        | pass   | `app.module.ts` `ThrottlerModule` + `APP_GUARD: ThrottlerGuard`                                                           |
| CON-515 | Input validation     | fail   | `main.ts:41` `ValidationPipe` is correct, but the new config surface hand-validates `process.env` rather than using a DTO |
| CON-516 | Injection protection | pass   | Prisma parameterises; sole raw-SQL caller is the constant `'SELECT 1'` health check                                       |
| CON-517 | XSS                  | pass   | Helmet plus React escaping; no `dangerouslySetInnerHTML` added                                                            |
| CON-518 | CSRF                 | pass   | `cookieParser()` + explicit CORS allow-list with `credentials: true`                                                      |
| CON-519 | Environment          | pass   | `.gitignore:14` covers `.env`; no `.env` is tracked                                                                       |

## 8. Handoff

**Findings to fix**, in the order that clears the chain:

1. `sdrive approve api-skeleton-and-ci implementation` — you, the human gate. No
   command owns this; the review cannot grant it.
2. `/sdrive:secure api-skeleton-and-ci` — clear the audit findings and settle CON-515.
3. `/sdrive:apply api-skeleton-and-ci` — correct AC-009's wording and close T3.2/T3.3.
4. `/sdrive:test api-skeleton-and-ci` — re-stamp evidence at the new `HEAD`, with the
   CI run outcome recorded.
5. `/sdrive:review api-skeleton-and-ci` — round 2 of 3.

**Why the recommendation differs:** the test phase reported PASS for seven of ten ACs
and the rerun was honest about that. What it could not do was close the chain — green
tests are necessary, not sufficient. This review holds the same evidence and reaches
FAIL because the feature's CI half has no run, its audit gate cannot pass, and its
tasks and human gate are still open. That is the difference between "the tests pass"
and "the feature is done".

**Round cap:** if round 3 fails on the same finding, stop and hand it to a human.
