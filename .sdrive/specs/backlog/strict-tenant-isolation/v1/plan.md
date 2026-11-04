---
title: Strict tenant isolation — Technical Plan
status: backlog
version: v1
feature: strict-tenant-isolation
productItems: [BP-010]
branch: feature/bp-007-bp-010-bp-011-bp-013
created: 2026-11-04
updated: 2026-11-04
---

# Strict Tenant Isolation — Technical Plan

## 1. Architecture

### 1.1 Approach

Tenant scope already exists and is mostly correct: `JwtStrategy` resolves the scope from the
verified token's `clinic_id`, re-checks that the membership is ACTIVE, and fills the per-request
`TenantContext`; `TenantContextMiddleware` opens one frame for every route; `RolesGuard` reads the
active membership's role. Two things are missing: a single reusable filter so future clinic-scoped
services cannot forget the tenant predicate, and a fix for the refresh-token scope defect (D5)
where a refresh after a workspace switch falls back to the default clinic.

The plan therefore:

1. Adds scoped-filter helpers to `TenancyService` (`clinicFilter()`, `organizationFilter()`, and
   `assertClinicInScope()`), documented as the required way to build a clinic-scoped query.
2. Refactors the existing hand-written filters (`OnboardingService.listPendingInvitations`,
   `TenancyService.findMembershipInTenant`) onto the helper.
3. Hardens `AuditService`: writes default `organizationId`/`clinicId` from `TenantContext`, and
   `listForEntity` is tenant-scoped. A non-HTTP caller (seed, unit test) falls back to explicit
   values.
4. Adds a nullable `clinicId` to `refresh_tokens` through one additive Prisma migration; issuance
   and workspace switching persist the active clinic, and refresh re-verifies that membership and
   re-issues the same scope. A legacy token with no stored clinic falls back to the default once,
   then carries the scope on rotation.
5. Proves the rejection/ignore paths with the test agent: the global `ValidationPipe`
   (`whitelist`, `forbidNonWhitelisted`) rejects undeclared body fields, `InviteDto.clinicId` and
   `SwitchWorkspaceDto.clinicId` are selectors re-verified against the caller's memberships, and
   forged tenant ids in query/header are ignored.

No permission-matrix work (BP-011) and no patient model (BP-015) are included.

### 1.2 Existing Asset Check (anti-redundancy)

| Asset                   | Location                                      | Decision                                                                          |
| ----------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| Token scope resolution  | `auth/jwt.strategy.ts`                        | **reuse** — already re-checks the active membership                               |
| Per-request scope frame | `tenancy/tenant-context.ts` + middleware      | **reuse**                                                                         |
| Tenancy reads/writes    | `tenancy/tenancy.service.ts`                  | **modify** — add the scoped-filter helpers, refactor filters                      |
| Invitation queries      | `tenancy/onboarding.service.ts`               | **modify** — use the helper                                                       |
| Cross-tenant 404s       | `tenancy.service.ts` `findMembershipInTenant` | **modify** — use the helper, keep 404                                             |
| Audit write/read        | `audit/audit.service.ts`                      | **modify** — scope from `TenantContext`, tenant-scope reads                       |
| Workspace switch        | `auth/auth.service.ts` `switchWorkspace`      | **modify** — persist the selected clinic on the refresh token                     |
| Refresh rotation        | `auth/auth.service.ts` `refresh`              | **modify** — re-verify and keep the stored clinic; fix D5                         |
| Refresh token model     | `prisma/schema.prisma`                        | **modify** — add nullable `clinicId`, one migration                               |
| Validation pipe         | `main.ts`                                     | **reuse** — `whitelist` + `forbidNonWhitelisted` already reject undeclared fields |
| Selector DTOs           | `InviteDto`, `SwitchWorkspaceDto`             | **modify** — document that `clinicId` is a selector                               |
| Roles guard             | `common/guards/roles.guard.ts`                | **reuse** — unrelated to scope resolution                                         |

No duplicate tenancy mechanism is introduced, and no dependency is added.

### 1.3 Components

| Component            | Action | File                                          | Notes                                       |
| -------------------- | ------ | --------------------------------------------- | ------------------------------------------- |
| `TenancyService`     | modify | `server/src/tenancy/tenancy.service.ts`       | scoped-filter helpers; refactor filters     |
| `OnboardingService`  | modify | `server/src/tenancy/onboarding.service.ts`    | scoped invitation list                      |
| `AuditService`       | modify | `server/src/audit/audit.service.ts`           | scope writes and reads from `TenantContext` |
| `auth.service`       | modify | `server/src/auth/auth.service.ts`             | refresh/switch carry the clinic scope (D5)  |
| `InviteDto`          | modify | `server/src/tenancy/dto/invitation.dto.ts`    | selector documentation                      |
| `SwitchWorkspaceDto` | modify | `server/src/auth/dto/switch-workspace.dto.ts` | selector documentation                      |
| `TenantContext`      | reuse  | `server/src/tenancy/tenant-context.ts`        | unchanged                                   |
| `JwtStrategy`        | reuse  | `server/src/auth/jwt.strategy.ts`             | unchanged                                   |
| `ValidationPipe`     | reuse  | `server/src/main.ts`                          | unchanged                                   |

### 1.4 Tenant-scoped endpoints the tests must enumerate

`GET /invitations`, `POST /invitations`, `PATCH /memberships/:id/suspend`,
`POST /auth/switch-workspace`, `GET /auth/memberships`, and the audit reads. The test agent
(`/sdrive:test`) covers each one; this plan defines the expected outcome, not the test files.

### 1.5 Migration and rollout

One additive migration on `refresh_tokens`:

```sql
ALTER TABLE "refresh_tokens" ADD COLUMN "clinic_id" TEXT;
```

`clinicId` is nullable so existing rows remain valid. The migration is delivered in
`server/prisma/migrations/<timestamp>_refresh_token_scope/` and the client is regenerated with
`prisma generate`. A refresh on a legacy row keeps today's default-scope behaviour for that one
rotation (RISK-005).

## 2. Data model

- Entity `RefreshToken` — `update`: add `clinicId` (`String?`, nullable, `add`). No other model
  changes.
- Flow: login issues a refresh token with the active scope's `clinicId`; a workspace switch
  re-issues it with the selected clinic; refresh resolves that membership, rejects an inactive
  one, and rotates with the same clinic. Legacy rows with `clinicId = null` fall back to the
  default scope once.

## 3. Phases

| Phase | Name                | Purpose                                                              |
| ----- | ------------------- | -------------------------------------------------------------------- |
| P1    | Scoped-query helper | helpers, refactor invitation/membership filters, tenant-scoped audit |
| P2    | Forged ids and 404s | validation path, selector DTO documentation, cross-tenant 404s       |
| P3    | Refresh scope       | migration, issuance/switch/refresh carry the clinic, D5 fixed        |
| P4    | Verification        | lint, typecheck, prisma generate, verify, governance                 |

## 4. Dependencies

No dependency is added. Prisma, NestJS and the existing guards are reused.

## 5. Risks

- **R-P1 (RISK-001)**: a future service bypasses the helper. Mitigation: documented rule, refactor
  of every current filter, and cross-tenant tests enumerating clinic-scoped endpoints.
- **R-P2 (RISK-002)**: patient isolation is untestable until BP-015. Mitigation: helper and rule
  ship here; BP-015 adds the patient-resource test.
- **R-P3 (RISK-003)**: 403 on a foreign id leaks existence. Mitigation: 404 is required and tested.
- **R-P4 (RISK-004)**: organization-wide roles narrowed by accident. Mitigation: the helper takes
  the verified scope including the organization-wide case.
- **R-P5 (RISK-005)**: legacy refresh tokens have no clinic. Mitigation: nullable column and a
  one-rotation fallback.
