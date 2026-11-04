---
title: Role-based access control and clinic scoping — Tasks
status: backlog
version: v1
feature: role-based-access-control-and-clinic-scoping
branch: feature/bp-007-bp-010-bp-011-bp-013
created: 2026-11-04
updated: 2026-11-04
---

# Tasks — Role-Based Access Control and Clinic Scoping (BP-011)

Production code only. Test authoring and execution belong to `/sdrive:test`.

## P1 — Shared matrix and server enforcement

- [ ] T1.1 — Add `packages/shared/src/permissions.ts` with the four roles, the capability list, `CAPABILITY_ROLES`, and `can(role, capability)`; export it from the package index. (FR-001, FR-007, NFR-005)
- [ ] T1.2 — Update `@Roles()` and `RolesGuard` to accept the shared role-name list and deny when the role is missing, unknown, or not listed (fail closed). (FR-002, FR-003, FR-007, NFR-001)
- [ ] T1.3 — Apply the matrix to `UsersController` (staff creation) and `TenancyController` (invite, suspend), delete `assertCanInvite` and the hand-written suspend role branch, and record the endpoint classification in the plan. (FR-002, FR-003, FR-004, NFR-004)
- [ ] T1.4 — Verify every endpoint listed in plan §1.4 is classified and guarded; a role-gated endpoint without `@Roles` fails review. (FR-004, NFR-001)

## P2 — Backoffice consumes the matrix

- [ ] T2.1 — Derive `NAV_ROLES` and `canSee` in `backoffice/src/auth/roles.ts` from the shared capabilities, removing the hand-maintained arrays. (FR-005, NFR-005)
- [ ] T2.2 — Change `RoleRoute` to take a capability, update `App.tsx` route guards, and keep unauthenticated handling in `ProtectedRoute`. (FR-005, FR-006)

## P3 — 403 page and role changes

- [ ] T3.1 — Add `ForbiddenPage.tsx` inside the shell with a localized explanation and a back link; render it from `RoleRoute` instead of redirecting. (FR-006, AC-005)
- [ ] T3.2 — Add the forbidden strings to `en`, `ar` and `fr`, and verify RTL/logical utilities on the page. (AC-007, NFR-006)
- [ ] T3.3 — Confirm a workspace-switch role change leaves the guards and navigation on the new role after reload, with no stale capability. (FR-008, AC-008)

## P4 — Verification

- [ ] T4.1 — Run `pnpm --filter server lint`, `pnpm --filter backoffice lint`, both typechecks, `pnpm --filter @riaya/shared build`, `sdrive verify role-based-access-control-and-clinic-scoping` and `node .sdrive/scripts/validate-governance.js`; all must pass. Do not run the test suite. (NFR-002)
- [ ] T4.2 — Grep the server and backoffice for surviving role comparisons and duplicate role maps, and confirm no dependency or lockfile change; record the result. (FR-002, NFR-002, NFR-005)

The role-by-role endpoint tests are authored by `/sdrive:test`, which fills `traceability.json`
`testIds`; no task here writes or runs them.
