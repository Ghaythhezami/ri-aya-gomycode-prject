---
title: Strict tenant isolation — Tasks
status: backlog
version: v1
feature: strict-tenant-isolation
branch: feature/bp-007-bp-010-bp-011-bp-013
created: 2026-11-04
updated: 2026-11-04
---

# Tasks — Strict Tenant Isolation (BP-010)

Production code only. Test authoring and execution belong to `/sdrive:test`.

## P1 — Scoped-query helper

- [x] T1.1 — Add `clinicFilter()`, `organizationFilter()` and `assertClinicInScope()` to `TenancyService`, built from `TenantContext` and documented as the required filter for every clinic-scoped query. (FR-001, FR-005, FR-008, NFR-001)
- [x] T1.2 — Refactor `OnboardingService.listPendingInvitations` and `TenancyService.findMembershipInTenant` onto the helper and remove the hand-written organization/clinic filters. (FR-003, FR-005, NFR-003)
- [x] T1.3 — Harden `AuditService`: write `organizationId`/`clinicId` from `TenantContext` by default (explicit values still work for non-HTTP callers) and tenant-scope `listForEntity`. (FR-007, NFR-003, AC-008)

## P2 — Forged identifiers and cross-tenant responses

- [x] T2.1 — Verify and document the rejection path: the global `ValidationPipe` uses `whitelist` and `forbidNonWhitelisted`, and `InviteDto.clinicId` / `SwitchWorkspaceDto.clinicId` are selectors re-verified against the caller's memberships. Add the Swagger descriptions that say so. (FR-002, NFR-002, AC-002)
- [x] T2.2 — Keep cross-tenant mutations at 404: route `findMembershipInTenant` through the helper and confirm an invitation target outside the caller's organization is treated as not found. (FR-004, NFR-005, AC-004)

## P3 — Workspace switch and refresh scope

- [x] T3.1 — Confirm `switchWorkspace` re-verifies the membership for the selected clinic and refuses a foreign clinic; refactor any hand-built tenant filter onto the helper. (FR-006, AC-007)
- [x] T3.2 — Add a nullable `clinicId` to `RefreshToken` with one additive Prisma migration; persist the active clinic on login and switch, re-verify it on refresh and re-issue the same scope, reject an inactive membership, and keep the one-rotation default for legacy rows. (FR-006, FR-009, AC-009)

## P4 — Verification

- [x] T4.1 — Run `pnpm --filter server lint`, `tsc --noEmit`, `pnpm --filter server exec prisma generate`, `sdrive verify strict-tenant-isolation` and `node .sdrive/scripts/validate-governance.js`; all must pass. Do not run the test suite. (NFR-004, NFR-005)
- [x] T4.2 — Grep the server source for raw SQL (`$queryRaw`, `$executeRaw`) and confirm no dependency or lockfile change; record the result. (NFR-003, NFR-004)

The cross-tenant tests for every clinic-scoped endpoint are authored by `/sdrive:test`, which fills
`traceability.json` `testIds`; no task here writes or runs them.
