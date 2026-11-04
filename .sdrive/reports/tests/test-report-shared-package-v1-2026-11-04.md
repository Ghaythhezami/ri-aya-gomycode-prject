# Test Report: Shared Package (v1)

## 1. Summary

- **Date:** 2026-11-04
- **Feature:** shared-package
- **Version:** 1
- **Total ACs:** 8
- **Tested ACs:** 8
- **Coverage:** 100%
- **Tests Passed:** 63/63

## 2. AC → Test Mapping

| AC ID  | Test ID  | File                                                           | Status  |
| ------ | -------- | -------------------------------------------------------------- | ------- |
| AC-001 | TEST-001 | backoffice/test/shared-package/package-contract.test.ts        | ✅ Pass |
| AC-001 | TEST-002 | backoffice/test/shared-package/package-contract.test.ts        | ✅ Pass |
| AC-001 | TEST-003 | backoffice/test/shared-package/package-contract.test.ts        | ✅ Pass |
| AC-001 | TEST-004 | server/src/shared-package/package-contract.spec.ts             | ✅ Pass |
| AC-001 | TEST-005 | server/src/shared-package/package-contract.spec.ts             | ✅ Pass |
| AC-001 | TEST-006 | server/src/shared-package/package-contract.spec.ts             | ✅ Pass |
| AC-002 | TEST-007 | backoffice/test/shared-package/consumer-shared-schemas.test.ts | ✅ Pass |
| AC-002 | TEST-008 | backoffice/test/shared-package/consumer-shared-schemas.test.ts | ✅ Pass |
| AC-002 | TEST-009 | backoffice/test/shared-package/consumer-shared-schemas.test.ts | ✅ Pass |
| AC-002 | TEST-010 | backoffice/test/shared-package/consumer-shared-schemas.test.ts | ✅ Pass |
| AC-002 | TEST-011 | backoffice/test/shared-package/consumer-shared-schemas.test.ts | ✅ Pass |
| AC-003 | TEST-012 | backoffice/test/shared-package/schema-type-inference.test.ts   | ✅ Pass |
| AC-003 | TEST-013 | backoffice/test/shared-package/schema-type-inference.test.ts   | ✅ Pass |
| AC-003 | TEST-014 | backoffice/test/shared-package/schema-type-inference.test.ts   | ✅ Pass |
| AC-003 | TEST-015 | backoffice/test/shared-package/schema-type-inference.test.ts   | ✅ Pass |
| AC-004 | TEST-016 | backoffice/test/shared-package/schema-type-inference.test.ts   | ✅ Pass |
| AC-005 | TEST-017 | backoffice/test/shared-package/package-boundary.test.ts        | ✅ Pass |
| AC-005 | TEST-018 | backoffice/test/shared-package/package-boundary.test.ts        | ✅ Pass |
| AC-005 | TEST-019 | backoffice/test/shared-package/package-boundary.test.ts        | ✅ Pass |
| AC-005 | TEST-020 | backoffice/test/shared-package/package-boundary.test.ts        | ✅ Pass |
| AC-005 | TEST-021 | backoffice/test/shared-package/package-boundary.test.ts        | ✅ Pass |
| AC-006 | TEST-022 | backoffice/test/shared-package/package-contract.test.ts        | ✅ Pass |
| AC-006 | TEST-023 | server/src/shared-package/package-contract.spec.ts             | ✅ Pass |
| AC-007 | TEST-024 | server/src/shared-package/schema-dto-parity.spec.ts            | ✅ Pass |
| AC-007 | TEST-025 | server/src/shared-package/schema-dto-parity.spec.ts            | ✅ Pass |
| AC-007 | TEST-026 | server/src/shared-package/schema-dto-parity.spec.ts            | ✅ Pass |
| AC-007 | TEST-027 | server/src/shared-package/schema-dto-parity.spec.ts            | ✅ Pass |
| AC-008 | TEST-028 | server/src/shared-package/schema-dto-parity.spec.ts            | ✅ Pass |
| AC-008 | TEST-029 | server/src/shared-package/schema-dto-parity.spec.ts            | ✅ Pass |
| AC-008 | TEST-030 | server/src/shared-package/schema-dto-parity.spec.ts            | ✅ Pass |
| AC-008 | TEST-031 | server/src/shared-package/schema-dto-parity.spec.ts            | ✅ Pass |
| AC-008 | TEST-032 | server/src/shared-package/schema-dto-parity.spec.ts            | ✅ Pass |

## 3. Failures

| Test | Reason | Blocking |
| ---- | ------ | -------- |
| None | —      | No       |

## 4. Notes

- Measured at commit `de73bc122e3152590cf51d3850ad57323150e791` (branch `feature/bp-045`), which is the current `HEAD`. Command: `sdrive test shared-package` (`npm test`). Result: **63 passed / 0 failed / 1 skipped (64 total), exit 0, 169 s**. Evidence: `.sdrive/governance/shared-package/v1/test-evidence.json`. Raw log: `.sdrive/reports/tests/raw/shared-package-v1-2026-11-04.log`.
- Frameworks follow the constitution: Vitest for `backoffice/test/**`, Jest for `server/src/**/*.spec.ts`. Judge by exit code: `BACKOFFICE_EXIT=0`, `SERVER_EXIT=0`.
- The single skipped test is `server/src/cache/lockout-persistence.spec.ts` ("Lockout persistence across a restart (AC-009)"), gated behind `ENABLED` in a feature outside `shared-package`. It is not one of the 32 tests mapped above and does not affect coverage.
- `packages/shared` has no test runner of its own, so every AC is proven from a consumer: no new test infrastructure was added to the package.
- AC-004 is proven by the real compiler: the test copies a fixture into `backoffice/`, runs `tsc --noEmit`, and requires a non-zero exit with `TS2339`. The timeout is raised to 120 s for the cold compiler start.
- Suite duration is sensitive to machine load. Two earlier attempts on 2026-11-04 failed with the _same class_ of error, a Vitest 5 s default timeout under full CPU saturation (`register-wizard.test.tsx`, then `accept-invite.test.tsx` in `authentication-onboarding-and-access-control`), neither of which is a test of this feature. This run completed on an uncontended machine with 0 failures.
- **Observation (not a test failure, production code NOT modified):** the three pages extend a shared field with `.min(1, 'auth.…Required')`, but the shared fields are already `min(1)`, so zod reports its own check first. The resolver therefore yields `"Invalid email address"` and `"Too small: expected string to have >=1 characters"` instead of the translated strings. Worth a follow-up decision; AC-002 is satisfied either way.
- `server` does not declare `zod` and resolves none of its own; it consumes the package's zod through `@riaya/shared`. The parity spec therefore types the schema structurally instead of importing zod types on the server side.
- AC-005 excludes any self-reference to `.sdrive`: the package boundary is checks on `packages/shared` only.
