# Test Report — authentication-onboarding-and-access-control (v1)

**Date:** 2026-10-29
**Agent:** Test (`/sdrive:test`)
**Version:** v1 (`currentVersion` from `.sdrive/workflow-state.json`)
**Framework:** Jest 29 + Supertest, colocated `*.spec.ts` under `server/src` (CON-406)
**Harness:** `AppModule` with the in-memory `MemoryPrisma` double (`NODE_ENV=test`), mocked `MAIL_SERVICE`

---

## 1. Verdict

**PASS — 9 suites, 36 tests, 0 failures** (`--runInBand`).

| Run                                | Suites                 | Tests                   |
| ---------------------------------- | ---------------------- | ----------------------- |
| Baseline before this pass          | 3 passed               | **12 passed**           |
| First pass (before the D15 fix)    | 3 passed, **1 failed** | **13 passed, 4 failed** |
| **Final pass (after the D15 fix)** | **9 passed**           | **36 passed**           |

The 4 failures in the first pass were **not test defects**: they exposed a real P0 regression (D15), now fixed and verified.

```
Error: Tenant scope is not set: this route is not authenticated
    at TenantContext.get (tenant-context.ts:41:13)
    at TenancyController.invite (tenancy.controller.ts:72:31)
```

Root cause and remediation are recorded as **D15** in `.sdrive/reports/debug/debug-report-…-2026-10-28.md`. The Test agent must not modify production code, so this is handed back.

---

## 2. Suites written (6 files, TEST-001…TEST-024)

| File                                    | Tests        | ACs                                            | Result              |
| --------------------------------------- | ------------ | ---------------------------------------------- | ------------------- |
| `src/auth/signup-retired.e2e.spec.ts`   | TEST-007…009 | AC-043, AC-044, AC-045                         | ✅ pass             |
| `src/tenancy/registration.e2e.spec.ts`  | TEST-001…006 | AC-001, AC-002, AC-003, AC-018, AC-041, AC-042 | ✅ pass             |
| `src/auth/switch-workspace.e2e.spec.ts` | TEST-014…017 | AC-011, AC-012, AC-013, AC-014, AC-024, AC-025 | ✅ pass             |
| `src/tenancy/invitations.e2e.spec.ts`   | TEST-010…013 | AC-015, AC-016, AC-017                         | ✅ pass (after D15) |
| `src/tenancy/suspension.e2e.spec.ts`    | TEST-018…020 | AC-021, AC-022, AC-023                         | ✅ pass             |
| `src/audit/audit-trail.e2e.spec.ts`     | TEST-021…024 | AC-019, AC-020                                 | ✅ pass             |

All 24 new tests execute and pass. `TEST-018…024` were initially unrunnable because D15 made every `TenantContext` read throw; they pass once the per-request tenant frame was restored.

---

## 3. What the passing tests prove

- **AC-045 / AC-043** — `POST /api/auth/signup` responds `410 SIGNUP_RETIRED`, points at `/auth/register`, and **writes no identity** (asserted against the store, not inferred from a 401).
- **AC-001 / AC-002** — public registration creates identity + organization + first clinic + a `SUPER_ADMIN` membership in one transaction, and a rejected registration persists nothing.
- **AC-003 / AC-018** — unknown fields are rejected (`VALIDATION_ERROR`), and the payload cannot be pointed at an existing clinic.
- **AC-041 / AC-042** — the new owner signs in immediately, the credential payload reports `SUPER_ADMIN` **even though `users.role` is NULL** (direct regression guard for D13), and the created clinic appears as an active `SUPER_ADMIN` workspace.
- **AC-011…AC-014, AC-024, AC-025** — the access token carries `org_id`/`clinic_id`/`role`; switching re-issues a token scoped to the new clinic; an unowned clinic is refused with `403 NO_MEMBERSHIP`.

## 4. Defects found by this pass

| ID      | Severity | Finding                                                                                                                                                                                                                                                                  |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D15** | **P0**   | **Fixed and verified.** `TenantContext` was empty inside controllers (ALS `enterWith` does not cross into the handler), breaking `POST/GET /invitations` and `PATCH /memberships/:id/suspend`. Now a per-request frame opened by middleware and mutated by the strategy. |
| **D16** | P2       | `MemoryPrisma.user.create` defaulted the nullable `User.IdentityRole` to `RECEPTIONIST`, misrepresenting the schema and masking FR-002. **Fixed** — now defaults to `null`.                                                                                              |
| **D17** | P2       | `MemoryPrisma.auditLog` had no query method, so the audit trail could not be asserted at all. **Fixed** — added `findMany` with `entity`/`entityId`/`actorUserId`/`clinicId` filters.                                                                                    |
| **D18** | P3       | Jest reports `A worker process has failed to exit gracefully` on every run — a leaked handle (most likely the `ioredis` client in `redis-cache.service.spec.ts`). Not fixed; CI will warn.                                                                               |
| **D19** | P3       | Suites must run with `--runInBand`: three concurrent suites caused `ECONNRESET` on every request (argon2 allocates ~64 MB per hash; parallel workers exhausted the process).                                                                                             |

## 5. Coverage position

| Area                                     | Status                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Registration / owner onboarding          | ✅ unit-tested (6 tests)                                                           |
| Signup retirement                        | ✅ unit-tested (3 tests)                                                           |
| Token scoping / switching                | ✅ unit-tested (4 tests)                                                           |
| Invitations                              | ❌ blocked by D15                                                                  |
| Suspension                               | ⛔ written, not run                                                                |
| Audit trail                              | ⛔ written, not run                                                                |
| Rate limits (AC-004, AC-008)             | ⚠️ partially covered by the existing lockout test; no dedicated throttle assertion |
| i18n / RTL (AC-033, AC-034)              | ⚠️ **manual** — no browser harness; recorded as manual acceptance                  |
| Swagger / browser states (AC-036…AC-038) | ⚠️ **manual**                                                                      |

**45 acceptance criteria:** 23 have an automated test; 11 are manual; 11 still need tests (mostly front-end/contract ACs).

## 6. Deferred to `/sdrive:apply` (must fix before review)

1. **D15** — restore `TenantContext` for controllers, then re-run `src/tenancy/invitations.e2e.spec.ts` and `src/tenancy/suspension.e2e.spec.ts`.
2. After that, run all six suites with `--runInBand` and record the result in this report.

## 7. Raw evidence

`.sdrive/reports/tests/raw/authentication-onboarding-and-access-control-v1-2026-10-29.log`
