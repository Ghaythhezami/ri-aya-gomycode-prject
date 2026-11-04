---
title: Role-based access control and clinic scoping — Technical Plan
status: backlog
version: v1
feature: role-based-access-control-and-clinic-scoping
productItems: [BP-011]
branch: feature/bp-007-bp-010-bp-011-bp-013
created: 2026-11-04
updated: 2026-11-04
---

# Role-Based Access Control and Clinic Scoping — Technical Plan

## 1. Architecture

### 1.1 Approach

One framework-free matrix in `@riaya/shared` becomes the only place a capability is mapped to
roles. Both applications consume it:

- **Server** — controllers pass the matrix entry to the existing `@Roles()` decorator and
  `RolesGuard` enforces it before the handler. Hand-written checks (`assertCanInvite`, the
  suspend-role branch) are deleted. A role failure is 403 `FORBIDDEN`; tenant failures stay
  BP-010's 404.
- **Backoffice** — `NAV_ROLES` and `canSee` derive from the same matrix, `RoleRoute` takes a
  capability instead of a raw role list, and an authenticated-but-unauthorised route renders a
  localized `ForbiddenPage` inside the shell.

The matrix is capability-based, not path-based, so the shared package does not depend on either
app's routes. `UserRole` stays the four-string union; the server's Prisma enum keeps its own
generated type, and the guard compares the same string values.

### 1.2 Existing Asset Check (anti-redundancy)

| Asset                      | Location                                            | Decision                                            |
| -------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `@Roles()` decorator       | `server/src/common/decorators/roles.decorator.ts`   | **modify** — accept the shared role-name list       |
| `RolesGuard`               | `server/src/common/guards/roles.guard.ts`           | **modify** — compare string role names, fail closed |
| Users endpoint roles       | `server/src/users/users.controller.ts`              | **modify** — use the matrix entry                   |
| Tenancy role checks        | `tenancy.controller.ts`, `onboarding.service.ts`    | **modify** — use `@Roles`, delete manual checks     |
| Backoffice role map        | `backoffice/src/auth/roles.ts`                      | **modify** — derive from the shared matrix          |
| Route guard                | `backoffice/src/auth/RoleRoute.tsx`                 | **modify** — capability prop, 403 page              |
| Routes                     | `backoffice/src/App.tsx`                            | **modify** — capability props                       |
| Shared package             | `packages/shared/src/index.ts`                      | **modify** — export the permissions module          |
| Shell tokens/Button        | `backoffice/src/design-system`, `common/Button.tsx` | **reuse** for the 403 page                          |
| Authentication/invitations | `auth/`, `tenancy/` services                        | **reuse** — not redesigned here                     |

### 1.3 Components

| Component           | Action | File                                              | Notes                                            |
| ------------------- | ------ | ------------------------------------------------- | ------------------------------------------------ |
| `permissions`       | create | `packages/shared/src/permissions.ts`              | roles, capabilities, `CAPABILITY_ROLES`, `can()` |
| `RolesGuard`        | modify | `server/src/common/guards/roles.guard.ts`         | string role names, fail closed                   |
| `Roles`             | modify | `server/src/common/decorators/roles.decorator.ts` | accept the shared role-name type                 |
| `UsersController`   | modify | `server/src/users/users.controller.ts`            | matrix entry for staff creation                  |
| `TenancyController` | modify | `server/src/tenancy/tenancy.controller.ts`        | `@Roles` on invite and suspend                   |
| `OnboardingService` | modify | `server/src/tenancy/onboarding.service.ts`        | remove `assertCanInvite`                         |
| `roles`             | modify | `backoffice/src/auth/roles.ts`                    | `NAV_ROLES` derived from the matrix              |
| `RoleRoute`         | modify | `backoffice/src/auth/RoleRoute.tsx`               | capability prop, render `ForbiddenPage`          |
| `App`               | modify | `backoffice/src/App.tsx`                          | capability-based guards                          |
| `ForbiddenPage`     | create | `backoffice/src/pages/ForbiddenPage.tsx`          | localized 403 inside the shell                   |
| `Button`            | reuse  | `backoffice/src/common/Button.tsx`                | back link on the 403 page                        |
| `tokens`            | reuse  | `backoffice/src/design-system/tokens.ts`          | styling for the 403 page                         |

### 1.4 Endpoint classification (the matrix must cover all of these)

| Class             | Endpoints                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public            | `POST /auth/register`, `POST /auth/accept-invite`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /health`, Swagger |
| Authenticated-any | `GET /auth/me`, `GET /auth/memberships`, `POST /auth/switch-workspace`, `POST /organizations`, `GET /invitations`                                                                                   |
| Role-gated        | `POST /users` (SUPER_ADMIN, CLINIC_ADMIN), `POST /invitations` (SUPER_ADMIN, CLINIC_ADMIN), `PATCH /memberships/:id/suspend` (SUPER_ADMIN, CLINIC_ADMIN)                                            |

A new endpoint that fits none of these classes is a review failure (FR-004).

### 1.5 Fail-closed rule

`RolesGuard` denies when the required list is empty, the user has no role, or the role is not in
the list. `can(role, capability)` returns false for an unknown capability or role. `RoleRoute`
renders the 403 page for an authenticated user whose role cannot see the route; unauthenticated
users are still handled by `ProtectedRoute` (login).

## 2. Data model

No persistence change. The matrix is code in `@riaya/shared`. No Prisma model or migration is
touched.

## 3. Phases

| Phase | Name                                 | Purpose                                                                |
| ----- | ------------------------------------ | ---------------------------------------------------------------------- |
| P1    | Shared matrix and server enforcement | permissions module, guard/Decorator, controllers, delete manual checks |
| P2    | Backoffice consumes the matrix       | derived `NAV_ROLES`, capability route guards                           |
| P3    | 403 page and role changes            | `ForbiddenPage`, i18n, role-change refresh                             |
| P4    | Verification                         | lint, typecheck, build shared, verify, governance                      |

## 4. Dependencies

No dependency is added. `@riaya/shared` is already a dependency of both apps; `react-router-dom`
and `lucide-react` are reused.

## 5. Risks

- **R-P1 (RISK-001)**: the matrix drifts from the endpoint list. Mitigation: the classification
  table above is part of review, and a new endpoint must be added to it.
- **R-P2 (RISK-002)**: a manual role check survives. Mitigation: delete `assertCanInvite` and the
  suspend branch; the test agent exercises every role.
- **R-P3 (RISK-003)**: the 403 page leaks route data. Mitigation: generic copy, no path display.
- **R-P4 (RISK-004)**: stale client role after a switch. Mitigation: the workspace switch reloads,
  and the matrix is read from the reloaded session.
