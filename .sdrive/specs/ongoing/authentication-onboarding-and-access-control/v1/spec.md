---
title: Authentication, Onboarding & Access Control
status: backlog
version: v1
created: 2026-10-28
updated: 2026-10-29
---

# Authentication, Onboarding & Access Control

## Overview

- **Problem Statement**: RI'AYA is multi-tenant — a person may work across several clinics (an organization may run branches), yet the current database has a flat `users` table with a single `role` column. That makes it impossible to express "this person is a Doctor at Central Clinic and an Admin at their own practice", impossible to scope a query to one clinic, and impossible to onboard a new operator who creates their own account, organization and first clinic. Additionally, the spec requires login throttling and token revocation to live in Redis so they survive restarts and work across more than one API instance, but today both live in Postgres.
- **Proposed Solution**: Introduce an explicit tenancy hierarchy (`organizations` → `clinics` → `user_memberships`) that separates global identity from per-clinic membership. Carry the active `org_id`, `clinic_id` and `role` inside the JWT, and make guards read scope **only** from the token. Add a 3-step registration wizard (Account → Organization → First Clinic), a staff invitation flow that admits staff without public self-registration, a `POST /auth/switch-workspace` endpoint that re-issues scoped tokens, an audit trail for every mutation, and Redis-backed lockout plus refresh-token blacklist.
- **Target Audience**: Clinic owners and operators (Super Admins) who register and provision clinics; Clinic Admins who invite and manage staff; Doctors and Receptionists who belong to one or more clinics; and the platform itself, which must enforce isolation between tenants.
- **Assumptions**:
  - The pasted "Authentication, Onboarding & Access Control (AUTH)" section is the authoritative source for this feature, and the owner approved widening the scope to the whole section.
  - A user may hold a different role in each clinic, so `role` belongs to the membership, not the identity.
  - An organization is the billing/ownership boundary; a clinic is the working workspace.
  - Password hashing stays argon2 and access tokens stay 15 minutes.
  - The existing `POST /auth/signup`, `login`, `refresh`, `logout`, `change-password`, `forgot-password`, `reset-password`, `GET me` endpoints are reused and extended rather than rewritten.
  - The 3-step wizard's `/register` route is a public route by design and therefore needs its own abuse controls.

## Security Baseline

Read from `.sdrive/constitution.md` §Security Baseline (CON-51x). Every control is marked `REQUIRED` there, so each is expanded below into an `NFR` and a task.

| Control                      | Status   | How this feature addresses it                                                                                                                                                       |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-511 Authentication       | REQUIRED | Access token (15 min) + refresh token (7 days, HttpOnly cookie), argon2 hashing, rotating refresh tokens with family revocation, Redis-backed account lockout.                      |
| CON-512 Authorization        | REQUIRED | `role` moves to `user_memberships`; `RolesGuard` is fed by the token's per-clinic role; cross-tenant access returns 403 rather than 404-leaking existence.                          |
| CON-513 Security Headers     | REQUIRED | Existing global `helmet()` is retained; auth endpoints must not weaken it, and the `/register` route must not disable CSP.                                                          |
| CON-514 Rate Limiting        | REQUIRED | Global `ThrottlerGuard` retained, plus a stricter per-endpoint limit on `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` and `/auth/accept-invite`. |
| CON-515 Input Validation     | REQUIRED | Every new endpoint gets a class-validator DTO; the global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` stays in force so unknown fields are rejected.                 |
| CON-516 Injection Protection | REQUIRED | Prisma only; no raw SQL. Tenant filters are applied via Prisma `where` clauses, never by string concatenation.                                                                      |
| CON-517 XSS Protection       | REQUIRED | No `dangerouslySetInnerHTML` in the invitation or registration UI; email templates escape interpolated names.                                                                       |
| CON-518 CSRF Protection      | REQUIRED | Refresh cookie stays HttpOnly + `SameSite=Lax`; CORS stays an explicit allow-list with `credentials: true`; all state-changing auth routes are POST.                                |
| CON-519 Environment Security | REQUIRED | New keys (`REDIS_URL` reuse, invitation TTL, workspace switch secret reuse) documented in `.env.example` only; no secrets committed.                                                |
| CON-520 HTTPS / HSTS         | REQUIRED | `COOKIE_SECURE` must be `true` outside local development; Helmet HSTS is unchanged.                                                                                                 |

## User Stories

### US-001: Register a new organization and first clinic

As a prospective clinic owner, I want to create my account, my organization and my first clinic in one guided flow, so that I can start operating without an administrator provisioning me.

**Acceptance Criteria:**

- AC-001: Given I am an unauthenticated visitor, when I complete all three wizard steps with valid data, then my identity, organization, clinic and SUPER_ADMIN membership are created and I am signed in.
- AC-002: Given I am on step 2 or 3, when I press Back, then previously entered data is retained and no partial records are written.
- AC-003: Given my chosen email already exists, when I submit step 1, then I receive a field-level error and no organization or clinic is created.

### US-002: Sign in and stay signed in

As a staff member, I want to sign in with my email and password and remain signed in across reloads, so that I am not forced to re-authenticate constantly.

**Acceptance Criteria:**

- AC-004: Given valid credentials, when I submit the login form, then I receive an access token in the response body and a refresh token in an HttpOnly `SameSite=Lax` cookie.
- AC-005: Given my access token has expired, when the client calls `/auth/refresh`, then it receives a new access token and a rotated refresh token.
- AC-006: Given invalid credentials, when I submit the login form, then I receive 401 with a generic message that does not reveal whether the email or the password was wrong.

### US-003: Sign out

As a staff member, I want to sign out, so that my session cannot be reused on a shared machine.

**Acceptance Criteria:**

- AC-007: Given I am signed in, when I call `/auth/logout`, then my refresh token is revoked, the cookie is cleared, and the same refresh token is rejected on reuse.

### US-004: Be protected by account lockout

As a clinic operator, I want repeated failed logins to be throttled, so that password guessing is impractical.

**Acceptance Criteria:**

- AC-008: Given five failed logins within ten minutes for one account, when a sixth attempt is made, then the account is locked for fifteen minutes and the attempt is rejected.
- AC-009: Given locked-out state is stored in Redis with a TTL, when the API restarts, then the lockout is still in force for the remainder of its TTL.

### US-005: Attach an existing account to an additional clinic

As a signed-in staff member, I want to create a new organization or clinic from the workspace switcher, so that I can run a second practice without a second account.

**Acceptance Criteria:**

- AC-010: Given I am signed in, when I choose "+ Create New Organization", then a new organization and first clinic are created and a membership links my existing identity to them.
- AC-011: Given I already belong to two clinics, when I open the workspace switcher, then both clinics are listed with my role in each.
- AC-012: Given I select a different clinic, when the switch completes, then subsequent requests are scoped to that clinic's `clinic_id`.

### US-006: Switch workspace and receive a scoped token

As a staff member who works in more than one clinic, I want my session to adopt the selected clinic's scope, so that I cannot accidentally act on the wrong clinic's data.

**Acceptance Criteria:**

- AC-013: Given I have membership in the target clinic, when I call `POST /auth/switch-workspace`, then I receive a new access token whose `org_id`, `clinic_id` and `role` claims match that membership.
- AC-014: Given I have no membership in the target clinic, when I call `POST /auth/switch-workspace`, then the request is rejected with 403 and no token is issued.

### US-007: Invite staff instead of letting them self-register

As a clinic admin, I want to invite staff by email with a role, so that only authorised people join my clinic.

**Acceptance Criteria:**

- AC-015: Given I am a CLINIC_ADMIN or SUPER_ADMIN, when I invite an email with a role, then an invitation record with a single-use expiring token is created and an email is sent.
- AC-016: Given I hold a valid invitation token, when I open `/accept-invite?token=...` and set a password, then my account is created or linked, the membership is granted, and the token can never be used twice.
- AC-017: Given an expired or already-used invitation token, when it is submitted, then the request is rejected and no membership is granted.

### US-008: Prevent staff self-registration into someone else's clinic

As a clinic owner, I want the public register path to never join an existing clinic, so that outsiders cannot gain access to my patients' data.

**Acceptance Criteria:**

- AC-018: Given an unauthenticated visitor, when they use the public register route, then they can only create a new organization with themselves as SUPER_ADMIN; they cannot join an existing clinic.

### US-009: Audit every create, update and delete

As an auditor or clinic admin, I want a record of who changed what and when, so that I can investigate a disputed record.

**Acceptance Criteria:**

- AC-019: Given a create, update or delete on an audited entity, when the mutation succeeds, then an audit row records actor, action, entity, entity id, timestamp and before/after values.
- AC-020: Given a mutation fails, when the transaction rolls back, then no audit row is written for it.
- AC-021: Given an audit record exists, when a user is suspended, then the audit history is preserved.

### US-010: Suspend or revoke access to one clinic

As a clinic admin, I want to block a user's access to a clinic immediately, so that a departing staff member cannot keep working there.

**Acceptance Criteria:**

- AC-022: Given an active membership, when I suspend it, then the user receives 403 for that clinic's resources and their existing refresh tokens for that clinic are invalidated.
- AC-023: Given the membership is suspended, when the user switches to another clinic they still belong to, then that access continues to work.

### US-011: Never see another clinic's data

As a clinic owner, I want tenant isolation enforced server-side, so that no request can reach another clinic's records.

**Acceptance Criteria:**

- AC-024: Given a user of Clinic A, when they request a resource belonging to Clinic B, then the response is 403 and no Clinic B data is returned.
- AC-025: Given a request whose body or query string contains a different `clinic_id` than the token's, when it is processed, then the token's `clinic_id` wins and the supplied value is ignored.

### US-012: Set a password from an invitation

As an invited staff member, I want to choose my own password from the invitation link, so that no one else knows my credentials.

**Acceptance Criteria:**

- AC-026: Given a valid unexpired invitation, when I set a password that passes the strength policy, then my account becomes usable and the invitation is consumed.
- AC-027: Given a password that fails the strength policy, when I submit it, then I receive a field-level error and the invitation is not consumed.

### US-013: Recover a forgotten password

As a staff member, I want to reset my password by email, so that I can regain access without an administrator.

**Acceptance Criteria:**

- AC-028: Given a registered email, when I request a reset, then a single-use expiring token is emailed and the response does not reveal whether the account existed.
- AC-029: Given a valid reset token, when I set a new password, then all my existing refresh tokens are revoked.

### US-014: Change my own password

As a signed-in staff member, I want to change my password, so that I can rotate a credential I believe is exposed.

**Acceptance Criteria:**

- AC-030: Given I am signed in and supply my current password correctly, when I set a new one, then the new password works and other sessions' refresh tokens are revoked.

### US-015: Survive a Redis outage for reads but not for security

As a platform operator, I want to know exactly what happens when Redis is unavailable, so that a cache outage does not silently disable a security control.

**Acceptance Criteria:**

- AC-031: Given Redis is unavailable, when a user attempts login, then the lockout control fails closed (the attempt is rejected or the account is locked) rather than allowing unlimited attempts.
- AC-032: Given Redis is unavailable, when dashboard cache reads occur, then the API still serves responses from the database.

### US-016: Keep the registration flow usable in Arabic

As an Arabic-speaking operator, I want the registration wizard and invitation screens in Arabic with a mirrored layout, so that I can complete onboarding in my own language.

**Acceptance Criteria:**

- AC-033: Given locale `ar`, when I open any auth screen, then the layout is right-to-left and all labels and validation messages are Arabic.
- AC-034: Given locale `en`/`fr`, when I open the same screen, then it renders left-to-right with the matching language.

### US-017: Understand why a login failed

As a staff member, I want errors I can act on, so that I am not stuck staring at a failure.

**Acceptance Criteria:**

- AC-035: Given my account is locked, when I attempt login, then I am told the account is temporarily locked and when it will unlock, without revealing the password.
- AC-036: Given an invitation link is expired, when I open it, then I am offered the option to request a new one instead of a dead end.

### US-018: Access the auth API documentation

As a developer integrating the front end, I want the auth contract documented, so that I can build against it.

**Acceptance Criteria:**

- AC-037: Given Swagger at `/api/docs`, when I open it, then every auth, invitation and workspace-switch endpoint is documented with request and response schemas.

### US-019: Target the right API version

As a client developer, I want a stable, versioned auth surface, so that a future change does not silently break me.

**Acceptance Criteria:**

- AC-038: Given the existing unversioned auth routes, when this feature ships, then the pre-existing paths keep working and any newly introduced auth routes are either unversioned consistently with the current API or explicitly versioned with a documented migration note.

### US-020: Provision the Redis dependency

As a platform operator, I want Redis provisioned and wired for security state, so that lockout and revocation behave correctly.

**Acceptance Criteria:**

- AC-039: Given a clean clone, when `docker compose up` runs, then a Redis service starts alongside PostgreSQL and the API connects to it.
- AC-040: Given Redis is reachable, when a refresh token is revoked, then the revocation is recorded in Redis with an expiry matching the token's remaining life.

### US-021: Start working immediately as a new organization owner

As a person who was not invited by any clinic, I want to register my own organization and arrive in my workspace already signed in, so that I can begin operating without waiting for an approval nobody is able to grant.

**Acceptance Criteria:**

- AC-041: Given an uninvited visitor, when they complete all three steps of the public `/register` wizard with valid data, then their identity, organization, first clinic and SUPER_ADMIN membership are created and they are signed in and placed in that clinic's workspace, with no pending or awaiting-approval state at any point.
- AC-042: Given an owner has just registered, when they open the workspace switcher, then the clinic they created during registration is listed as the active workspace with the role `SUPER_ADMIN`.

### US-022: Have exactly one public sign-up path

As a visitor, I want a single, unambiguous way to create an account, so that I am never left waiting for an approval that no one is able to give.

**Acceptance Criteria:**

- AC-043: Given the public surface, when a visitor looks for a way to create an account, then `/register` is the only self-service entry point, and no public route creates an inactive account that waits for a clinic-admin approval.
- AC-044: Given a visitor opens the legacy `/signup` path, when the page loads, then they are sent to `/register` and no "waiting for clinic admin approval" state is rendered.
- AC-045: Given a client calls `POST /api/auth/signup`, when the request is well formed, then no identity, organization, clinic or membership is created and the API responds `410 Gone` with the stable code `SIGNUP_RETIRED` and a message directing the caller to `POST /api/auth/register`.

## Requirements

### Functional Requirements

- FR-001: The system MUST model `organizations`, `clinics` and `user_memberships` as separate tables, with a membership linking one identity to one clinic with one role.
- FR-002: The system MUST keep `users` as global identity (email and password hash) and MUST NOT store a clinic-scoped role on the identity.
- FR-003: The system MUST include `org_id`, `clinic_id` and `role` claims in the access token.
- FR-004: The system MUST resolve tenant scope for every authorized request exclusively from the access token, never from the request body or query string.
- FR-005: The system MUST expose a public registration flow that creates an account, an organization and a first clinic, and grants the creator a SUPER_ADMIN membership.
- FR-006: The system MUST allow an already-authenticated user to create an additional organization and first clinic from the workspace switcher without creating a duplicate identity.
- FR-007: The system MUST allow a CLINIC_ADMIN or SUPER_ADMIN to invite a person by email with a role, producing a single-use, expiring invitation token.
- FR-008: The system MUST allow an invited person to set their own password via `/accept-invite?token=...` and MUST NOT allow public self-registration into an existing clinic.
- FR-009: The system MUST issue a 15-minute access token and a 7-day refresh token delivered as an HttpOnly, SameSite=Lax cookie.
- FR-010: The system MUST rotate the refresh token on every successful refresh and MUST revoke the whole token family if a revoked token is presented again.
- FR-011: The system MUST expose `POST /auth/switch-workspace` that re-issues an access token scoped to the selected clinic when the caller holds a membership there.
- FR-012: The system MUST reject `POST /auth/switch-workspace` with 403 when the caller holds no membership in the requested clinic.
- FR-013: The system MUST lock an account for 15 minutes after five failed login attempts within 10 minutes.
- FR-014: The system MUST store the failed-attempt counter and lockout expiry in Redis with an appropriate TTL.
- FR-015: The system MUST store revoked refresh tokens in Redis with an expiry matching the token's remaining lifetime.
- FR-016: The system MUST record an audit entry for every create, update and delete on audited entities, capturing actor, action, entity, entity id, timestamp and before/after values.
- FR-017: The system MUST write audit entries inside the same transaction as the mutation they describe.
- FR-018: The system MUST allow a CLINIC_ADMIN or SUPER_ADMIN to suspend a membership, immediately denying that clinic's resources to the suspended user.
- FR-019: The system MUST invalidate the suspended user's refresh tokens for the affected clinic on suspension.
- FR-020: The system MUST preserve audit history when a membership is suspended or a user deactivated.
- FR-021: The system MUST allow a user to request a password reset by email, responding identically whether or not the account exists.
- FR-022: The system MUST revoke all refresh tokens for a user after a successful password reset or password change.
- FR-023: The system MUST enforce a password strength policy on registration and on accepting an invitation.
- FR-024: The system MUST serve every auth error as a stable machine-readable code plus a human-readable message, so the front end can translate it.
- FR-025: The system MUST document every auth, invitation and workspace endpoint in Swagger.
- FR-026: The system MUST retain the existing unversioned auth route paths so current clients keep working.
- FR-027: The system MUST provide a staff directory for the active clinic showing email, role, status and last login.
- FR-028: The system MUST allow a user to hold a different role in each clinic and MUST apply the role of the active clinic.
- FR-029: The system MUST refuse any operation that would leave an organization with zero SUPER_ADMIN members.
- FR-030: The system MUST record the invitation's intended clinic and role, and grant exactly that membership on acceptance.
- FR-031: The system MUST revoke an invitation token when a newer invitation is issued for the same email and clinic.
- FR-032: The system MUST return the caller's active memberships and their roles so the workspace switcher can render them.
- FR-033: The system MUST keep the public registration route available only for creating new organizations, never for joining an existing one.
- FR-034: The system MUST hash passwords with argon2 and MUST NOT store or log plaintext passwords.
- FR-035: The system MUST set the refresh cookie's `Secure` attribute from configuration so production uses HTTPS.
- FR-036: The system MUST NOT create a pending or inactive identity from any public self-registration path; every public self-registration MUST create an active identity holding a SUPER_ADMIN membership in a newly created organization.
- FR-037: The system MUST redirect the legacy `/signup` path to `/register` and MUST NOT render a self-registration screen that promises a clinic-admin activation step.
- FR-038: The system MUST keep `POST /auth/signup` registered so the route is not missing, but MUST NOT create any identity from it; it MUST respond `410 Gone` with the stable code `SIGNUP_RETIRED` and a message directing the caller to `POST /auth/register`. This preserves the routing guarantee of FR-026 without permitting the pending-identity behaviour that FR-036 forbids.

### Non-Functional Requirements

- NFR-001: The API MUST set security headers via Helmet on every response, including auth endpoints. (CON-513)
- NFR-002: The API MUST apply a stricter rate limit to `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` and `/auth/accept-invite` than to general endpoints. (CON-514)
- NFR-003: Every new endpoint MUST validate its input with a class-validator DTO under the global `ValidationPipe`, rejecting unknown fields. (CON-515)
- NFR-004: The feature MUST NOT introduce raw SQL; all tenant filtering MUST be expressed as Prisma query constraints. (CON-516)
- NFR-005: The feature MUST NOT introduce `dangerouslySetInnerHTML` or unescaped interpolation in invitation and registration UI or email templates. (CON-517)
- NFR-006: State-changing auth endpoints MUST remain POST and MUST rely on an explicit CORS allow-list with `credentials: true`. (CON-518)
- NFR-007: New configuration keys MUST be documented in `.env.example` and MUST NOT be committed with real values. (CON-519)
- NFR-008: `COOKIE_SECURE` MUST be `true` outside local development, and HSTS MUST remain enabled. (CON-520)
- NFR-009: When Redis is unavailable, the login lockout control MUST fail closed rather than permitting unlimited attempts.
- NFR-010: A login request MUST complete within 400 ms p95 under normal load, excluding deliberate lockout waits.
- NFR-011: Auth screens MUST meet WCAG 2.1 AA for contrast, keyboard access and visible focus, and MUST render correctly in RTL for Arabic.
- NFR-012: Every auth screen and email template MUST be available in EN, AR and FR with no hard-coded user-facing strings.
- NFR-013: The audit trail MUST be append-only from the application's perspective; no endpoint may modify or delete an audit row.

## UI/UX & Data Requirements

- **UI/UX**:
  - A 3-step registration wizard with a visible stepper, per-step validation, working Back navigation that preserves input, and a summary on the final step. No partial persistence until the final submit.
  - An invitation landing page at `/accept-invite?token=...` that sets the password, shows the clinic and role being accepted, and converts an expired token into a "request a new invitation" path rather than a dead end.
  - A workspace switcher listing each clinic with the user's role, plus a "+ Create New Organization" action.
  - A staff directory table for the active clinic (email, role, status, last login) with invite and suspend actions behind confirm dialogs.
  - A clear locked-account state on the login screen that names the unlock time without exposing the password.
  - All screens mirrored for Arabic (`dir="rtl"`, logical CSS properties) and translated in EN/AR/FR.
  - Loading skeletons for the directory and switcher; empty states for a user with a single clinic.
  - The first screen after a successful registration is the new workspace itself, carrying a first-run state that names the next actions (invite staff, review clinic settings) rather than a generic empty dashboard.
  - `/signup` renders no screen of its own; it redirects to `/register`.
- **Data**: New persisted entities are `organizations` (name, slug, timestamps), `clinics` (organization id, name, timezone, currency, address, timestamps), `user_memberships` (user id, clinic id, organization id, role, status, timestamps), `invitations` (email, clinic id, role, token hash, expires at, consumed at, invited by), and `audit_logs` (actor user id, action, entity, entity id, before, after, clinic id, organization id, created at). `users` keeps email, password hash, first/last name, preferred locale, `isActive` and login counters; its clinic-scoped `role` column is superseded by membership. Redis holds the refresh-token blacklist, failed-attempt counters, lockout expiries and rate-limit counters.

## Edge Cases & Error States

- EC-001: Registration email collides with an existing identity → field-level error on step 1; no organization or clinic is created.
- EC-002: Session expires mid-wizard → the wizard preserves in-memory input and prompts for re-authentication rather than discarding it.
- EC-003: Workspace switch requested for a clinic where the user has no membership → 403; the switcher does not change the active clinic.
- EC-004: Membership suspended while the user is mid-session → the next request for that clinic returns 403 and the client returns to the switcher.
- EC-005: Suspending the last SUPER_ADMIN of an organization → rejected with a clear error; the audit trail stays intact.
- EC-006: Invitation token expired or already consumed → rejected, with an option to request a new invitation.
- EC-007: A second invitation for the same email and clinic → the earlier token is revoked so only the newest works.
- EC-008: Redis unavailable during login → lockout fails closed and the attempt is rejected with a retryable error, never silently unlimited.
- EC-009: Redis unavailable during a normal read → the API serves from PostgreSQL as it does today.
- EC-010: Two requests race to refresh the same refresh token → exactly one succeeds; the other is rejected and the family is revoked only if reuse of a rotated token is detected.
- EC-011: Refresh token presented after logout → rejected; the family's revocation is enforced.
- EC-012: Request body supplies a `clinic_id` different from the token's → the token wins and the supplied value is ignored.
- EC-013: Password change while another session is active → other sessions' refresh tokens are revoked.
- EC-014: Clock skew between Redis TTL and database timestamps → Redis TTL is authoritative for lockout expiry and is re-checked on read.
- EC-015: Arabic locale with a Latin-only email address → the email input stays LTR while the surrounding layout mirrors.
- EC-016: A visitor abandons the registration wizard after a step and returns later → nothing is persisted, no inactive identity is left behind, and they can start again or sign in normally if a previous registration completed.
- EC-017: A visitor signs in immediately after registering → the credential works at once, because registration never leaves the account disabled.
- EC-018: A legacy client posts to `POST /auth/signup` expecting a pending staff account → it receives `410 Gone` with `SIGNUP_RETIRED`, no row is written, and the caller is pointed at `POST /auth/register`.

## Out of Scope

- The optional patient portal and any patient-facing authentication.
- SSO, OAuth providers, social login, SAML and MFA/TOTP.
- Real SMS or WhatsApp delivery of invitation or reset codes; the existing mock provider interface is used.
- Clinic-scoped resource authorization beyond the guard mechanism itself: patient, doctor, appointment and settings data access is specified by BP-015, BP-016, BP-017 and BP-035.
- Front-end route guards and menu hiding per role, which belong to BP-011.
- The broader role and permissions matrix for non-auth resources, which belongs to BP-011.
- Billing-related identity concerns such as payer accounts.
- Infrastructure-as-code, CD pipelines and deployment topology (BP-040).

## Dependencies & Risks

- **External dependency**: Redis must be provisioned (BP-046). Today `docker-compose.yml` has PostgreSQL only and `RedisCacheService` silently degrades to an in-memory cache. Security state must not silently degrade, so this feature depends on Redis being real.
- **External dependency**: the mail module must be able to deliver invitation and reset email (BP-047).
- **Upstream dependency**: BP-002 supplies the Prisma schema and migrations this feature extends; BP-003 supplies the validation pipe, exception filter and CI.
- **Risk — highest in the roadmap**: BP-008 changes the schema the currently working auth flow sits on. Moving `role` off `users` into `user_memberships` touches every existing auth path that reads `user.role`, including `RolesGuard`, the JWT strategy and the seed script. Mitigation: a documented migration path for existing rows (each existing user becomes a membership in a default organization and clinic), and the seed script updated in the same change.
- **Risk**: widening to the whole AUTH section makes this a large single feature spanning three layers. Mitigation: it is decomposed into ordered milestones so each `/sdrive:apply` pass is independently verifiable, and it remains one branch and one review unit per CON-606.
- **Risk**: the `/register` route is public and creates organizations, so it is the most attractive endpoint for abuse. Mitigation: stricter per-endpoint rate limiting (NFR-002) and no ability to join an existing clinic (FR-033).
- **Risk**: existing clients use the current unversioned auth paths. Mitigation: FR-026 keeps those paths working.
- **Risk**: audit writes could grow unbounded. Mitigation deferred — retention policy is owned by BP-035 (settings), noted as an assumption rather than solved here.
- **Design reference**: `project-overview/ri-aya.png` was attached as inspiration. Its visual content **was not inspected** (no image analysis available in this session), so no layout detail is derived from it. It is recorded as an uninspected reference, not as a specification input.
