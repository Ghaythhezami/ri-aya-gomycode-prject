# Test Report: Authentication, Onboarding & Access Control (v2)

## 1. Summary

- **Date:** 2026-11-08
- **Feature:** authentication-onboarding-and-access-control
- **Version:** v2
- **Total ACs:** 30
- **Tested ACs:** 30
- **Coverage:** 100%
- **Tests Passed:** 30/30

## 2. AC → Test Mapping

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
| AC-065 | TEST-065 | `server/src/tenancy/settings.e2e.spec.ts`                                                     | ✅ Pass |
| AC-066 | TEST-066 | `server/src/tenancy/settings.e2e.spec.ts`                                                     | ✅ Pass |
| AC-067 | TEST-067 | `server/src/tenancy/settings.e2e.spec.ts`                                                     | ✅ Pass |
| AC-068 | TEST-068 | `server/src/tenancy/roles.e2e.spec.ts`                                                        | ✅ Pass |
| AC-069 | TEST-069 | `backoffice/test/settings/settings.test.tsx`                                                  | ✅ Pass |
| AC-070 | TEST-070 | `server/src/tenancy/organization-overview.e2e.spec.ts`                                        | ✅ Pass |
| AC-071 | TEST-071 | `server/src/tenancy/organization-overview.e2e.spec.ts`                                        | ✅ Pass |
| AC-072 | TEST-072 | `backoffice/test/authentication-onboarding-and-access-control/workspace-switcher.test.tsx`    | ✅ Pass |
| AC-073 | TEST-073 | `backoffice/test/authentication-onboarding-and-access-control/workspace-switch.test.tsx`      | ✅ Pass |
| AC-074 | TEST-074 | `server/src/tenancy/organization-overview.e2e.spec.ts`                                        | ✅ Pass |
| AC-075 | TEST-075 | `backoffice/test/authentication-onboarding-and-access-control/workspace-switcher.test.tsx`    | ✅ Pass |

## 3. Failures

| Test | Reason | Blocking |
| ---- | ------ | -------- |
| -    | none   | -        |

## 4. Notes

- **Run:** 23 server Jest AC tests + 7 backoffice Vitest AC tests = **30 passed / 0 failed**. The raw log is `.sdrive/reports/tests/raw/authentication-onboarding-and-access-control-v2-2026-11-08.log`.
- **Existing coverage reused:** the settings, roles, overview, workspace and settings-shell tests existed before the 2026-11-08 scope extension; they now carry their AC IDs. New tests were added for AC-071 (cross-organization isolation), AC-072 (switcher list/active marker), AC-073 (refresh-before-reload, failed switch stays off signup) and AC-075 (create-dialog validation and switching state).
- **Selection:** the server run used `-t AC-0`; it skipped 7 non-AC tests in the same files. The backoffice runs selected the AC tests; 6 non-AC settings tests and other feature tests were skipped by the name filter. No AC test failed.
- **No production code changed by this test pass.** The only production-adjacent edits are the AC IDs in existing test names and the new test files.
- **Traceability:** all 32 requirement rows now have at least one test ID; the 16 extension rows link TEST-065–TEST-075.
- **Outstanding review findings:** the repository-wide formatter, README documentation and dev-only dependency advisories are still tracked by T13.2–T13.4 and are outside this test pass.
