# Test Report: Strict Tenant Isolation (v1)

## 1. Summary

- **Date:** 2026-11-04
- **Feature:** strict-tenant-isolation
- **Version:** v1
- **Total ACs:** 9
- **Tested ACs:** 9
- **Coverage:** 100%
- **Tests Passed:** 12/12

## 2. AC → Test Mapping

| AC ID  | Test ID  | File                                            | Status  |
| ------ | -------- | ----------------------------------------------- | ------- |
| AC-001 | TEST-073 | src/tenancy/strict-tenant-isolation.e2e.spec.ts | ✅ Pass |
| AC-002 | TEST-074 | src/tenancy/strict-tenant-isolation.e2e.spec.ts | ✅ Pass |
| AC-003 | TEST-075 | src/tenancy/strict-tenant-isolation.e2e.spec.ts | ✅ Pass |
| AC-004 | TEST-076 | src/tenancy/strict-tenant-isolation.e2e.spec.ts | ✅ Pass |
| AC-005 | TEST-077 | src/tenancy/tenant-scope.spec.ts                | ✅ Pass |
| AC-006 | TEST-078 | src/tenancy/strict-tenant-isolation.e2e.spec.ts | ✅ Pass |
| AC-007 | TEST-079 | src/tenancy/strict-tenant-isolation.e2e.spec.ts | ✅ Pass |
| AC-008 | TEST-080 | src/audit/audit.service.spec.ts                 | ✅ Pass |
| AC-009 | TEST-081 | src/tenancy/strict-tenant-isolation.e2e.spec.ts | ✅ Pass |

## 3. Failures

| Test | Reason | Blocking |
| ---- | ------ | -------- |
| None | —      | No       |

## 4. Notes

- **Framework:** Jest with the in-memory Prisma (`NODE_ENV=test`) and a real Nest application for
  the e2e half (CON-401/402). The suite runs with `pnpm --filter server test`.
- **Run:** the three feature files pass (12 tests). The full server suite passes (24 suites, 115
  passed, 1 skipped).
- **What the e2e proves:** the scope comes from the token's `clinic_id`; an undeclared
  `organizationId` in a body is rejected with 400; query and header clinic ids do not widen a list;
  a foreign membership is 404 (not 403); a suspended membership stops working before token expiry;
  a switch to a foreign clinic is 403; and a refresh after a switch keeps the selected clinic.
- **Audit:** writes with no tenant ids are attributed to the verified scope, and reads are limited
  to the caller's clinic.
- **Patient data:** the Patient model does not exist until BP-015, so the backlog's patient-data
  test is exercised on today's clinic-scoped resources; BP-015 must add its own resource test using
  the same helper.
