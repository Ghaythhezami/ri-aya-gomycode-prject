---
title: Strict tenant isolation
status: backlog
version: v1
feature: strict-tenant-isolation
product_items: [BP-010]
branch: feature/bp-007-bp-010-bp-011-bp-013
base: main
created: 2026-11-04
updated: 2026-11-04
---

# Strict Tenant Isolation (BP-010)

> **Product item:** `BP-010` · Milestone M2 — Tenancy, people & records · Priority P0 · Brief task MT-3
> **Branch / base:** `feature/bp-007-bp-010-bp-011-bp-013` / `main`

## Overview

- **Problem Statement**: The completed auth/tenancy feature already resolves a tenant scope from
  the verified JWT (`JwtStrategy` re-checks the active membership and fills `TenantContext`), and
  the invitation and suspension paths re-verify attacker-controlled ids inside the caller's
  tenant. Isolation is nevertheless applied by hand: each service writes its own
  `where: { organizationId, clinicId }`, there is no shared helper for future clinic-scoped
  resources, the audit service accepts `organizationId`/`clinicId` from its callers and its read
  path (`listForEntity`) is not tenant-scoped at all, and no test proves that forged tenant ids
  in a body, query string or header cannot widen scope. Refresh tokens also carry no clinic
  scope, so a refresh after a workspace switch silently falls back to the default clinic. No
  patient model exists yet (BP-015), so the backlog's "Clinic A cannot read Clinic B's patient
  data" test has no resource to run against today.
- **Proposed Solution**: Make tenant scoping a single reusable mechanism: one scoped-query helper
  in `TenancyService` that every clinic-scoped query builds from the verified `TenantContext`,
  refactor the existing scoped services onto it, harden the audit write and read paths to use the
  verified scope, and prove with tests that caller-supplied `organizationId`/`clinicId` values in
  body, query and headers are rejected or ignored and that cross-tenant targets stay invisible.
  It also persists the active clinic on the refresh token, so a refresh keeps the selected
  workspace instead of silently changing scope. Patient resources, when BP-015 adds them, adopt
  the same helper; no patient model is created here.
- **Target Audience**: Clinic staff who rely on data not leaking between organizations, and
  server engineers and reviewers who must keep every future clinic-scoped resource isolated by
  construction instead of by memory.
- **Assumptions**:
  1. The tenant scope is resolved only from the verified access token; the global `ValidationPipe`
     (`whitelist`, `forbidNonWhitelisted`) already rejects unknown body fields and is the first
     line of defence against forged identifiers.
  2. `InviteDto.clinicId` and `SwitchWorkspaceDto.clinicId` legitimately name a target clinic;
     both are re-verified against the caller's own memberships, so they are selectors, not scope
     claims.
  3. No patient model exists in `prisma/schema.prisma`; BP-015 introduces it and must adopt this
     helper. The backlog's patient-specific test is therefore exercised against today's
     clinic-scoped resources (invitations, memberships, audit) and extended in BP-015.
  4. `SUPER_ADMIN` is organization-wide by design: it may reach every clinic _inside its own
     organization_, never another organization.
  5. The server authorization controls from the constitution remain authoritative; navigation
     hiding in the backoffice is not a security boundary.
  6. One additive Prisma migration adds a nullable `clinicId` to `refresh_tokens` so a refreshed
     session keeps its workspace. Legacy tokens without a stored clinic keep the current default
     behaviour once and then carry the scope on rotation (CON-109 requires the migration for
     non-local environments).
- **Out of Scope**:
  - The Patient model, patient endpoints and the patient-specific isolation test (BP-015).
  - The permission matrix and front-end route/menu guards (BP-011).
  - Changes to authentication, token issuance, refresh rotation or lockout (completed auth
    feature).
  - Row-level security (PostgreSQL RLS); the application-level scope is the chosen mechanism.

## User Stories

### US-001: My clinic's data is unreachable from another clinic

As a clinic administrator, I want every clinic-scoped read and mutation to be limited to my
verified organization and clinic, so that another tenant can never see or change my data.

**Acceptance Criteria:**

- AC-001: Given an authenticated request with a valid access token, when the request is
  processed, then the tenant scope is the caller's active membership for the token's clinic and
  the role is that membership's role, never the deprecated `user.role`.
- AC-002: Given a request that carries `organizationId` or `clinicId` in the body, query string or
  a header on an endpoint that does not declare it, when validation runs, then the request is
  rejected with 400 or the identifier is ignored, and the resolved scope is unchanged.
- AC-003: Given a clinic-scoped list or read, when it returns data, then every row belongs to the
  caller's verified organization and clinic, and no row from another tenant appears.
- AC-004: Given a scoped mutation whose target id belongs to another organization, when it runs,
  then it is reported as not found (404, never 403) and nothing is changed.
- AC-009: Given a workspace switch, when the session is refreshed, then the issued tokens keep
  the selected clinic instead of falling back to the default clinic; if the stored clinic's
  membership is no longer active, the refresh fails rather than silently changing scope.

### US-002: The mechanism is reusable, not re-implemented

As a server engineer, I want one scoped-query helper, so that a future clinic-scoped resource
inherits isolation instead of re-implementing a filter someone can forget.

**Acceptance Criteria:**

- AC-005: Given a service querying a clinic-scoped model, when it builds its filter, then it uses
  the shared scoped-query helper from `TenancyService`, and no hand-written `organizationId` /
  `clinicId` filter remains in the reviewed clinic-scoped services.
- AC-006: Given a token whose `clinic_id` names a clinic where the caller's membership is absent
  or suspended, when the request is authenticated, then it fails before any handler runs and no
  tenant scope is set.
- AC-007: Given a workspace switch to a clinic the caller does not belong to, when it is
  requested, then the switch is refused and the existing token and scope are unchanged.

### US-003: The audit trail is tenant-scoped

As a security reviewer, I want audit attribution and reads to come from the verified scope, so
that a forged payload cannot attribute an action to another tenant and one tenant cannot read
another's trail.

**Acceptance Criteria:**

- AC-008: Given an audit entry written during a scoped request, then its `organizationId` and
  `clinicId` come from the verified tenant scope, and an audit read returns only entries inside
  the caller's tenant.

## Requirements

### Functional Requirements

- FR-001: Tenant scope MUST be derived only from the verified access token, with the active
  membership re-checked on every request.
- FR-002: The system MUST reject or ignore caller-supplied `organizationId`/`clinicId` values on
  endpoints that do not declare them, in body, query and headers alike.
- FR-003: Every clinic-scoped read MUST filter by the verified organization and clinic.
- FR-004: Every scoped mutation MUST resolve its target inside the caller's tenant and MUST answer
  cross-tenant targets with 404, not 403.
- FR-005: A single scoped-query helper MUST be the way services build clinic-scoped filters.
- FR-006: Workspace switching MUST re-verify the membership for the selected clinic and MUST
  refuse a foreign clinic, and the issued refresh token MUST carry the selected clinic so a
  refresh keeps it.
- FR-007: Audit writes MUST take organization and clinic from the verified scope, and audit reads
  MUST be limited to that scope.
- FR-008: A future clinic-scoped resource MUST be able to adopt the helper and inherit the
  isolation tests; the Patient model in BP-015 is the first intended consumer.
- FR-009: The refresh-token record MUST persist the active clinic, and a refresh MUST re-verify
  that membership and re-issue the same scope, never a different clinic.

### Non-Functional Requirements

- NFR-001: Authorization MUST NOT accept a tenant identifier from the request for scope
  resolution (CON-512).
- NFR-002: Input validation MUST reject undeclared tenant fields rather than silently accepting
  them (CON-515).
- NFR-003: All data access MUST go through Prisma's parameterised client; raw SQL is forbidden
  (CON-516).
- NFR-004: The feature MUST add no dependency; its only schema change is one additive migration
  adding a nullable `clinicId` to `refresh_tokens`.
- NFR-005: Legitimate requests MUST keep their current status codes and responses; this is a
  hardening pass, not a behavioural redesign.
- NFR-006: Cross-tenant tests MUST cover every clinic-scoped endpoint that exists at
  implementation time, not a sample.

## UI/UX & Data Requirements

- **UI/UX**: None. This is a server-side isolation feature; the backoffice gains no screen.
- **Data**: One additive migration adds `refresh_tokens.clinicId` (nullable). The feature also
  constrains how existing `UserMembership`, `Invitation` and `AuditLog` rows are queried, and
  defines the rule future clinic-scoped tables follow.

## Edge Cases & Error States

- EC-001: A token without `org_id`/`clinic_id` → the default active membership is used; if none
  exists, authentication fails with `NO_ACTIVE_MEMBERSHIP`.
- EC-002: A membership is suspended between token issuance and use → the request fails before the
  handler; the token cannot be used for its original clinic.
- EC-003: `SUPER_ADMIN` acting organization-wide → may reach every clinic in its organization,
  never a clinic in another organization.
- EC-004: An invitation names a clinic outside the caller's organization → the target is treated
  as not found; no invitation is created.
- EC-005: A path id from another organization → 404, with no disclosure that the row exists.
- EC-006: `clinic_id` supplied as a query parameter or header → ignored; the token scope wins.
- EC-007: A user with memberships in two organizations → only the active token scope applies.
- EC-008: A workspace switch to a foreign clinic → refused; the current token remains valid.
- EC-009: An audit read for an entity outside the caller's tenant → returns no rows.

## Security Baseline

BP-010 touches authorization and the HTTP surface, so the CON-51x baseline applies. The controls
below are already implemented by the completed auth feature; this feature hardens and proves the
authorization and validation ones.

- CON-511 Authentication: implemented; JWT access tokens and refresh rotation are unchanged.
- CON-512 Authorization: **in scope** — tenant scope from the token only, active membership
  re-checked (FR-001, NFR-001).
- CON-513 Security headers: implemented globally in `main.ts`; unchanged.
- CON-514 Rate limiting: implemented globally; unchanged.
- CON-515 Input validation: **in scope** — undeclared tenant fields are rejected and selectors are
  re-verified (FR-002, NFR-002).
- CON-516 Injection protection: **in scope as a constraint** — Prisma only, no raw SQL
  (NFR-003).
- CON-517 XSS: not applicable — no user-facing markup is added.
- CON-518 CSRF: implemented (HttpOnly `SameSite=Lax` cookie, explicit CORS allow-list);
  unchanged.
- CON-519 Environment security: unchanged; no `.env` change.
- CON-520 HTTPS/HSTS: unchanged.

## Out of Scope

- Patient model and patient endpoints (BP-015); they adopt the helper later.
- RBAC matrix, role-gated routes and menu filtering (BP-011).
- Database row-level security.
- Changes to the authentication flow or token format.

## Dependencies & Risks

- NestJS `JwtStrategy`, `JwtAuthGuard`, `RolesGuard` — reuse; scope resolution already happens in
  the strategy.
- `TenantContext` and `TenancyService` — modify; add the shared scoped-query helper and refactor
  the existing filters onto it.
- `AuditService` — modify; write scope from `TenantContext` and scope `listForEntity`.
- `RefreshToken` model and one Prisma migration — modify; add a nullable `clinicId` and carry the
  active scope across rotation.
- Prisma client — no change; parameterised queries only.
- No new package.

- RISK-001: A future service could bypass the helper and hand-write a weaker filter.
  Mitigation: the rule is documented, the reviewed services are refactored, and the test suite
  enumerates clinic-scoped endpoints.
- RISK-002: Patient isolation cannot be tested until BP-015 exists. Mitigation: the helper and the
  rule are delivered here; BP-015 must add the patient-resource test, recorded as a dependency.
- RISK-003: Returning 403 for a foreign id discloses existence. Mitigation: 404 is required and
  tested (AC-004, EC-005).
- RISK-004: Organization-wide roles must not be narrowed by accident. Mitigation: the helper takes
  the verified scope, including the organization-wide case, and tests cover both.
- RISK-005: Legacy refresh tokens predate the `clinicId` column and would rotate once without a
  stored scope. Mitigation: the column is nullable, a token without a stored clinic keeps the
  current default behaviour for that one rotation, and the next token carries the scope.
