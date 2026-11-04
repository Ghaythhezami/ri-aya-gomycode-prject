---
title: Role-based access control and clinic scoping
status: backlog
version: v1
feature: role-based-access-control-and-clinic-scoping
product_items: [BP-011]
branch: feature/bp-007-bp-010-bp-011-bp-013
base: main
created: 2026-11-04
updated: 2026-11-04
---

# Role-Based Access Control and Clinic Scoping (BP-011)

> **Product item:** `BP-011` · Milestone M2 — Tenancy, people & records · Priority P0 · Brief task AUTH-2
> **Branch / base:** `feature/bp-007-bp-010-bp-011-bp-013` / `main`

## Overview

- **Problem Statement**: The role primitives exist — `UserRole` (SUPER_ADMIN, CLINIC_ADMIN,
  DOCTOR, RECEPTIONIST), `@Roles()`, `RolesGuard`, `RoleRoute` and the backoffice `NAV_ROLES`
  map — but enforcement is inconsistent. Only `UsersController` applies `@Roles`; the invitation
  and suspension endpoints check roles by hand inside the controller/service, and every future
  controller can forget the guard entirely. The client keeps its own role map (`NAV_ROLES`) that
  is not derived from any server source, `RoleRoute` silently redirects an unauthorised user to
  `/` with no explanation, and no document states which role may do what.
- **Proposed Solution**: Make one role matrix the source of truth in the existing
  `@riaya/shared` package (server and backoffice both consume it), apply the matrix through the
  existing `@Roles()` + `RolesGuard` on every role-sensitive endpoint, delete the hand-written
  role checks, and give the backoffice a localized 403 page instead of a silent redirect.
  Tenant scoping remains BP-010's job: a role failure is 403, a tenant failure stays 404.
- **Target Audience**: All four backoffice roles and the API surface that serves them; reviewers
  who need to see one authoritative matrix instead of scattered conditionals.
- **Assumptions**:
  1. The four roles in `server/src/users/user-role.enum.ts` are exhaustive for this release; a
     role absent from a matrix entry is denied (fail closed), never allowed by default.
  2. `packages/shared` is already a dependency of both `server` and `backoffice`; adding a
     framework-free permissions module there does not violate CON-106 because it is a shared
     library, not application-source cross-imports.
  3. Public endpoints (register, accept-invite, login, refresh, forgot/reset password, health,
     Swagger) stay unauthenticated and are classified explicitly in the matrix.
  4. Tenant isolation (BP-010) and shell rendering (BP-007) are separate: this feature decides
     _who_ may call a capability; BP-010 decides _which tenant's data_ it touches; BP-007 decides
     how navigation renders the result.
  5. Clinical screens and their finer-grained rules arrive in later features; this feature
     defines the matrix and the four roles it must cover.
- **Out of Scope**:
  - Tenant filtering and refresh-token scope (BP-010).
  - Shell layout, collapsed rail and breadcrumbs (BP-007).
  - Field-level permissions, per-clinic custom roles, or delegated administration (later
    features).
  - Changes to authentication, token issuance or invitations themselves.

## User Stories

### US-001: One matrix decides who may do what

As a security reviewer, I want one documented role matrix consumed by the API and the
backoffice, so that a permission cannot mean one thing on the server and another in the UI.

**Acceptance Criteria:**

- AC-001: Given the shared permissions module, when a role-sensitive endpoint is defined, then
  its allowed roles come from that module through `@Roles()`, and no hand-written role comparison
  remains in the reviewed controllers or services.
- AC-002: Given a permitted role, when it calls a protected endpoint, then the request reaches the
  handler; given a role outside the allowed set, then the request fails with 403 `FORBIDDEN`
  before the handler runs.
- AC-003: Given the matrix, when it is reviewed, then every endpoint is classified as public,
  authenticated-any, or role-gated, and no endpoint is left unclassified.
- AC-004: Given the matrix, when it is changed once, then both the server guard and the backoffice
  navigation/guards reflect the change without a second edit.

### US-002: The interface explains a refusal

As a staff member, I want a clear page when my role cannot open a screen, so that I know why I was
stopped instead of being bounced silently.

**Acceptance Criteria:**

- AC-005: Given an authenticated user opening a route their role cannot access, when the route
  guard runs, then a localized 403 page is shown with a link back to an allowed destination, and
  no silent redirect to `/` occurs.
- AC-006: Given the backoffice navigation, when it renders for a role, then it shows exactly the
  destinations the matrix allows for that role and hides the rest; every shown destination is
  allowed by the same matrix.
- AC-007: Given the 403 page in en, ar or fr, then its text is translated, mirrors under RTL, and
  uses the shell tokens and primitives.

### US-003: Role changes do not leave stale access

As a user who switches workspace and role, I want the guards and navigation to reflect my new
role, so that I neither keep a permission I lost nor lose one I gained.

**Acceptance Criteria:**

- AC-008: Given a workspace switch that changes the user's role, when the session reloads, then
  the route guards and navigation reflect the new role, with no stale entry from the previous
  role.
- AC-009: Given a role that does not exist in the matrix, when any protected endpoint or guarded
  route is evaluated, then access is denied rather than allowed by default.

## Requirements

### Functional Requirements

- FR-001: A single framework-free role matrix MUST live in `@riaya/shared` and define every
  capability and route policy for the four roles.
- FR-002: Every role-sensitive endpoint MUST enforce the matrix through `@Roles()` and
  `RolesGuard`; hand-written role comparisons MUST be removed.
- FR-003: A role failure MUST return 403 `FORBIDDEN` before the handler; a tenant failure remains
  BP-010's 404, so the two are never conflated.
- FR-004: Every endpoint MUST be classified as public, authenticated-any, or role-gated.
- FR-005: The backoffice navigation and route guards MUST consume the same matrix, with
  `NAV_ROLES` derived from it rather than maintained separately.
- FR-006: An authenticated but unauthorised route MUST render a localized 403 page with a way
  back, not a silent redirect.
- FR-007: An unknown or missing role MUST fail closed for both the API and the guarded routes.
- FR-008: A workspace switch that changes the role MUST leave the guards and navigation reflecting
  the new role after reload.

### Non-Functional Requirements

- NFR-001: The server MUST remain the authorization boundary; client hiding is never sufficient
  (CON-512).
- NFR-002: The feature MUST add no dependency; it uses the existing `@riaya/shared` package,
  `@Roles`, `RolesGuard` and `RoleRoute`.
- NFR-003: Every role-gated endpoint MUST be covered by a role-by-role test (authored by
  `/sdrive:test`).
- NFR-004: A 403 for a role failure MUST NOT reveal whether a tenant-scoped row exists; tenant
  lookups remain 404 (BP-010).
- NFR-005: Changing a permission MUST be a one-line change in the shared matrix, with no second
  copy in either application.
- NFR-006: The 403 page MUST meet WCAG 2.1 AA, be localized in en/ar/fr, and use logical
  direction utilities.

## UI/UX & Data Requirements

- **UI/UX**: A localized Forbidden page inside the shell, with a short explanation and a button
  back to an allowed route. Navigation continues to show only allowed destinations.
- **Data**: No persistence change. The shared matrix is code, not data; `UserRole` remains the
  only role type and is imported from the shared package where practical.

## Edge Cases & Error States

- EC-001: Unauthenticated user opens a protected route → sent to login by `ProtectedRoute`, never
  the 403 page.
- EC-002: Authenticated user with the wrong role opens a protected route → 403 page; no data
  request is issued for that screen.
- EC-003: A role string missing from the matrix → denied (fail closed).
- EC-004: A workspace switch changes the role → navigation and guards reflect the new role after
  reload.
- EC-005: A public endpoint is called with a valid token → it remains public; the token does not
  narrow or widen it.
- EC-006: A role-gated endpoint receives a foreign tenant id → role check passes or fails first;
  a permitted role with a foreign id still gets 404, never data.
- EC-007: A matrix entry is missing for a new endpoint → deny, and the gap is visible in review.
- EC-008: A deep link to a forbidden route → the 403 page renders inside the shell with a working
  back link.

## Security Baseline

BP-011 is an authorization feature, so CON-512 is in scope; the rest of the baseline is already
implemented and unchanged.

- CON-511 Authentication: implemented; unchanged.
- CON-512 Authorization: **in scope** — one matrix, enforced server-side, fail-closed (FR-001,
  FR-002, FR-007, NFR-001).
- CON-513 Security headers: implemented; unchanged.
- CON-514 Rate limiting: implemented; unchanged.
- CON-515 Input validation: implemented; unchanged by this feature.
- CON-516 Injection protection: unchanged; no data access is added.
- CON-517 XSS: the 403 page renders React-escaped localized text; no raw HTML.
- CON-518 CSRF: unchanged; no state-changing route is added.
- CON-519/520 Environment and transport: unchanged.

## Out of Scope

- Tenant scoping and refresh-token scope (BP-010).
- Shell layout and navigation rendering (BP-007).
- Field-level permissions, custom roles, delegated administration.
- Authentication, invitations and token issuance.

## Dependencies & Risks

- `@riaya/shared` — modify; add the framework-free permissions module.
- `RolesGuard` and `@Roles()` — reuse; extend their application to every role-sensitive
  endpoint.
- `RoleRoute` — modify; render the 403 page instead of redirecting.
- Backoffice `roles.ts` / `NAV_ROLES` — modify; derive from the shared matrix.
- Forbidden page and i18n strings — create/modify.
- No new package.

- RISK-001: The shared matrix drifts from the actual endpoint list as controllers are added.
  Mitigation: every endpoint is classified (FR-004) and the review checks the inventory.
- RISK-002: A manual role check survives the refactor and disagrees with the matrix.
  Mitigation: remove the checks, and tests exercise each role against each protected endpoint.
- RISK-003: The 403 page leaks which routes exist. Mitigation: it is generic and shows no route
  data.
- RISK-004: Client and server disagree during a role change. Mitigation: one matrix and a reload
  after workspace switch (AC-008).
