---
title: Authentication, Onboarding & Access Control (v2) — Invitation Delivery, Lifecycle & Role Management
status: backlog
version: v2
created: 2026-11-06
updated: 2026-11-08
---

# Authentication, Onboarding & Access Control (v2)

> **Version scope.** v1 (archived, `.sdrive/specs/completed/authentication-onboarding-and-access-control/v1/`)
> delivered the tenancy hierarchy, scoped tokens, registration, the _console_ mail stub and a
> read-only staff directory. v2 adds **real email delivery (Mailtrap)**, a full **invitation
> lifecycle with statuses**, **sender cancellation**, **invitee decline**, **admin role change**,
> and a **link-carried organization/clinic/role** so an invited person supplies only their profile
> and login details. v1 IDs are preserved; every v2 ID continues the v1 sequence.

## Overview

- **Problem Statement**: Invitations are issued and their tokens exist, but the mail transport is a
  `ConsoleMailService` stub that only logs the link, so no invited person ever receives an email
  (BP-047). There is also no way to tell whether an invitation is pending, accepted, rejected,
  expired or cancelled — `listPendingInvitations` filters on `consumedAt`/`expiresAt` alone and the
  directory shows only email, role and expiry. A sender cannot cancel a mis-sent invitation, an
  invitee cannot decline one, and an admin cannot change an existing member's role. Finally, the
  accept page asks the invitee for details the system already knows: the link carries only a token,
  so the organization, clinic and role the admin chose are invisible to the flow.
- **Proposed Solution**: Replace the console stub with an SMTP transport backed by **Mailtrap**
  behind the existing `MAIL_SERVICE` interface, with localized (EN/AR/FR) invitation templates and a
  recorded delivery outcome. Add an `InvitationStatus` enum (`PENDING`, `ACCEPTED`, `REJECTED`,
  `CANCELLED`, `EXPIRED`) with `EXPIRED` derived from `expiresAt` for an unconsumed row. Add
  cancel (sender/admin) and decline (invitee) actions that invalidate the token, a role-change
  endpoint guarded by the capability matrix and the last-SUPER_ADMIN invariant, and a link that
  carries the target **organization id, clinic id and role** so the invitee supplies only profile
  and login details. Surface all of it on the staff directory page.
- **Target Audience**: Clinic Admins and Super Admins who invite and manage staff; invited staff
  (both brand-new and already-registered identities) who accept or decline; and the platform, which
  must guarantee that an invitation link can never widen scope beyond what its record allows.
- **Assumptions**:
  - The mutually agreed status model: a fresh invitation is `PENDING`; it becomes `ACCEPTED` on
    acceptance, `EXPIRED` when `expiresAt` passes unconsumed, `CANCELLED` when a sender/admin
    cancels it, and `REJECTED` when the invitee declines. (Owner decision, 2026-11-06.)
  - Mailtrap is the transactional provider; its SMTP credentials are supplied by environment
    variables and are never committed or logged (CON-519).
  - The existing `MAIL_SERVICE` token and `MailService` interface are the seam; the console
    implementation stays available for local/test without a provider.
  - `User.lastLoginAt` already exists on the schema and is read, never newly modelled here.
  - The organization/clinic/role in the link are a convenience hint only; the persisted invitation
    row remains the single source of truth (FR-047).

## User Stories

### US-023: Receive my invitation email

As an invited staff member, I want the invitation email to actually arrive in my inbox, so that I can act on it.

**Acceptance Criteria:**

- AC-046: Given an invitation is issued, when the mail service sends it, then it is delivered through an SMTP transport configured for Mailtrap using credentials read only from environment variables, and the raw invitation token is never written to a log or returned over HTTP.
- AC-047: Given an invitation email is rendered, when it is sent, then it uses a localized template (EN/AR/FR) containing the clinic name, the role and the accept link built from `BACKOFFICE_URL`.
- AC-048: Given the provider accepts or rejects the message, when the send completes, then the invitation's delivery outcome is persisted so an admin can tell a sent invitation from a failed one.
- AC-049: Given the SMTP transport is unreachable or misconfigured, when an invitation is issued, then the API returns a stable machine-readable code and the invitation is not presented as successfully delivered.

### US-024: See the status of every invitation

As a clinic admin, I want each invitation to show its current status, so that I know who is waiting, who joined, and who declined.

**Acceptance Criteria:**

- AC-050: Given the invitations for the active clinic, when the directory is rendered, then each row shows exactly one of `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED` or `EXPIRED`.
- AC-051: Given an invitation whose `expiresAt` has passed and whose token was never consumed, when it is read, then it is reported as `EXPIRED` without requiring a manual write.
- AC-052: Given an invitation that was accepted, when it is read, then it is reported as `ACCEPTED` and it can no longer be cancelled or declined.

### US-025: Cancel an invitation I sent

As a clinic admin or the sender, I want to cancel an invitation, so that a mis-addressed or no-longer-wanted invitation cannot be used.

**Acceptance Criteria:**

- AC-053: Given a `PENDING` invitation in my clinic, when the sender or a clinic admin cancels it, then its status becomes `CANCELLED` and its token can never be used again.
- AC-054: Given a successful cancellation, when it completes, then an audit row records the actor, the invitation, and the previous and new status inside the same transaction.
- AC-055: Given an invitation that is not `PENDING` (accepted, expired, cancelled or rejected), when a cancel is attempted, then it is refused with a stable code and no state is changed.

### US-026: Decline an invitation I received

As an invited person, I want to decline an invitation I do not want, so that the clinic is not left waiting on me.

**Acceptance Criteria:**

- AC-056: Given a valid invitation link, when the invitee chooses to decline, then the invitation status becomes `REJECTED` and its token is invalidated.
- AC-057: Given a declined invitation, when the inviter reads the list, then it shows `REJECTED`, and the admin can issue a new invitation to the same email and clinic.

### US-027: Change a staff member's role

As a clinic admin, I want to change a member's role in the active clinic, so that responsibilities can change without removing and re-inviting the person.

**Acceptance Criteria:**

- AC-058: Given a `CLINIC_ADMIN` or `SUPER_ADMIN`, when they change a member's role in their clinic, then the membership role is updated and the change is reflected the next time a token is issued for that clinic.
- AC-059: Given a role change that would leave an organization with zero `SUPER_ADMIN` members, when it is submitted, then it is refused (FR-029) and no change is written.
- AC-060: Given a successful role change, when it completes, then an audit row records the target membership and the before/after role.

### US-028: Join with only my profile and login details

As an invited person, I want the link to already know my organization, clinic and role, so that I only fill in who I am and my password.

**Acceptance Criteria:**

- AC-061: Given an invitation is created, when the link is generated, then it carries the invitation token together with the target organization id, clinic id and role.
- AC-062: Given an already-registered identity opens the link, when the accept page loads, then the organization, clinic and role come from the link and the person supplies only their profile details and login password.
- AC-063: Given a brand-new invitee opens the link, when the accept page loads, then the organization and clinic come from the link and the person supplies only profile and login details; they cannot select or join any other clinic.
- AC-064: Given a link whose organization, clinic or role claims disagree with the stored invitation record, when it is submitted, then the stored record is authoritative, the mismatch is ignored, and the join uses the recorded clinic and role (FR-047).

## Requirements

### Functional Requirements

- FR-039: The system MUST deliver staff invitations through a real transactional email transport (Mailtrap over SMTP) configured exclusively from environment variables, replacing the console stub behind the existing `MAIL_SERVICE` interface.
- FR-040: The system MUST render invitation emails from localized templates in EN, AR and FR, including the clinic name, the role and the accept link.
- FR-041: The system MUST persist the delivery outcome of each invitation so the directory can distinguish a sent invitation from one whose delivery failed.
- FR-042: The system MUST expose an invitation status of `PENDING`, `ACCEPTED`, `REJECTED` or `CANCELLED`, and MUST derive `EXPIRED` for an unconsumed invitation whose `expiresAt` has passed.
- FR-043: The system MUST allow the inviting user or an admin of the clinic to cancel a `PENDING` invitation, invalidating its token and setting its status to `CANCELLED`.
- FR-044: The system MUST allow the invitee to decline a valid invitation, setting its status to `REJECTED` and invalidating its token.
- FR-045: The system MUST allow a `CLINIC_ADMIN` or `SUPER_ADMIN` to change a member's role within their scope, and MUST refuse any change that would leave an organization with zero `SUPER_ADMIN` members.
- FR-046: The system MUST include the target organization id, clinic id and role in the invitation link so the invitee supplies only profile and login details.
- FR-047: The system MUST treat the persisted invitation record as the source of truth: a link whose organization, clinic or role claims disagree with the record MUST be rejected rather than honoured.
- FR-048: The system MUST present the invitation lifecycle on the staff directory page — status, resend, cancel, decline outcome and per-member role change — alongside each member's last login.

### Non-Functional Requirements

- NFR-014: Invitation and password-reset email MUST be sent over authenticated SMTP (Mailtrap), and provider credentials MUST come only from environment variables and MUST NOT be committed or logged. (CON-519)
- NFR-015: Every new mail configuration key MUST be documented in `server/.env.example` by name only and MUST NOT be committed with real values. (CON-519, NFR-007)
- NFR-016: The mail send MUST NOT execute inside the database transaction that creates or updates the invitation, so a slow or failing provider cannot hold a transaction open or roll one back.
- NFR-017: Invitation and reset templates MUST escape every interpolated value and MUST NOT use `dangerouslySetInnerHTML` or unescaped interpolation. (NFR-005, CON-517)
- NFR-018: The staff directory MUST render status labels in EN, AR and FR with RTL-correct layout, with no hard-coded user-facing strings. (CON-304, CON-305, NFR-012)
- NFR-019: Directory reads MUST remain bounded: the invitation and member list MUST be paginated and MUST NOT load every invitation for an organization in one response.

## Edge Cases & Error States

- EC-019: The invitation email fails to send → the invitation still exists as `PENDING` with a failed delivery outcome; the directory offers resend; nothing is presented as successfully sent.
- EC-020: A declined invitee is invited again → a new token is issued (FR-031 revokes the previous one) and the earlier row stays `REJECTED` for the record.
- EC-021: A cancel is attempted after the invitee already accepted → it is refused with a stable code, because the membership already exists (AC-055).
- EC-022: A role change targets the only `SUPER_ADMIN` → it is refused and no change is written (FR-029, AC-059).
- EC-023: The link names a clinic the inviter no longer belongs to → the invitation record is authoritative, the link claim is ignored, and the join uses the recorded clinic (FR-047).
- EC-024: Two invitations are issued for the same email and clinic → the earlier token is revoked (FR-031) and only the newest row remains `PENDING`.

## Out of Scope (v2)

- Any change to v1's tenancy model, scoped-token issuance, registration wizard or workspace switching — those ship as-is.
  - **Scope update 2026-11-08:** workspace switching and clinic creation are now in scope (US-031, FR-055–FR-058). v1's tenancy model, scoped-token issuance and registration wizard remain as-is.
- Real SMS or WhatsApp delivery of invitation or reset codes.
- Bulk/CSV staff import and scheduled reminders for un-accepted invitations.
- Passwordless / magic-link sign-in; only the invitation-specific decline link is added.
- Ownership transfer between clinics and cross-organization membership moves.
- A deliverability analytics dashboard (bounce/delivery-rate reporting) beyond the single per-invitation delivery outcome.

## Dependencies & Risks

- **External dependency**: Mailtrap (SMTP endpoint) must be reachable and its credentials provisioned per environment (BP-047). Without it, invitations fall back to the console transport and no email is delivered.
- **External dependency**: v1's dependency on Redis (BP-046) and the tenancy model (BP-008) is unchanged and inherited.
- **Upstream dependency**: v1 must remain archived and untouched (CON-605); v2 continues its IDs and reuses its modules.
- **Risk**: changing a member's role is a privilege-escalation path. Mitigation: the capability matrix (`CAPABILITY_ROLES`) gates the endpoint, changes are tenant-scoped via `clinicWhere`, and every change is audited (AC-060).
- **Risk**: the invitation link now carries organization and clinic ids, which an attacker could tamper with. Mitigation: the link claims are advisory only and the server resolves the persisted invitation record as the source of truth (FR-047, AC-064).
- **Risk**: a synchronous provider call on the request path could slow invitation creation or fail it. Mitigation: the send runs outside the invitation transaction (NFR-016) and a failed send is recorded, not thrown, so the invitation row is still created (AC-049, EC-019).

## Scope Extension — 2026-11-08: Settings, Organization Overview & Workspace

### User Stories

#### US-029: Configure my clinic and its staff roles

As a clinic owner or admin, I want one settings area for clinic details, working hours and staff roles, so that the clinic's recorded operation matches its real schedule and responsibilities.

**Acceptance Criteria:**

- AC-065: Given an authenticated clinic member with `manageSettings`, when they open `GET /api/clinics/settings`, then the response contains the active clinic's name, address, contact email, phone, default language, timezone and seven-day working hours, all scoped to that clinic.
- AC-066: Given a settings update with an open day whose start is missing or not before its end, when `PATCH /api/clinics/settings` is called, then the request is rejected with `400` and no field or working-hours change is written.
- AC-067: Given a working day with two identical or overlapping breaks, when the settings are submitted, then the request is rejected with `400 INVALID_BREAKS` and no change is written; a valid break is persisted.
- AC-068: Given an admin opens roles, when they list, create, update or delete a custom role, then the four built-in roles are returned as non-editable system roles, a custom role is stored with its base role and a permission subset, duplicate names are rejected, and deleting removes it from the clinic.
- AC-069: Given an admin opens Settings, then all eight sections are reachable by route: clinic information, working hours and roles/permissions are functional; departments, appointments, reminders, audit log and appearance are clearly labelled placeholders that make no settings mutation.

#### US-030: See activity across my whole organization

As an organization member, I want an overview of every clinic in my organization, so that I can compare activity without switching clinics first.

**Acceptance Criteria:**

- AC-070: Given an authenticated member requests `GET /api/organizations/overview`, then the response contains organization totals for clinics, staff, patients, today's appointments and upcoming appointments, plus one row for every clinic in that organization.
- AC-071: Given a member belongs to organization A, when they request the overview, then no clinic, count or patient from organization B is returned; an organization with no activity returns zero totals rather than an error.

#### US-031: Switch clinics and create a clinic from the workspace

As a staff member with more than one clinic, I want to switch clinics or create a clinic from the sidebar, so that I can work in the right clinic without signing in again.

**Acceptance Criteria:**

- AC-072: Given a member belongs to several clinics, when the sidebar switcher opens, then every active membership is listed, the current clinic is marked active, and the header does not duplicate the active clinic name.
- AC-073: Given a member selects another clinic, when the switch succeeds, then the server validates the membership, issues a new scoped access token and rotates the refresh cookie, and the client proves the refresh before reloading; a failed switch shows an error and does not send the user to signup.
- AC-074: Given an admin creates a clinic from the workspace, then the clinic is created in the active organization with the source clinic's timezone and currency, the creator receives a membership with their current role, an audit row is written, and the new clinic becomes active.
- AC-075: Given the create-clinic dialog is empty or the switch is in flight, then the form rejects an empty name, the switcher shows a "Switching…" state and disables repeat switches, and errors are announced to assistive technology.

### Functional Requirements

- FR-049: The system MUST expose `GET /api/clinics/settings` and `PATCH /api/clinics/settings` for the active clinic's name, address, contact email, phone, default language, timezone and seven-day working hours (AC-065).
- FR-050: The system MUST validate working hours and breaks - every open day has a start before its end, breaks fall inside the day, and breaks neither duplicate nor overlap - and MUST reject an invalid update with `400 INVALID_WORKING_HOURS` or `400 INVALID_BREAKS` without writing (AC-066, AC-067).
- FR-051: The system MUST list the four built-in roles and the clinic's custom roles, and MUST allow an admin to create, update and delete a custom role with a name, one base role and a permission subset of that base role; built-in roles are immutable and duplicate names are rejected (AC-068).
- FR-052: The system MUST provide a settings shell with eight routed sections; clinic information, working hours and roles/permissions are functional, while departments, appointments, reminders, audit log and appearance are placeholder-only and MUST NOT call a settings mutation (AC-069).
- FR-053: The system MUST expose `GET /api/organizations/overview` with organization totals and per-clinic rows for clinics, staff, patients, today's appointments and upcoming appointments (AC-070).
- FR-054: The system MUST scope the organization overview to the caller's organization and MUST NOT disclose another organization's clinics or counts (AC-071).
- FR-055: The system MUST list the caller's active memberships for the workspace switcher and MUST identify the active clinic from the scoped token (AC-072).
- FR-056: The system MUST switch the active clinic through `POST /api/auth/switch-workspace`, validating an active membership before issuing a new scoped access token and rotating the refresh cookie; the client MUST verify the refresh before reload (AC-073).
- FR-057: The system MUST create a clinic through `POST /api/clinics` inside the active organization, inherit the source clinic's timezone and currency, give the creator a membership with their current role, write an audit row and make the new clinic active (AC-074).
- FR-058: The system MUST present the workspace switcher and create-clinic dialog with an active marker, a "Switching…" disabled state, error feedback, keyboard/ARIA support and no duplicate active-clinic header (AC-072, AC-075).

### Non-Functional Requirements

- NFR-020: Settings and role writes MUST be tenant-scoped and MUST be restricted to roles with `manageSettings`; every write MUST be audited with the actor and before/after values (AC-065, AC-068).
- NFR-021: A custom role's permissions MUST be a subset of its base role's capabilities; the API MUST reject an attempt to grant a permission outside that base role and MUST NOT change the role (AC-068).
- NFR-022: Every new settings, overview and workspace control MUST render in EN, AR and FR with RTL-correct layout and accessible labels; placeholder sections MUST say they are not yet available (AC-069, AC-075).
- NFR-023: The organization overview MUST be bounded to the caller's organization and MUST NOT expose cross-organization counts; the response MUST remain a single aggregate with per-clinic rows rather than loading every clinic's full record set (AC-070, AC-071).
- NFR-024: A workspace switch MUST validate an active membership and MUST prove the rotated refresh cookie before the client reloads; an invalid switch MUST NOT leave a token for the rejected clinic (AC-073).
- NFR-025: Clinic creation MUST run in a transaction with its membership and audit row, and MUST inherit the source clinic's timezone and currency so schedules and amounts do not silently change (AC-074).

### Edge Cases & Error States

- EC-025: A working day is open with a missing or reversed start/end time → `400 INVALID_WORKING_HOURS`, no write.
- EC-026: Two breaks on the same day are identical or overlap → `400 INVALID_BREAKS`, no write.
- EC-027: A custom role requests a permission outside its base role → `400`, no role is created or changed.
- EC-028: A custom role name already exists, or a built-in role is edited/deleted → `409`/`403`, no write.
- EC-029: The organization has no patients or appointments yet → totals are zero and the clinic rows still render.
- EC-030: A member switches to a clinic they do not belong to → the server rejects the switch; the client clears the stale active state and shows an error, never the signup screen.
- EC-031: A create-clinic request has a blank or whitespace-only name → `400 CLINIC_NAME_REQUIRED`, no clinic or membership is written.
- EC-032: A placeholder settings section is opened directly by URL → the placeholder renders with no API call and the route survives a reload.

### Out of Scope (extension)

- Assigning a custom role to a staff member; custom roles are editable definitions in v2, and membership role changes continue to use the four built-in roles.
- Backend behavior for departments, appointments, reminders, audit log and appearance; those sections are UI-only placeholders.
- Billing, subscription management, cross-organization membership moves and per-clinic branding beyond the settings fields listed in FR-049.
