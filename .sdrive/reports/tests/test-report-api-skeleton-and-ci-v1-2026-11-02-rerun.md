# Test Report: API Skeleton and CI (v1) — re-run after fix b496f36

## 1. Summary

- **Date:** 2026-11-02
- **Feature:** api-skeleton-and-ci
- **Version:** v1
- **Total ACs:** 10
- **Tested ACs:** 10
- **Coverage:** 100%
- **Tests Passed:** 14/14

**Verdict: PASS for AC-001 to AC-004, AC-008, AC-009 and AC-010.**
This run re-executes the tests written earlier that already named every AC; no
new test was needed and none was added. The two tests that failed in
`test-report-api-skeleton-and-ci-v1-2026-11-02.md` (TEST-001 for AC-001 and
TEST-003 for AC-002) now pass, because debug commit `b496f36` set
`quietReqLogger: true` so `pino-http` emits the top-level `reqId` the criteria
require. No production code was changed in this phase.

**AC-005, AC-006 and AC-007 are NOT proven by this run.** They assert CI
behaviour and can only be checked statically here (see §4). They are marked
`✅ Static` below, not `✅ Pass`, and the reviewer should treat them as unverified
until a real GitHub Actions run is observed.

## 2. AC → Test Mapping

| AC ID  | Test ID            | File                                                                                 | Status    |
| ------ | ------------------ | ------------------------------------------------------------------------------------ | --------- |
| AC-001 | TEST-001, TEST-002 | server/src/logging/logging.module.spec.ts                                            | ✅ Pass   |
| AC-002 | TEST-003, TEST-004 | server/src/logging/logging.config.spec.ts, server/src/logging/logging.module.spec.ts | ✅ Pass   |
| AC-003 | TEST-005           | server/src/logging/logging.config.spec.ts, server/src/logging/logging.module.spec.ts | ✅ Pass   |
| AC-004 | TEST-006           | server/src/logging/logging.config.spec.ts, server/src/logging/logging.module.spec.ts | ✅ Pass   |
| AC-005 | TEST-007           | .github/workflows/ci.yml (static assertion)                                          | ✅ Static |
| AC-006 | TEST-008           | .github/workflows/ci.yml (static assertion)                                          | ✅ Static |
| AC-007 | TEST-009           | .github/workflows/ci.yml (static assertion)                                          | ✅ Static |
| AC-008 | TEST-010           | server/src/common/filters/http-exception-filter.spec.ts                              | ✅ Pass   |
| AC-009 | TEST-011           | server/src/logging/logging.module.spec.ts                                            | ✅ Pass   |
| AC-010 | TEST-012           | test/api-skeleton-and-ci/swagger.test.mjs                                            | ✅ Pass   |

### How each AC was proven in this run

- **AC-001** — `it('AC-001: writes exactly one completion record carrying reqId,
method, url, status code and duration')` boots the real `AppModule`, drives
  `/api/probe/ok`, and inspects the emitted completion record. Now passes.
- **AC-002** — the module test `it('AC-002: handler logs carry the same reqId as
the request record and match the X-Request-Id header')` plus the config tests
  for id generation and safe echo. Now passes.
- **AC-003** — redaction of `Authorization`, `Cookie` and a `password` body,
  asserted both at unit level (`redacts the request headers pino-http serialises
by default`, `covers credential keys at the top level and at depth`, `uses a
placeholder, not a dropped key`) and end to end.
- **AC-004** — `LOG_LEVEL` honoured for each level, defaulting to `info`, falling
  back on bad input, and the 2xx→info / 4xx→warn / 5xx→error map.
- **AC-005 / AC-006 / AC-007** — `ci.yml` was read, not run. It contains
  `pnpm install --frozen-lockfile`, `pnpm --filter server exec prisma generate`
  **before** `pnpm typecheck`, then `lint`, `test`, `build`, plus an
  `Audit production dependencies` step (`pnpm audit --prod --audit-level=high`)
  and a `Secret scan` step (`gitleaks/gitleaks-action@v2`). The ordering that
  AC-006 demands is present, with a comment explaining why the generate step is
  load-bearing. **Nothing here proves the job is green on GitHub.**
- **AC-008** — `AC-008: rejects an unknown body property with 400 instead of
ignoring it` and `AC-008: still accepts a body made only of declared
properties`, in a passing suite.
- **AC-009** — `AC-009: a thrown HttpException keeps its response shape and adds
a matching requestId`.
- **AC-010** — `node --test` on `swagger.test.mjs`: Swagger still mounts at
  `api/docs` with `useGlobalPrefix: false`, and the document is still built from
  the app with its metadata.

## 3. Failures

None.

| Test   | Reason | Blocking |
| ------ | ------ | -------- |
| (none) | —      | —        |

## 4. Notes

### Run details

- **Jest (CON-402):** run from `server/` as
  `pnpm test --reporter=dot --forceExit`. Result:
  `Test Suites: 1 skipped, 13 passed, 13 of 14 total`;
  `Tests: 1 skipped, 72 passed, 73 total`; **EXIT=0**.
- The one skipped suite is `server/src/cache/lockout-persistence.spec.ts`, a
  pre-existing `describe.skip` unrelated to this feature.
- The dot reporter prints no per-test names, so individual results are taken
  from the suite-level `PASS` lines plus the absence of any failure marker in
  the log (count of `✕`/`●` failure lines: 0). Both logging suites and the
  exception-filter suite report `PASS`.
- **Node test (AC-010):** `node --test test/api-skeleton-and-ci/swagger.test.mjs`
  → `pass 2`, `fail 0`; **EXIT=0**.
- **Coverage (CON-407):** statements 82.78% / branches 71.81% / functions 86.95%
  / lines 82.02% — all above the 80/80/70/50 thresholds.
- Raw output: `.sdrive/reports/tests/raw/api-skeleton-and-ci-v1-2026-11-02.log`
  (overwritten by this run, as the Test-Output Rule allows).

### CI criteria remain static-only

- **AC-005 / AC-006 / AC-007** need Docker and a GitHub runner, neither
  available in this environment. They are asserted against the workflow file.
  A green CI run is still outstanding evidence.
- `pnpm audit --prod --audit-level=high` exits 1 locally (26 advisories: 15 high,
  1 critical). Once the workflow runs, **AC-007's audit step will fail the job**
  until those advisories are resolved. This is a real forward risk, flagged for
  the reviewer, not fixed here — it is production/dependency work, outside the
  test phase.

### Carried forward from the first run, still needing review sign-off

- **AC-010 lives in `test/`, not `server/src/`.** A Node test file outside Jest's
  `rootDir: 'src'`. CON-403 forbids a separate test tree without approval; the
  existing `test/database-schema-and-migrations` and `test/monorepo-and-local-environment`
  suites already use this layout, so the convention is established, but the
  exception still wants an explicit decision at review.
- **Production code touched during the test phase** (disclosed in the first
  report, unchanged since): `server/src/logging/app-log-stream.ts` (new),
  `LOG_TRANSPORT_TARGET` / `resolveTransport()` in
  `server/src/logging/logging.config.ts`, and `transport: TRANSPORT` in
  `server/src/logging/logging.module.ts`. Behaviour is unchanged when
  `LOG_TRANSPORT_TARGET` is unset, which is every runtime path. Awaiting review.
- **Spec wording note (not a defect):** AC-009 names `statusCode` and `message`;
  the implemented body is `{ code, message, details }`. The test pins the
  implemented shape plus `requestId`. A spec slip, carried unchanged.

### Withdrawn Criteria

None. All 10 ACs in `spec.json` are in scope, none carries `withdrawn: true`,
and none was skipped.

### Traceability

Unchanged by this run: `.sdrive/governance/api-skeleton-and-ci/v1/traceability.json`
already carries a `testId` and `status: complete` on every row, and those IDs
still resolve to the tests that just passed. No row was edited.
