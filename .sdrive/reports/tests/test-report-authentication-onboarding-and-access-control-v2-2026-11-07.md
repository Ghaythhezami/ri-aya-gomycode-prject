# Test Report: Authentication, Onboarding & Access Control (v2)

## 1. Summary

- **Date:** 2026-11-07
- **Feature:** authentication-onboarding-and-access-control
- **Version:** v2
- **Total ACs:** 19
- **Tested ACs:** 19
- **Coverage:** 100%
- **Tests Passed:** 19/19

## 2. How the numbers were produced

- **Server command:** `pnpm --filter server exec jest --runInBand --silent -t AC-0 src/mail/smtp-mail.service.spec.ts src/mail/templates.spec.ts src/tenancy/invitation-lifecycle.e2e.spec.ts src/tenancy/role-management.e2e.spec.ts`
  — 4 suites, **16 passed / 0 failed**.
- **Backoffice commands:**
  - `pnpm --filter backoffice exec vitest run test/authentication-onboarding-and-access-control/staff-invite-feedback.test.tsx -t AC-05 --reporter=dot` — **1 passed** (AC-050).
  - `pnpm --filter backoffice exec vitest run test/authentication-onboarding-and-access-control/accept-invite.test.tsx -t AC-06 --reporter=dot` — **2 passed** (AC-062, AC-063).
- **Combined:** **19 passed / 0 failed**.
- **Recorder:** `sdrive test authentication-onboarding-and-access-control --cmd "<the combined command>"` — exit code `0`.
- **Evidence:** `.sdrive/governance/authentication-onboarding-and-access-control/v2/test-evidence.json`
  — records the exact command, commit, branch and timestamps. Its summary is `passed: 16`
  because the CLI parser reads the first framework segment (Jest); the Vitest segment ran in
  the same command and is recorded in the raw output. The report and raw log reconcile the
  full **19/19**.
- **Raw output:** `.sdrive/reports/tests/raw/authentication-onboarding-and-access-control-v2-2026-11-07.log`

The backoffice test files contain 13 tests in total; run without the AC-name filter they
pass **13/13**. The `-t AC-0` selection intentionally skips existing v1-only tests so this
report counts only v2 acceptance evidence.

## 3. AC → test mapping

| AC ID  | Test ID  | File                                                                                          | Status  |
| ------ | -------- | --------------------------------------------------------------------------------------------- | ------- |
| AC-046 | TEST-046 | `server/src/mail/smtp-mail.service.spec.ts`                                                   | ✅ Pass |
| AC-047 | TEST-047 | `server/src/mail/templates.spec.ts`                                                           | ✅ Pass |
| AC-048 | TEST-048 | `server/src/tenancy/invitation-lifecycle.e2e.spec.ts`                                         | ✅ Pass |
| AC-049 | TEST-049 | `server/src/tenancy/invitation-lifecycle.e2e.spec.ts`                                         | ✅ Pass |
| AC-050 | TEST-050 | `backoffice/test/authentication-onboarding-and-access-control/staff-invite-feedback.test.tsx` | ✅ Pass |
| AC-051 | TEST-051 | `server/src/tenancy/invitation-lifecycle.e2e.spec.ts`                                         | ✅ Pass |
| AC-052 | TEST-052 | `server/src/tenancy/invitation-lifecycle.e2e.spec.ts`                                         | ✅ Pass |
| AC-053 | TEST-053 | `server/src/tenancy/invitation-lifecycle.e2e.spec.ts`                                         | ✅ Pass |
| AC-054 | TEST-054 | `server/src/tenancy/invitation-lifecycle.e2e.spec.ts`                                         | ✅ Pass |
| AC-055 | TEST-055 | `server/src/tenancy/invitation-lifecycle.e2e.spec.ts`                                         | ✅ Pass |
| AC-056 | TEST-056 | `server/src/tenancy/invitation-lifecycle.e2e.spec.ts`                                         | ✅ Pass |
| AC-057 | TEST-057 | `server/src/tenancy/invitation-lifecycle.e2e.spec.ts`                                         | ✅ Pass |
| AC-058 | TEST-058 | `server/src/tenancy/role-management.e2e.spec.ts`                                              | ✅ Pass |
| AC-059 | TEST-059 | `server/src/tenancy/role-management.e2e.spec.ts`                                              | ✅ Pass |
| AC-060 | TEST-060 | `server/src/tenancy/role-management.e2e.spec.ts`                                              | ✅ Pass |
| AC-061 | TEST-061 | `server/src/tenancy/invitation-lifecycle.e2e.spec.ts`                                         | ✅ Pass |
| AC-062 | TEST-062 | `backoffice/test/authentication-onboarding-and-access-control/accept-invite.test.tsx`         | ✅ Pass |
| AC-063 | TEST-063 | `backoffice/test/authentication-onboarding-and-access-control/accept-invite.test.tsx`         | ✅ Pass |
| AC-064 | TEST-064 | `server/src/tenancy/invitation-lifecycle.e2e.spec.ts`                                         | ✅ Pass |

All 19 rows are mapped in
`.sdrive/governance/authentication-onboarding-and-access-control/v2/traceability.json`
with `status: complete`; no criterion is withdrawn.

## 4. Failures

| Test | Reason | Blocking |
| ---- | ------ | -------- |
| -    | none   | -        |

## 5. Notes

- **`sdrive verify` FAILED (status 7).** Matched 12, missing 14, renamed 2, extra 2.
  Missing items include `backoffice/src/pages/StaffDirectoryPage.tsx`,
  `backoffice/src/pages/AcceptInvitePage.tsx`, `server/.env.example`, the `Invitation`
  fields (`status`, `deliveryStatus`, `deliveryError`, `updatedAt`), the
  `UserMembership` fields (`role`, `updatedAt`), and the `nodemailer`, `@prisma/client`
  and `class-validator` dependencies. The missing files and fields exist in the working
  tree, so this is a plan-to-code alignment failure, not a test failure. Resolve it with
  `/sdrive:sync authentication-onboarding-and-access-control` (or an approved plan update)
  before review/archive. The full report is
  `.sdrive/governance/authentication-onboarding-and-access-control/v2/verification.json`.
- **Governance validator:** `node .sdrive/scripts/validate-governance.js` — all files valid.
- **Test-double note:** `MemoryPrisma.invitation.findUnique` now resolves the
  `clinic`/`organization` includes used by `GET /api/invitations/:token`; this is test-mode
  infrastructure only. Production Prisma already supports the include; no production
  behaviour changed.
- **Server suite:** 16 v2 AC tests across 4 suites, including two mail unit tests that mock
  the SMTP transport and render all three locales.
- **Backoffice suite:** 3 v2 AC tests across 2 files; the full files pass 13/13.
- **AC-059** exercises the last-SUPER_ADMIN invariant through the service with an explicit
  tenant frame, because the API's self-change guard prevents the only reachable
  HTTP self-demotion path.
