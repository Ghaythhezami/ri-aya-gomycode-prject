---
title: Authentication, Onboarding & Access Control (v2) — Invitation Delivery, Lifecycle & Role Management
status: backlog
version: v2
created: 2026-11-06
updated: 2026-11-06
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
