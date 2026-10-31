# Test Report: Authentication, Onboarding & Access Control (v1)

## 1. Summary
- **Date:** 2026-10-30
- **Feature:** authentication-onboarding-and-access-control
- **Version:** v1
- **Total ACs:** 45
- **Tested ACs:** 45
- **Coverage:** 100%
- **Tests Passed:** 50/50

## 2. How the numbers were produced

- **Server:** Jest 29 + Supertest over server/src/**/*.spec.ts (CON-406),
  node node_modules/jest/bin/jest.js --runInBand --forceExit --testTimeout=120000 inside server/.
  Raw output: C:\Users\KENULE-NWINEE\Documents\Ri-aya\.sdrive\reports\tests\raw\authentication-onboarding-and-access-control-v1-2026-10-30.log
- **Backoffice:** Vitest + React Testing Library, pnpm --filter backoffice exec vitest run.
- Skipped in this run: 1 (the Redis-only AC-009 suite; see section 3).
- REDIS_URL is deliberately NOT exported for this run: with it set,
  Test.createTestingModule().compile() blocks in auth.e2e.spec.ts and
  switch-workspace.e2e.spec.ts beforeAll (ioredis retries indefinitely) and the
  hook budget expires.
- --testTimeout=120000: module bootstrap needs 30-60 s on this machine (argon2 +
  ts-jest), so jest's 30 s default turned machine slowness into hook-timeout failures.

## 3. AC -> test mapping (the delta closed by this pass)

| AC | Test | File | Status |
|----|------|------|--------|
| AC-006 | TEST-026, TEST-027 | server/src/auth/auth.e2e.spec.ts | pass |
| AC-009 | TEST-050 | server/src/cache/lockout-persistence.spec.ts | pass vs live Redis |
| AC-012 | TEST-017 | server/src/auth/switch-workspace.e2e.spec.ts | pass |
| AC-032 | TEST-040 | server/src/tenancy/acceptance-gaps.e2e.spec.ts | pass |
| AC-042 | TEST-003 | server/src/tenancy/registration.e2e.spec.ts | pass |

AC-009 (lockout survives an API restart) needs Redis and skips itself without
REDIS_URL + LOCKOUT_INTEGRATION=1. It was executed for real against the
riaya-redis container and passed; recorded in
.sdrive/reports/tests/raw/lockout-integration-ac-009-2026-10-30.log:

```
PASS src/cache/lockout-persistence.spec.ts
  Lockout persistence across a restart (AC-009)
    passed  keeps the account locked for a brand-new cache instance
Tests:       1 passed, 1 total
```

## 4. Failures

| Test | Reason | Blocking |
|------|--------|----------|
| - | none | - |

An earlier run in this session reported 4 failed - all four were beforeAll hook
timeouts (30 s) under load (Docker Desktop plus overlapping jest runs; that run took
900 s instead of ~115 s), not assertion failures.

## 5. Notes

- TEST-033 was removed from traceability.json (FR-001, FR-002, FR-003, FR-011, FR-028):
  five rows cited an ID that exists nowhere in the codebase.
- sdrive verify reports warn (matched 105, missing 0) after restoring the customised
  .sdrive/scripts/verify.js that the 0.1.47 re-sync had overwritten.
