---
title: Authentication, Onboarding & Access Control — Technical Plan
feature: authentication-onboarding-and-access-control
version: v1
status: backlog
created: 2026-10-28
updated: 2026-10-28
---

# Technical Plan

## Architecture Approach

Extend the existing NestJS auth module into a tenancy-aware authority. A new tenancy layer (organizations, clinics, user_memberships) separates global identity from per-clinic membership. The access token carries org_id, clinic_id and role resolved from the active membership, and a request-scoped tenant context is built only from the verified token so no request body can widen scope. Redis becomes required infrastructure for security state (lockout counters and the refresh-token blacklist) under a strict, fail-closed mode, while ordinary caching keeps its in-memory fallback. Registration, invitation, workspace switching and auditing are added as services behind the existing guards and the global validation pipe.

## Components

| Component                 | Action | Role                                                                                                                                            |
| ------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth module`             | modify | Adds register, switch-workspace, invitation and tenancy-aware token issuance alongside the existing login, refresh, logout and password routes. |
| `tenancy module`          | create | Owns organizations, clinics, memberships, invitations and their services and DTOs.                                                              |
| `audit module`            | create | Owns the transactional audit writer and the append-only audit log.                                                                              |
| `tenant context provider` | create | Request-scoped holder populated exclusively from the verified token, read by every scoped query.                                                |
| `RedisCacheService`       | modify | Adds a strict mode and atomic counter operations used by security paths; keeps the degraded in-memory path for caching only.                    |
| `token blacklist store`   | create | Redis-backed revocation store keyed by token hash with TTL equal to the token remaining life.                                                   |
| `login attempt store`     | create | Redis-backed atomic failure counter with TTL backing the lockout policy.                                                                        |
| `RolesGuard`              | modify | Reads the active role from the membership claim instead of the user record.                                                                     |
| `JWT strategy`            | modify | Validates the tenancy claims and rejects tokens whose membership is no longer active.                                                           |
| `mail module`             | modify | Adds invitation and password-reset templates in EN, AR and FR.                                                                                  |
| `backoffice auth pages`   | modify | Adds the registration wizard, accept-invitation screen, workspace switcher and staff directory.                                                 |
| `i18n catalogues`         | modify | Adds auth strings for EN, AR and FR in both front ends.                                                                                         |
| `docker-compose`          | modify | Adds the Redis service the security state depends on.                                                                                           |

## Data Model

A registration request opens one transaction that creates the identity, the organization, the first clinic and a SUPER_ADMIN membership, then issues a scoped token. Login verifies the argon2 hash, consults the Redis failure counter and lockout expiry, resolves the active membership, and issues an access token carrying org_id, clinic_id and role plus a rotating refresh token whose hash is stored and whose revocation is mirrored into the Redis blacklist. Switching workspace verifies an active membership for the requested clinic and re-issues a scoped token, rotating the refresh token for the new scope. Invitations are stored as a hashed single-use token; acceptance consumes it and grants exactly the recorded membership. Every create, update and delete writes an audit row inside the same transaction as the mutation.

| Entity           | Action    | Fields changed                                                                                                                                            |
| ---------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`           | update    | role (remove), failedLoginCount (remove), failedLoginWindowStart (remove), lockedUntil (remove), memberships (add)                                        |
| `Organization`   | create    | id (add), name (add), slug (add), createdAt (add), updatedAt (add), clinics (add), memberships (add)                                                      |
| `Clinic`         | create    | id (add), organizationId (add), name (add), timezone (add), currency (add), address (add), createdAt (add), updatedAt (add)                               |
| `UserMembership` | create    | id (add), userId (add), organizationId (add), clinicId (add), role (add), status (add), createdAt (add), updatedAt (add)                                  |
| `Invitation`     | create    | id (add), email (add), clinicId (add), role (add), tokenHash (add), expiresAt (add), consumedAt (add), invitedById (add), createdAt (add)                 |
| `AuditLog`       | create    | id (add), actorUserId (add), action (add), entity (add), entityId (add), before (add), after (add), organizationId (add), clinicId (add), createdAt (add) |
| `RefreshToken`   | no_change | none                                                                                                                                                      |

## API Contracts

| Method | Path                         | Action | Auth | Requirements            |
| ------ | ---------------------------- | ------ | ---- | ----------------------- |
| POST   | `/api/auth/register`         | create | no   | FR-005, FR-033          |
| POST   | `/api/auth/login`            | modify | no   | FR-009, FR-013, NFR-009 |
| POST   | `/api/auth/refresh`          | modify | no   | FR-010, FR-015          |
| POST   | `/api/auth/logout`           | modify | no   | FR-015                  |
| GET    | `/api/auth/me`               | modify | yes  | FR-028, FR-032          |
| POST   | `/api/auth/change-password`  | modify | yes  | FR-022, FR-034          |
| POST   | `/api/auth/forgot-password`  | modify | no   | FR-021                  |
| POST   | `/api/auth/reset-password`   | modify | no   | FR-021, FR-022, FR-023  |
| POST   | `/api/auth/switch-workspace` | create | yes  | FR-011, FR-012          |
| GET    | `/api/auth/memberships`      | create | yes  | FR-032, FR-027          |
| POST   | `/api/auth/accept-invite`    | create | no   | FR-008, FR-023, FR-030  |
| POST   | `/api/organizations`         | create | yes  | FR-006                  |
| POST   | `/api/invitations`           | create | yes  | FR-007, FR-031          |
| GET    | `/api/invitations`           | create | yes  | FR-027                  |
| GET    | `/api/users`                 | create | yes  | FR-027                  |
| PATCH  | `/api/memberships/:id`       | create | yes  | FR-018, FR-019, FR-029  |

## Security Considerations

| Requirement | Control                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-001     | Global Helmet headers remain applied; nothing in this feature disables CSP or HSTS on auth routes.                                                          |
| NFR-002     | A stricter named throttler is applied to login, register, forgot-password, reset-password and accept-invite, on top of the existing global limit.           |
| NFR-003     | Every new endpoint has a class-validator DTO; the global ValidationPipe with whitelist and forbidNonWhitelisted rejects unknown fields.                     |
| NFR-004     | All tenant filtering is expressed as Prisma query constraints; no raw SQL is introduced.                                                                    |
| NFR-005     | No dangerouslySetInnerHTML in auth UI; email templates escape interpolated names.                                                                           |
| NFR-006     | Auth state changes stay POST behind the explicit CORS allow-list with credentials enabled.                                                                  |
| NFR-007     | New keys are documented in .env.example only; no real values are committed.                                                                                 |
| NFR-008     | The refresh cookie Secure attribute derives from configuration and must be true outside local development.                                                  |
| NFR-009     | Login lockout fails closed: when Redis cannot be reached the attempt is rejected rather than permitted, so an outage cannot disable brute-force protection. |
| NFR-013     | The audit log is append-only from the application perspective; no endpoint updates or deletes audit rows.                                                   |

## Performance Considerations

| Requirement | Strategy                                                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-010     | Login keeps a constant number of round trips: one indexed membership lookup, one Redis counter operation and one argon2 verification, with the argon2 cost left at its current setting. |
| NFR-010     | Membership lookups are indexed on (userId, status) and (clinicId, status) so the guard and the workspace switcher resolve scope without table scans.                                    |
| NFR-013     | Audit writes add no extra round trip because they participate in the mutation transaction.                                                                                              |

## Dependencies

| Name                | Type     | Action    | Notes                                                                                                                     |
| ------------------- | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ioredis`           | library  | no_change | Already present; reused directly for atomic counters and the blacklist.                                                   |
| `@nestjs/throttler` | library  | no_change | Already present; a stricter named throttler is configured for auth endpoints.                                             |
| `argon2`            | library  | no_change | Already present; continues to hash passwords under the strength policy.                                                   |
| `class-validator`   | library  | no_change | Already present; used by every new DTO.                                                                                   |
| `@prisma/client`    | library  | update    | Regenerated after the tenancy models and migration are added.                                                             |
| `redis`             | service  | add       | Provisioned via docker-compose as a hard dependency for security state; skill: none (infrastructure, not a code library). |
| `@nestjs/swagger`   | library  | no_change | Already present; new endpoints are decorated for documentation.                                                           |
| `mail module`       | internal | no_change | Reused and extended with invitation and reset templates (BP-047).                                                         |
| `RedisCacheService` | internal | update    | Reused for caching and extended with strict-mode and counter operations.                                                  |

## Risks

| Risk                                                                                                                | Mitigation                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Removing the clinic-scoped role from users touches RolesGuard, the JWT strategy and the seed script simultaneously. | Ship the data migration and the seed update in the same change as the model update, and keep the four existing dev logins working (T2.3, T2.4).     |
| A fail-closed lockout makes Redis a single point of failure for login.                                              | Health-check Redis at startup, surface a clear retryable error rather than a generic failure, and document the operational dependency (T1.2, T5.5). |
| The public register route can be abused to create organizations.                                                    | Per-endpoint rate limiting plus the restriction that public registration can never join an existing clinic (T6.6, T4.1).                            |
| Existing clients depend on the current unversioned auth routes.                                                     | Route paths are retained and the versioning decision is documented in Swagger (T6.7).                                                               |

## Anti-Redundancy Decisions

Verified against the working tree on 2026-10-28.

| Existing asset                                             | Decision | Rationale                                                                                                                                             |
| ---------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/\*` controller, service, module                      | modify   | Keeps the eight existing routes working (FR-026) and adds the new ones.                                                                               |
| `JwtAuthGuard`, `RolesGuard`, `@Roles()`, `@CurrentUser()` | modify   | Guard mechanism is sound; only the source of the role and the scope changes.                                                                          |
| `HttpExceptionFilter`                                      | reuse    | Already maps errors; extended with stable codes rather than replaced.                                                                                 |
| `password-strength.ts` + spec                              | reuse    | Existing policy is applied to registration and invitations.                                                                                           |
| `RedisCacheService`                                        | update   | Has `get`, `set`, `del` with TTL and an in-memory fallback. Reused for caching; extended with a strict mode and atomic counters rather than replaced. |
| `mail/` module                                             | modify   | Present but has no invitation or reset templates.                                                                                                     |
| `argon2` hashing                                           | reuse    | Correct as-is.                                                                                                                                        |
| `RefreshToken` model with `familyId`                       | reuse    | Family rotation already exists; only the revocation store moves to Redis.                                                                             |
| Prisma `User` model                                        | update   | Gains `memberships`; loses the clinic-scoped `role` and the three in-Postgres lockout columns.                                                        |
| Backoffice auth pages                                      | modify   | Existing login/signup/forgot/reset pages are extended, not duplicated.                                                                                |
| `docker-compose.yml`                                       | modify   | Postgres only today; a Redis service is added.                                                                                                        |

**No new HTTP client, validation library, ORM or state manager is introduced.** Every dependency in the table above already exists except the Redis _service_ itself.

## Out of Scope (planning note)

No test-writing or test-running tasks appear in `tasks.md`. Test authoring and execution belong to `/sdrive:test`; this plan produces production code only.

## P7 — Registration Entry Points and Owner Onboarding

Added 2026-10-29 by `/sdrive:update-propose` to close the gap between the public `/register` wizard and the legacy `/signup` pending-approval screen (US-021, US-022).

### Scope

One public self-service entry point for organization owners, a guarantee that no public path leaves an inert identity behind, and a defined experience for the new owner immediately after registering.

### Decisions

| Decision                                                                       | Rationale                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/register` is the only public self-service entry point                        | It is the only path that satisfies FR-005 (active SUPER_ADMIN in a new organization) and never needs an approval step (FR-036, AC-043).                                                      |
| `POST /auth/signup` stays routed but responds `410 Gone` with `SIGNUP_RETIRED` | FR-026 requires existing paths to remain resolvable, while FR-036 forbids creating a pending identity. Keeping the route and retiring the behaviour satisfies both without rewriting FR-026. |
| The owner is signed in as registration completes                               | AC-041 requires them to land in the workspace; a second login round trip adds a failure point for no benefit (EC-017).                                                                       |
| The first screen after registration is the workspace with a first-run state    | A generic empty dashboard gives a new owner no next action.                                                                                                                                  |

### Components touched

| Component                              | Action | Role                                                                              |
| -------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `auth.controller.ts`                   | modify | `POST /auth/signup` becomes a `410 SIGNUP_RETIRED` responder that writes nothing. |
| `auth.service.ts` / `users.service.ts` | modify | Remove the inactive-identity creation path used only by the retired signup.       |
| registration wizard (backoffice)       | modify | Establish the owner session as the final step.                                    |
| `/signup` route (backoffice)           | delete | Replaced by a redirect to `/register`; the pending-approval screen is removed.    |
| first-run workspace state              | create | Names the next actions (invite staff, review clinic settings) for a new owner.    |
| i18n catalogues (EN/AR/FR)             | modify | New strings for the first-run state and the retirement notice.                    |

### API changes

| Endpoint              | Action | Behaviour                                                                                      |
| --------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `POST /auth/register` | reuse  | Unchanged contract; the owner session is established as part of registration.                  |
| `POST /auth/signup`   | modify | `410 Gone`, code `SIGNUP_RETIRED`, message pointing at `POST /auth/register`; no rows written. |

### Anti-redundancy (verified against the working tree on 2026-10-29)

| Existing asset                     | Decision | Rationale                                                                                   |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `OnboardingService.register`       | reuse    | Already creates identity + organization + clinic + SUPER_ADMIN in one transaction (FR-005). |
| `RegisterPage` 3-step wizard       | reuse    | Already implements the wizard; only the completion step changes.                            |
| `SignupPage` + `POST /auth/signup` | delete   | The only producer of inactive identities; nothing else depends on it.                       |
| `AuthContext.login`                | reuse    | Maintains the access token and refresh cookie; no new auth client is introduced.            |
| `WorkspaceSwitcher`                | reuse    | Already lists memberships with roles, so AC-042 needs no new component.                     |

**No new dependencies are introduced by P7.**
