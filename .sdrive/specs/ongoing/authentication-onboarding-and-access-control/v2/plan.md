---
title: Authentication, Onboarding & Access Control — Technical Plan (v2)
feature: authentication-onboarding-and-access-control
version: v2
status: backlog
created: 2026-11-06
updated: 2026-11-06
---

# Technical Plan (v2)

> v1 delivered the tenancy model, scoped tokens, registration and a _console_ mail stub
> (`.sdrive/specs/completed/authentication-onboarding-and-access-control/v1/plan.md`).
> v2 builds **only** the invitation-delivery, lifecycle and role-management delta and reuses v1's
> modules. No v1 file is modified (CON-605).

## Architecture Approach

Keep the existing seams and widen them. The `mail/` module already resolves its transport through a
`MAIL_SERVICE` provider token, so a real SMTP transport (`nodemailer`, configured for Mailtrap from
environment variables) is dropped in behind that token while the console implementation stays for
local/test. Invitation state becomes a first-class column: an `InvitationStatus` enum
(`PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`) is added to the `invitations` model, and `EXPIRED`
is **derived** at read time for an unconsumed row whose `expiresAt` has passed — never written — so
no scheduler is needed. Cancel, decline and role change are new tenant-scoped operations in the
existing `tenancy` module, gated by the shared `CAPABILITY_ROLES` matrix and audited through the
existing transactional `AuditService`. The invitation link gains `organizationId`, `clinicId` and
`role` as conveniences, but the persisted invitation row stays the single source of truth: the
server always re-derives the join scope from the record and ignores the link claims (FR-047). The
mail send runs **outside** the invitation transaction (NFR-016) and its outcome is recorded, so a
provider failure degrades to a resend affordance rather than a lost invitation.

## Components

| Component                                     | Action | Role                                                                                                                                  |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `server/src/mail/mail.service.ts`             | modify | Adds `SmtpMailService` (nodemailer → Mailtrap) and a transport selector; keeps `ConsoleMailService` for local/test.                   |
| `server/src/mail/templates/`                  | create | Localized EN/AR/FR invitation and reset templates with escaped interpolation (NFR-017).                                               |
| `mail.module.ts` (`MAIL_SERVICE` provider)    | modify | Chooses the SMTP or console implementation from configuration, keeping the token contract unchanged.                                  |
| `server/src/tenancy/onboarding.service.ts`    | modify | Invitation create/list gain status + delivery outcome; adds cancel, decline and accept-by-record; send moved outside the transaction. |
| `server/src/tenancy/tenancy.service.ts`       | modify | Adds membership role change with the last-SUPER_ADMIN guard reused from v1 (FR-029).                                                  |
| `server/src/tenancy/tenancy.controller.ts`    | modify | Adds cancel, decline and role-change routes; extends the invitation list response.                                                    |
| `server/src/tenancy/dto/*.ts`                 | modify | DTOs for cancel, decline and role change; the invite response carries the link scope.                                                 |
| `prisma/schema.prisma` + migration            | update | `InvitationStatus` enum on `invitations`, `deliveryStatus`/`deliveryError` columns, and an `updatedAt`.                               |
| `packages/shared/src/schemas/tenancy.ts`      | modify | Adds `invitationStatusSchema` and the cancel/role-change input contracts; keeps zod/server parity.                                    |
| `packages/shared/src/permissions.ts`          | reuse  | `inviteStaff`, `manageStaff`, `suspendMembership` gate cancel and role change; `CAPABILITY_ROLES` unchanged.                          |
| `backoffice/src/pages/StaffDirectoryPage.tsx` | modify | Status column, resend/cancel actions, per-member role change, last login, filters and pagination.                                     |
| `backoffice/src/pages/AcceptInvitePage.tsx`   | modify | Reads organization/clinic/role from the link, offers decline, asks only profile + password.                                           |
| `backoffice/src/i18n/{en,ar,fr}.json`         | modify | New strings for status labels, cancel/decline/resend and role change, kept in parity (CON-304).                                       |
| `server/.env.example`                         | modify | Documents the Mailtrap/SMTP keys by name only (NFR-015).                                                                              |

## Data Model

| Entity       | Action    | Fields added / changed                                                                                                                                                                                                                                                                          |
| ------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Invitation` | update    | `status InvitationStatus @default(PENDING)`; `deliveryStatus DeliveryStatus @default(PENDING)`; `deliveryError String?`; `updatedAt DateTime @updatedAt`. Existing fields (`email`, `organizationId`, `clinicId`, `role`, `tokenHash`, `expiresAt`, `consumedAt`, `invitedById`) are unchanged. |
| `Membership` | no_change | A role change updates `role` and `updatedAt`; no schema change.                                                                                                                                                                                                                                 |

**`InvitationStatus`**: `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED` (persisted). **`EXPIRED`** is derived at read time for a `PENDING` row whose `expiresAt < now`.

**`DeliveryStatus`**: `PENDING`, `SENT`, `FAILED` — the recorded outcome of the mail send (FR-041).

## API Changes

| Endpoint                          | Method | Action | Behaviour                                                                                                                                                      |
| --------------------------------- | ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/invitations`                | POST   | modify | Response keeps `invitationId`/`expiresAt` and adds the link scope (`organizationId`, `clinicId`, `role`) and `deliveryStatus`; raw token still never returned. |
| `/api/invitations`                | GET    | modify | Returns every status (not just pending) with derived `EXPIRED`, plus pagination (NFR-019).                                                                     |
| `/api/invitations/:id/cancel`     | PATCH  | create | Cancels a `PENDING` invitation; tenant-scoped; audits prev/new status; refuses non-pending (FR-043).                                                           |
| `/api/invitations/:token/decline` | POST   | create | Invitee declines via the link token; sets `REJECTED`, invalidates the token (FR-044).                                                                          |
| `/api/invitations/:token`         | GET    | create | Resolves the link scope (org/clinic/role, email-known flag) for the accept page without consuming the token.                                                   |
| `/api/memberships/:id/role`       | PATCH  | create | Changes a member's role in scope; refuses the last-SUPER_ADMIN case (FR-045); audits before/after.                                                             |
| `/api/invitations/:id/resend`     | POST   | create | Re-issues the token and re-sends the email; revokes the previous token (FR-031, EC-020, EC-024).                                                               |

`plan.json`'s `apiContracts` is left empty on purpose, matching the `realtime-service` precedent: this
feature is NestJS, and `verify.js`'s `detectEndpoints()` recognises only Express/FastAPI/Next.js
routes, so a declared NestJS route would be reported missing on every run. The routes above are
enforced by the `roles-metadata` test and the e2e suites instead.

## Security Considerations

| Requirement | Control                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| NFR-014     | SMTP credentials read only from env; never logged; raw token never logged or returned (AC-046).                 |
| NFR-015     | New keys documented in `server/.env.example` by name only (CON-519/NFR-007).                                    |
| NFR-016     | Mail send runs outside the DB transaction so a provider fault cannot roll back the invitation row.              |
| NFR-017     | Templates escape all interpolation; no `dangerouslySetInnerHTML` (CON-517).                                     |
| FR-045      | Cancel and role change are gated by `CAPABILITY_ROLES` and scoped via `clinicWhere`; role change reuses FR-029. |

## Invitation Email Delivery (Mailtrap)

- **Transport seam (FR-039, NFR-014).** `SmtpMailService` implements the existing `MailService` interface with `nodemailer` pointed at the Mailtrap SMTP endpoint. Host, port, user and password are read only from environment variables, are never logged, and the raw invitation token is never logged or returned over HTTP (AC-046). `MailModule` selects SMTP or `ConsoleMailService` from configuration behind the unchanged `MAIL_SERVICE` token, so no caller changes (AC-046, T8.1).
- **Templates (FR-040, NFR-017).** Invitation and password-reset templates ship in EN, AR and FR, interpolating the clinic name, the role and the accept link built from `BACKOFFICE_URL`; every value is escaped and no template uses `dangerouslySetInnerHTML` (AC-047, T8.2).
- **Delivery outcome (FR-041).** `DeliveryStatus` (`PENDING`, `SENT`, `FAILED`) plus `deliveryError` records the send result so the directory can tell a sent invitation from a failed one (AC-048, T8.3).
- **Ordering (NFR-016).** The row is written and committed first; the send runs outside that transaction and writes its outcome back. A failed send is recorded, not thrown, so the invitation still exists as `PENDING` with a resend affordance (AC-049, EC-019, T8.1, T8.3).

## Invitation Lifecycle & Status

- **Persisted status (FR-042).** `InvitationStatus` is `PENDING`, `ACCEPTED`, `REJECTED` or `CANCELLED`. A fresh row is `PENDING`; acceptance writes `ACCEPTED`, cancellation `CANCELLED`, a decline `REJECTED` (AC-050, T8.3).
- **Derived EXPIRED (FR-042).** `EXPIRED` is never written. It is computed at read time for a `PENDING` row whose `expiresAt` has passed, so no scheduler is needed and there is one source of truth (AC-051, T8.3).
- **List contract (NFR-019).** `GET /api/invitations` returns every status, not only pending, with a bounded page size and the existing `(clinicId, status)` and `(expiresAt)` indexes, so a directory read is an index scan (AC-050, T8.4).

## Cancel, Decline & Role Change

- **Cancel (FR-043).** `PATCH /api/invitations/:id/cancel` cancels a `PENDING` invitation in the caller's clinic, invalidating the token and writing `CANCELLED`; the actor, the invitation and the previous/new status are audited in the same transaction. A non-pending invitation is refused with a stable code and nothing changes (AC-053, AC-054, AC-055, T8.5).
- **Decline (FR-044).** `POST /api/invitations/:token/decline` lets the invitee decline a valid invitation, writing `REJECTED` and invalidating the token; the row stays for the record and the same email and clinic can be invited again (AC-056, AC-057, EC-020, T8.6).
- **Role change (FR-045).** `PATCH /api/memberships/:id/role` is gated by `CAPABILITY_ROLES`, scoped with `clinicWhere`, updates the membership role and audits the before/after role. A change that would leave the organization with zero `SUPER_ADMIN` members is refused by the v1 invariant and nothing is written (AC-058, AC-059, AC-060, T8.7).

## Link-Carried Scope & Fast Accept

- **Link scope (FR-046).** The invitation link carries the token plus the target `organizationId`, `clinicId` and `role`, so the invitee supplies only profile and login details (AC-061, T8.8).
- **Scope resolution (FR-046).** `GET /api/invitations/:token` resolves the scope and an email-known flag without consuming the token, so the accept page can render the organization, clinic and role from the link (AC-062, AC-063, T8.8).
- **Record is authoritative (FR-047).** On accept the server re-derives the join scope from the persisted invitation row and ignores any disagreeing link claim, so a tampered link cannot widen scope (AC-064, EC-023, T8.8).

## Staff Directory Lifecycle UI

- **Lifecycle column (FR-048).** The staff directory shows exactly one status per invitation (`PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`, `EXPIRED`), with resend and cancel actions, filters and pagination, alongside each member's last login (AC-050, AC-057, T8.9).
- **Localised and RTL-correct (NFR-018).** Status labels and the resend, cancel, decline and role-change strings are provided in EN, AR and FR with RTL-correct layout and no hard-coded user-facing strings; the accept page offers decline and asks only for profile and password (AC-050, T8.10).

## Performance Considerations

| Requirement | Strategy                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| NFR-016     | The provider call is removed from the request transaction, so invitation creation stays a bounded single-transaction write. |
| NFR-019     | List endpoints take a bounded page size and use the existing `(clinicId, status)` and `(expiresAt)` indexes.                |

## Dependencies

| Dependency        | Type     | Action    | Notes                                                                                                                      |
| ----------------- | -------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `nodemailer`      | library  | add       | SMTP client used by `SmtpMailService` behind the existing `MAIL_SERVICE` interface. No AI skill expected (a node library). |
| Mailtrap          | external | no_change | Transactional SMTP provider (BP-047); credentials supplied per environment. Not manifest-verifiable.                       |
| `@prisma/client`  | library  | update    | Regenerated after the `InvitationStatus`/`DeliveryStatus` enums and the invitation columns and migration.                  |
| `class-validator` | library  | no_change | Already present; the new DTOs use it under the global `ValidationPipe`.                                                    |
| `@riaya/shared`   | internal | no_change | Reused for the capability matrix; extended with `invitationStatusSchema` and the cancel/role-change contracts.             |

## Anti-Redundancy Decisions

| Existing asset                                                     | Decision | Why                                                                                                    |
| ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| `server/src/mail/mail.module.ts` `MAIL_SERVICE`                    | reuse    | The provider token is the seam; a second transport is added behind it, not a new module.               |
| `server/src/mail/mail.service.ts` `ConsoleMailService`             | reuse    | Kept for local/test without a provider; the SMTP transport is an alternative implementation.           |
| `packages/shared/src/permissions.ts` `CAPABILITY_ROLES`            | reuse    | `inviteStaff`, `manageStaff` and `suspendMembership` already express cancel and role-change authority. |
| `server/src/tenancy/tenancy.service.ts` last-SUPER_ADMIN invariant | reuse    | FR-045 reuses the v1 guard rather than restating the rule.                                             |
| `server/src/audit` transactional writer                            | reuse    | Cancel, decline and role change audit through the existing writer inside their transaction.            |
| `Invitation.tokenHash`, `expiresAt`, `consumedAt`                  | reuse    | Unchanged; token revocation reuses the existing hashed single-use token.                               |

## Risks

| Risk                                                                                    | Mitigation                                                                                                                        |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Changing a member's role is a privilege-escalation path.                                | `CAPABILITY_ROLES` gates the endpoint, changes are tenant-scoped via `clinicWhere`, and every change is audited (FR-045, AC-060). |
| The invitation link carries organization and clinic ids an attacker could tamper with.  | Link claims are advisory only; the persisted record is authoritative and a disagreeing claim is ignored (FR-047, AC-064).         |
| A synchronous provider call on the request path could slow or fail invitation creation. | The send runs outside the invitation transaction (NFR-016) and a failed send is recorded, not thrown (AC-049, EC-019).            |
| A non-persisted `EXPIRED` state could drift from the stored status.                     | `EXPIRED` is derived only at read time for a `PENDING` row whose `expiresAt` has passed (FR-042, AC-051).                         |

## Out of Scope (planning note)

No change to v1's tenancy model, scoped-token issuance, registration wizard or workspace switching (CON-605). No SMS/WhatsApp delivery, bulk/CSV import, scheduled reminders, passwordless sign-in, ownership transfer, or deliverability analytics (see `spec.md` §Out of Scope (v2)).

> **Scope update 2026-11-08.** The workspace-switching exclusion above is superseded: workspace switching and clinic creation are planned in P16 for US-031/FR-055–FR-058. v1's tenancy model, scoped-token issuance and registration wizard remain unchanged.

## P14 — Clinic Settings (extension)

The settings surface already exists on the branch; this phase aligns it with the new requirements rather than duplicating it. Every component below is a `modify`/`reuse`, not a `create`.

| Component                                                    | Action | Role                                                                                            |
| ------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------- |
| `backoffice/src/pages/SettingsPage.tsx`                      | modify | Eight-section shell with routed sections and numbered side navigation (FR-052, AC-069).         |
| `backoffice/src/pages/settings/ClinicInformationSection.tsx` | modify | Loads/saves clinic name, address, contact email, phone, default language and timezone (FR-049). |
| `backoffice/src/pages/settings/WorkingHoursSection.tsx`      | modify | Seven-day working hours and breaks, with duplicate/overlap rejection (FR-050, AC-066, AC-067).  |
| `backoffice/src/pages/settings/RolesPermissionsSection.tsx`  | modify | Built-in and custom roles; create/edit/delete with a permission subset (FR-051, AC-068).        |
| `backoffice/src/pages/settings/PlaceholderSection.tsx`       | modify | Departments, appointments, reminders, audit log and appearance placeholders (FR-052, AC-069).   |
| `backoffice/src/pages/settings/SettingsCard.tsx`             | reuse  | Shared settings card shell.                                                                     |
| `backoffice/src/pages/settings/types.ts`                     | modify | Shared settings, working-hours and role types.                                                  |
| `server/src/tenancy/dto/clinic-settings.dto.ts`              | modify | Validates settings fields, working hours and breaks (FR-049, FR-050).                           |
| `server/src/tenancy/dto/role.dto.ts`                         | modify | Validates custom-role name, base role and permissions (FR-051).                                 |
| `server/src/tenancy/tenancy.controller.ts`                   | modify | Settings and role routes behind the `manageSettings` capability (NFR-020).                      |
| `server/src/tenancy/tenancy.service.ts`                      | modify | Settings read/write, working-hours validation and custom-role CRUD (FR-049–FR-051).             |
| `server/src/database/prisma.service.ts`                      | modify | Exposes the role delegate for custom roles.                                                     |
| `server/prisma/schema.prisma`                                | modify | Adds the Clinic settings fields and the Role model (data model below).                          |
| `server/prisma/migrations/20261107110000_clinic_settings`    | reuse  | Existing clinic-settings migration.                                                             |
| `server/prisma/migrations/20261107130000_custom_roles`       | reuse  | Existing Role migration.                                                                        |
| `backoffice/src/i18n`                                        | modify | EN/AR/FR strings for settings, validation and placeholders (NFR-022).                           |

**Data model:** `Clinic` gains `contactEmail`, `phone`, `defaultLanguage` and `workingHours`; `address` and `timezone` stay. `Role` is a new clinic-scoped model: `id`, `organizationId`, `clinicId`, `name`, `baseRole`, `permissions`, `createdAt`, `updatedAt`, unique on `(clinicId, name)`.

**API:** `GET/PATCH /api/clinics/settings`, `GET/POST /api/roles`, `PATCH/DELETE /api/roles/:id`.

**Security:** settings and role writes are tenant-scoped and `manageSettings`-gated; a custom role's permissions must be a subset of its base role (NFR-020, NFR-021).

## P15 — Organization Overview (extension)

| Component                                  | Action | Role                                                                                    |
| ------------------------------------------ | ------ | --------------------------------------------------------------------------------------- |
| `backoffice/src/pages/OverviewPage.tsx`    | modify | Organization totals and per-clinic table with loading, empty and error states (FR-053). |
| `server/src/tenancy/tenancy.controller.ts` | modify | `GET /api/organizations/overview` (FR-053, NFR-023).                                    |
| `server/src/tenancy/tenancy.service.ts`    | modify | Organization-scoped aggregate: clinics, staff, patients, today/upcoming appointments.   |

**Data flow:** the JWT scope supplies `organizationId`; the service never accepts an arbitrary organization id. Each request returns one aggregate plus per-clinic rows, not a full record set per clinic (NFR-023).

## P16 — Workspace Switching and Clinic Creation (extension)

| Component                                      | Action | Role                                                                                          |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `backoffice/src/auth/WorkspaceContext.tsx`     | modify | Memberships, active clinic, switch, refresh proof and create-clinic actions (FR-055–FR-058).  |
| `backoffice/src/layouts/WorkspaceSwitcher.tsx` | modify | Sidebar switcher with active marker, switching state, errors and create entry point (FR-058). |
| `backoffice/src/layouts/AppShell.tsx`          | modify | Removes the duplicate active-clinic header and wires the routes (FR-058).                     |
| `backoffice/src/layouts/Breadcrumbs.tsx`       | modify | Breadcrumb support for the new routes.                                                        |
| `backoffice/src/App.tsx`                       | modify | Settings, overview and workspace routes.                                                      |
| `server/src/auth/auth.controller.ts`           | modify | `POST /api/auth/switch-workspace` (FR-056).                                                   |
| `server/src/auth/auth.service.ts`              | modify | Validates membership, issues a scoped token and rotates the refresh cookie (NFR-024).         |
| `server/src/tenancy/dto/clinic.dto.ts`         | modify | Validates the create-clinic name (FR-057).                                                    |
| `server/src/tenancy/tenancy.controller.ts`     | modify | `GET /api/memberships` and `POST /api/clinics` (FR-055, FR-057).                              |
| `server/src/tenancy/tenancy.service.ts`        | modify | Membership list and transactional clinic creation with audit (FR-057, NFR-025).               |

**API:** `GET /api/memberships`, `POST /api/clinics`, `POST /api/auth/switch-workspace`.

**Security:** a switch requires an active membership; a failed switch must not leave a token for the rejected clinic; clinic creation is transactional with its membership and audit row (NFR-024, NFR-025).

## P17 — Verification (extension)

Formatter, linter, typechecker, `sdrive verify`, governance validator and manual checks only; no test runner and no test authoring in this phase.

| Task  | Check                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------- |
| T17.1 | Server `tsc --noEmit` and eslint.                                                                   |
| T17.2 | Repository formatter and `node .sdrive/scripts/validate-governance.js`.                             |
| T17.3 | `sdrive verify authentication-onboarding-and-access-control`.                                       |
| T17.4 | Manual: placeholder sections make no API call, empty overview, switch error never routes to signup. |

## Risks (extension)

| Risk                                                              | Mitigation                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Custom roles could grant more than their base role.               | The API rejects permissions outside the base-role capability set (NFR-021, AC-068).               |
| The organization overview could leak another organization's data. | Filter by the resolved tenant organization; no client-supplied organization id (FR-054, NFR-023). |
| A failed workspace switch could leave a stale scoped token.       | Validate membership before issuing; prove the refresh before reload (NFR-024, AC-073).            |
| Placeholder sections could imply unbuilt backend behaviour.       | Label them as unavailable and make no API mutation (FR-052, AC-069).                              |
