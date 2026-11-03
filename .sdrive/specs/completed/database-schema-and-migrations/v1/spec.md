---
title: Database schema and migrations
status: backlog
created: 2026-10-31
updated: 2026-10-31
---

# Database Schema and Migrations (BP-002)

> **Product item:** `BP-002` · Milestone M1 — Foundation & shell · Priority P0 · Brief task FND-2
> **Branch / base:** `feature/bp-002-bp-003-bp-006-bp-031` / `main` _(shared with BP-003, BP-006, BP-031)_

## 1. Overview

### Problem

The database models the platform's _access_ layer but none of its _work_: `User`, `Organization`,
`Clinic`, `UserMembership`, `Invitation`, `AuditLog`, `RefreshToken` and `PasswordResetToken` exist,
while the entities every later wave depends on — patients, doctors, appointments — do not. There is
also no ERD, no clinical seed, and no declared index strategy, so:

- BP-015 (patient directory), BP-016 (patient profile), BP-017 (doctor management), BP-018
  (availability) and BP-019 (appointment lifecycle) have nothing to build on;
- nothing can be demoed without inventing data by hand;
- the two access paths those features will hammer — _a doctor's day_ and _a patient's history_ —
  have no supporting indexes, so they would be written against an unindexed table and discovered
  slow only under load.

### Proposed solution

1. Model the clinical core — `Patient`, `Doctor`, `Appointment` (with an `AppointmentStatus` enum) —
   every row scoped to a `Clinic`, with the relations and cascade rules those features need.
2. Add the two indexes those access paths require: `(doctorId, startsAt)` and `(patientId)`.
3. Ship the change as a **forward-only Prisma migration** that is purely additive, so an existing
   database keeps its rows.
4. Add an **idempotent seed** of fictional data at the volumes the brief names: 3 clinics,
   10 doctors, 200 patients, 600 appointments.
5. Write an **ERD** that matches the models, so later specs cite a diagram rather than prose.

### Target audience

- The teams building BP-015…BP-019, whose plans will name these tables and fields.
- Anyone running the demo, who needs a realistic dataset without touching real patient data.
- CI and reviewers, who need `migrate deploy` to be a single, repeatable step.

### Assumptions

- **Doctors are staff.** A `Doctor` is a clinic-scoped profile row that _may_ link to a `User`
  through `userId`; it does not create a second identity system. A doctor who is also a receptionist
  keeps one `User` and one `Doctor` row.
- **Patients never authenticate in this version.** `Patient` has no credentials; the optional patient
  portal stays out of scope (as the authentication spec already recorded).
- **Scheduling semantics belong to BP-018/BP-019.** This feature defines the columns and
  constraints those features need (`startsAt`, `endsAt`, `status`) but not availability rules,
  conflict detection or the state machine's transitions.
- **No new dependency.** The seed generates its data with a small deterministic generator in the
  script rather than adding an unvetted faker package.
- **UTC storage.** All timestamps are `DateTime` stored UTC; clinic-local rendering is BP-013.
- The existing `20261028235000_init_tenancy` migration is already applied in dev and must not be
  edited.

### Out of scope

- Availability, working hours, breaks, leave and slot generation (BP-018).
- Appointment booking rules, conflict detection and the status state machine (BP-019).
- Queue ordering and the Redis sorted set (BP-029/BP-030).
- Patient portal, patient authentication, and patient-facing APIs.
- Billing tables (BP-036) and analytics/reporting views (BP-034).
- A production data-import path; the seed is development-only (CON-506).

## 2. User stories

### US-001 — A schema later features can build on

**As a** developer starting BP-015…BP-019, **I want** the clinical entities already modelled and
scoped, **so that** my feature adds behaviour instead of inventing tables.

| AC     | Criterion                                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-001 | Given the Prisma schema, when I read it, then `Patient`, `Doctor` and `Appointment` exist, each carrying `clinicId` with a foreign key to `Clinic`, and `Appointment` relates to both `Patient` and `Doctor`. |
| AC-002 | Given an empty database, when `prisma migrate deploy` runs, then every migration applies in order without manual intervention and the clinical tables exist.                                                  |

### US-002 — Append-only migration on a live database

**As a** maintainer, **I want** the schema change to be additive, **so that** an existing database
keeps its data when the migration is applied.

| AC     | Criterion                                                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-003 | Given a database already holding the tenancy data, when the new migration is applied, then no existing table is dropped or truncated and no existing row is lost. |
| AC-004 | Given the migrations have been applied, when they are applied again, then Prisma reports no pending migrations and exits 0.                                       |

### US-003 — The indexes the access paths need

**As a** developer, **I want** the two declared indexes to exist, **so that** a doctor's day and a
patient's history are lookups rather than scans.

| AC     | Criterion                                                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| AC-005 | Given the migrated schema, when I inspect `Appointment`'s indexes, then one covers `(doctorId, startsAt)` and one covers `(patientId)`. |

### US-004 — A realistic, fictional dataset

**As the** demo owner, **I want** one idempotent command to produce believable data, **so that** I can
demo scheduling without real patient information.

| AC     | Criterion                                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| AC-006 | Given an empty database, when the seed runs, then it creates 3 clinics, 10 doctors, 200 patients and 600 appointments.                 |
| AC-007 | Given the seed has run once, when it runs again, then the row counts are unchanged and no duplicate rows are created.                  |
| AC-008 | Given the seeded rows, when I inspect them, then every patient and doctor uses fictional details and no real personal data is present. |

### US-005 — A diagram that matches the code

**As a** reviewer, **I want** an ERD that matches the models, **so that** I can check a later plan
against one picture.

| AC     | Criterion                                                                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-009 | Given the repository, when I open the ERD, then it documents every clinical model — `Patient`, `Doctor`, `Appointment` — and their relations to `Clinic` and to each other. |

## 3. Functional requirements

- **FR-001:** The schema MUST define `Patient`, clinic-scoped (`clinicId` FK to `Clinic`), with name, date of birth, phone, optional email and optional gender, plus `createdAt`/`updatedAt`. (AC-001)
- **FR-002:** The schema MUST define `Doctor`, clinic-scoped, with an optional `userId` link to `User`, a specialty, an optional licence number, a consultation duration in minutes and an `isActive` flag. (AC-001)
- **FR-003:** The schema MUST define `Appointment`, clinic-scoped, holding `patientId`, `doctorId`, `startsAt`, `endsAt`, a `status` of an `AppointmentStatus` enum, an optional reason and `createdAt`/`updatedAt`, with relations to both `Patient` and `Doctor`. (AC-001)
- **FR-004:** The change MUST be delivered as a new Prisma migration that is additive only: it MUST NOT drop or truncate an existing table, and it MUST NOT modify the already-applied `init_tenancy` migration. (AC-002, AC-003, AC-004)
- **FR-005:** `Appointment` MUST declare an index on `(doctorId, startsAt)` and an index on `patientId`. (AC-005)
- **FR-006:** A seed script MUST create exactly 3 clinics, 10 doctors, 200 patients and 600 appointments, and MUST be idempotent: a second run leaves the row counts unchanged. (AC-006, AC-007)
- **FR-007:** Seeded identities MUST be fictional and derived deterministically (fixed generator seed), with no real personal data. (AC-008)
- **FR-008:** The repository MUST contain an ERD documenting the clinical models and their relations. (AC-009)

## 4. Non-functional requirements

- **NFR-001:** `prisma migrate deploy` MUST complete on an empty database in under 60 seconds without manual steps, so CI can run it unattended. (AC-002)
- **NFR-002:** The new migration MUST be forward-only and additive, so it can be applied to a populated database without a backfill. (AC-003)
- **NFR-003:** The seed MUST complete in under 60 seconds and MUST be safe to re-run at any time. (AC-007)
- **NFR-004:** Every clinical table MUST carry `clinicId` and a foreign key to `Clinic`, so tenant scoping is a schema guarantee rather than an application convention (CON-516). (AC-001)

## 5. Edge cases

| ID     | Case                                              | Expected behaviour                                                                                                                           |
| ------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| EC-001 | The seed is interrupted halfway                   | A re-run completes the remaining rows without duplicating the ones already written (upsert by natural key).                                  |
| EC-002 | Two patients in one clinic share a phone number   | Allowed; the natural key for seeding includes the clinic and the person's index, not the phone.                                              |
| EC-003 | An appointment's `endsAt` precedes `startsAt`     | Rejected by the seed generator; the schema cannot express the check, so BP-019 must enforce it on write and this feature documents that gap. |
| EC-004 | A `Doctor` row references a `User` who is deleted | `userId` is `SetNull`, so the clinic's doctor record survives the identity being removed.                                                    |
| EC-005 | A `Clinic` is deleted while it has patients       | Deletion is blocked by the foreign key (restrict), so clinical data cannot be orphaned silently.                                             |

## 6. Security Baseline

Read from `.sdrive/constitution.md` §Security Baseline (CON-51x). This feature adds database tables
and a development seed; it introduces no authentication path and no HTTP surface of its own.

| Control                           | Status         | Rationale for this feature                                                                                                                                                                                                                                        |
| --------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-511 Authentication            | NOT APPLICABLE | No credentials, tokens or login path is added. `Patient` deliberately has no credential columns.                                                                                                                                                                  |
| CON-512 Authorization             | NOT APPLICABLE | No route or guard is added. `clinicId` on every clinical table _prepares_ tenant scoping for BP-010/BP-015.                                                                                                                                                       |
| CON-513 Security Headers (Helmet) | NOT APPLICABLE | No response path changes.                                                                                                                                                                                                                                         |
| CON-514 Rate Limiting             | NOT APPLICABLE | No endpoint is added.                                                                                                                                                                                                                                             |
| CON-515 Input Validation          | NOT APPLICABLE | No request DTO; the seed writes through Prisma, not an endpoint.                                                                                                                                                                                                  |
| CON-516 NoSQL / Injection         | **REQUIRED**   | The migration is the only SQL in the change and is static DDL with no user input; all data access goes through Prisma's parameterised client. Tenant scoping is enforced as a schema constraint (FK + `clinicId`), not string concatenation. Expanded as NFR-004. |
| CON-517 XSS                       | NOT APPLICABLE | No UI renders this data in this version.                                                                                                                                                                                                                          |
| CON-518 CSRF                      | NOT APPLICABLE | No state-changing route is added.                                                                                                                                                                                                                                 |
| CON-519 Environment Security      | **REQUIRED**   | The seed reads `DATABASE_URL` from the environment only; it MUST NOT hardcode a connection string and MUST NOT run against anything but a development database. Expanded as NFR-003 and enforced by a startup guard in the seed.                                  |
| CON-520 HTTPS / HSTS              | NOT APPLICABLE | No transport configuration changes.                                                                                                                                                                                                                               |

Additionally **CON-506:** the seed's accounts and people are development-only fictional fixtures and
MUST NOT be reused in a deployed environment.

## 7. Dependencies

| Name                             | Type     | Notes                                                                                            |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| Prisma                           | library  | Already present and in use; this feature adds models and one migration.                          |
| PostgreSQL                       | service  | Already required; the migration targets it.                                                      |
| Deterministic generator (inline) | internal | No faker package is added; the seed ships a small seeded PRNG so re-runs produce identical data. |

## 8. Risks

| ID       | Risk                                                                                    | Mitigation                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| RISK-001 | A migration that rewrites an existing table locks it and fails on a populated database. | Additive-only DDL, no table rewrite, and AC-003 proves existing rows survive.                                                  |
| RISK-002 | The seed duplicates rows on a second run and inflates the demo dataset.                 | Upsert on a natural key per entity, with AC-007 asserting the counts are stable.                                               |
| RISK-003 | The indexes are added but a later feature queries another way and never uses them.      | The two indexes are named in FR-005 and verified by AC-005; BP-015/BP-019 plans must cite them.                                |
| RISK-004 | Fictional seed data drifts into being treated as real.                                  | Emails use `@riaya.local` / `example.org`, names come from a fixed fictional list, and CON-506 is restated in the seed header. |
| RISK-005 | `endsAt > startsAt` cannot be expressed in Prisma, so bad rows become possible later.   | EC-003 records the gap explicitly and assigns enforcement to BP-019 rather than pretending the schema covers it.               |

## 9. Research note

No external research was required for the modelling itself: the entities come from the backlog brief
and the Ri'aya spec parts already in `.sdrive/product/`. The one external detail — whether Prisma
supports a composite index in the `@@index` form used here — is documented behaviour of Prisma's
schema language and is verified at implementation time by generating the migration
(`prisma migrate dev`) and reading the emitted SQL.
