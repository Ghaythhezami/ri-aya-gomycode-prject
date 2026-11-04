# Test Report: Role-Based Access Control and Clinic Scoping (v1)

## 1. Summary

- **Date:** 2026-11-04
- **Feature:** role-based-access-control-and-clinic-scoping
- **Version:** v1
- **Total ACs:** 9
- **Tested ACs:** 9
- **Coverage:** 100%
- **Tests Passed:** 12/12

## 2. AC → Test Mapping

| AC ID  | Test ID  | File                                                                                         | Status  |
| ------ | -------- | -------------------------------------------------------------------------------------------- | ------- |
| AC-001 | TEST-082 | server/src/common/roles-metadata.spec.ts                                                     | ✅ Pass |
| AC-002 | TEST-083 | server/src/common/guards/roles.guard.spec.ts                                                 | ✅ Pass |
| AC-003 | TEST-084 | server/src/common/roles-metadata.spec.ts                                                     | ✅ Pass |
| AC-004 | TEST-085 | server/src/common/roles-metadata.spec.ts                                                     | ✅ Pass |
| AC-005 | TEST-086 | backoffice/test/role-based-access-control-and-clinic-scoping/forbidden.test.tsx              | ✅ Pass |
| AC-006 | TEST-087 | backoffice/test/role-based-access-control-and-clinic-scoping/forbidden.test.tsx              | ✅ Pass |
| AC-007 | TEST-088 | backoffice/test/role-based-access-control-and-clinic-scoping/forbidden.test.tsx              | ✅ Pass |
| AC-008 | TEST-089 | backoffice/test/role-based-access-control-and-clinic-scoping/workspace-role-refresh.test.tsx | ✅ Pass |
| AC-009 | TEST-090 | server/src/common/guards/roles.guard.spec.ts                                                 | ✅ Pass |

## 3. Failures

| Test | Reason | Blocking |
| ---- | ------ | -------- |
| None | —      | No       |

## 4. Notes

- **Frameworks:** Jest for the server guard/metadata tests and Vitest/jsdom for the 403 page and the
  workspace switch, matching each package's convention (CON-401/408).
- **Run:** the feature's four files pass (12 tests). The full server suite passes (115 passed, 1
  skipped) and the full backoffice suite passes (21 files).
- **Enforcement:** the role-sensitive handlers carry the shared `CAPABILITY_ROLES` entries;
  authenticated-any handlers carry no role metadata; the guard allows a listed role, denies a role
  outside the set, and fails closed for a missing or unknown role.
- **Interface:** an unauthorised authenticated user gets the localized 403 page (no silent
  redirect), the page is localised in en/ar/fr and mirrors under RTL, and the navigation map is
  asserted equal to the shared matrix for every role and key.
- **Role change:** the workspace switch re-issues the token and reloads, which is the mechanism
  through which the guards and navigation re-read the new role.
