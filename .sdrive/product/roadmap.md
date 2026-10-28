# RI'AYA — Roadmap

> **Status:** Proposed
> **Last Updated:** 2026-10-27
> **Source:** MediFlow brief §12 sprint plan (mirrored exactly, per owner decision), Ri'aya feature spec, repository discovery

Six milestones mirror the brief's six two-week sprints. Time horizons are **tentative** — they
are the brief's plan, not a committed schedule. Order is driven by dependency, not preference.

---

## Sequencing rationale

The critical path is: **tenancy → availability → booking → queue → optimisation**. Everything
else hangs off it.

1. Nothing about patients or appointments is meaningful until a clinic exists as an entity, so
   tenancy (MT-1) comes before the patient work.
2. You cannot generate free slots until working hours and leave exist, so availability (DOC-2)
   precedes appointments (APP-1/APP-2).
3. Conflict-free booking is the product's core promise, so it lands before any polish.
4. The optimiser is meaningless without real schedules and real conflicts to resolve, so smart
   scheduling comes after booking is stable.
5. Chat and notifications are additive and must not jeopardise the core flows, so they sit last.
6. Billing was added by the owner beyond the brief's scope and is therefore late, after the
   graded core is complete.

## Milestone overview

| Milestone                              | Sprint goal (from the brief)                         | Focus                                                      |
| -------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| **M1 — Foundation & shell**            | Login, empty shell in 3 languages, CI green          | FND-1…3, AUTH-1, I18N-1, UI-1, UI-2                        |
| **M2 — Tenancy, people & records**     | Patients and doctors with roles and audit            | MT-1…3, AUTH-2, AUTH-3, I18N-2, USR-1, PAT-1, PAT-2, DOC-1 |
| **M3 — Availability & booking**        | Slots, conflict-safe booking API, dashboard          | DOC-2, APP-1, APP-2, ANA-1                                 |
| **M4 — Booking experience**            | Full booking wizard, list and calendar, reminders    | APP-3, APP-4, APP-5, SMT-1                                 |
| **M5 — Optimisation & live queue**     | Smart Scheduling screen, live queue                  | SMT-2…4, QUE-1, QUE-2, RT-1                                |
| **M6 — Realtime, analytics & release** | Chat, notifications, analytics, settings, deployment | RT-2, RT-3, ANA-2, SET-1, BIL-1, QA-1…4                    |

## M1 — Foundation & shell

**Goal:** a running, tested, linted, localised skeleton with real authentication and CI.

| ID     | Item                                                               | Depends on   |
| ------ | ------------------------------------------------------------------ | ------------ |
| FND-1  | Monorepo + docker-compose (pg/redis/mongo) + lint/format/hooks     | —            |
| FND-2  | ERD, migrations, idempotent fictional seed                         | FND-1        |
| FND-3  | API skeleton: validation pipe, exception filter, Pino, Swagger, CI | FND-1        |
| AUTH-1 | Register/login/refresh/logout, argon2, Redis blacklist, lockout    | FND-3        |
| I18N-1 | Language switch + full RTL + Arabic font                           | UI-1         |
| UI-1   | Design tokens + component library + Storybook                      | FND-1        |
| UI-2   | App shell: sidebar, top bar, breadcrumbs, user menu                | UI-1, AUTH-1 |

**Exit criteria:** `docker compose up` works from a clean clone in under 5 minutes; `/health`
reports each database; CI is green; login works and the shell renders in all three languages.

## M2 — Tenancy, people & records

**Goal:** real clinic isolation, staff management, and the first business records.

| ID       | Item                                                                                      | Depends on   |
| -------- | ----------------------------------------------------------------------------------------- | ------------ |
| **MT-1** | Global identity: `organizations` → `clinics` → `user_memberships`                         | FND-2 **P0** |
| **MT-2** | `/auth/switch-workspace` + workspace switcher UI                                          | MT-1, AUTH-1 |
| **MT-3** | Tenant isolation guard (JWT-sourced scope) + automated isolation test                     | MT-1         |
| AUTH-2   | RBAC, route guards, 403 on cross-role                                                     | AUTH-1       |
| AUTH-3   | Audit trail (who/what/when/before-after)                                                  | MT-1         |
| I18N-2   | `Intl` dates/numbers, translated API errors via `Accept-Language`                         | I18N-1       |
| USR-1    | User directory, email invite flow, suspend/revoke                                         | MT-1, AUTH-3 |
| PAT-1    | Patient directory API + screen (search/filter/paginate, soft delete, duplicate detection) | MT-3         |
| PAT-2    | Patient profile tabs + field-level permissions                                            | PAT-1        |
| DOC-1    | Doctor/staff CRUD, card + table views, utilisation %                                      | MT-3         |

**Exit criteria:** a user in Clinic A provably cannot read Clinic B's data (automated test); a
receptionist gets 403 from an admin-only endpoint; patients and doctors are manageable with a
working audit log.

**Note:** MT-1 is the single highest-risk item in the roadmap. It changes the schema that
AUTH-1 currently runs on, so it should be designed before M2 starts, not during.

## M3 — Availability & booking

**Goal:** the system can decide what is genuinely bookable, and cannot double-book.

| ID    | Item                                                                             | Depends on   |
| ----- | -------------------------------------------------------------------------------- | ------------ |
| DOC-2 | Working hours, breaks, leave, and the slot generator                             | DOC-1        |
| APP-1 | Appointment CRUD + state machine + human-readable IDs                            | DOC-2, PAT-1 |
| APP-2 | Conflict detection (Postgres exclusion constraint) + Redis slot lock (5-min TTL) | APP-1        |
| ANA-1 | Executive dashboard: 4 KPIs, today's timeline, 4 charts, 60 s cache              | APP-1        |

**Exit criteria:** no slot is ever generated inside a break, leave or outside working hours; an
illegal transition returns 409; overlapping bookings are impossible; dashboard KPIs match a
manual SQL check.

## M4 — Booking experience

**Goal:** staff can book end-to-end in the UI, and slots are measured.

| ID    | Item                                                              | Depends on   |
| ----- | ----------------------------------------------------------------- | ------------ |
| APP-3 | 5-step booking wizard                                             | APP-2, PAT-2 |
| APP-4 | Appointment list + day/week/month calendar                        | APP-1        |
| APP-5 | Reminders (BullMQ + mock provider) and waitlist auto-fill         | APP-1        |
| SMT-1 | Schedule metrics service (utilisation, idle gaps, estimated wait) | APP-1        |

**Exit criteria:** **Journey A** passes; metrics match a hand-calculated unit test and the cache
invalidates within 1 second of a booking.

## M5 — Optimisation & live queue

**Goal:** the signature features work and are race-free.

| ID    | Item                                                                      | Depends on  |
| ----- | ------------------------------------------------------------------------- | ----------- |
| SMT-2 | Deterministic optimiser (no ML)                                           | SMT-1       |
| SMT-3 | Optimisation grid (dnd-kit) + insights panel + preview                    | SMT-2, UI-1 |
| SMT-4 | Apply / rollback (15 min) + stale-schedule rejection                      | SMT-3       |
| QUE-1 | Queue engine: Redis ZSET, triage, race-free "call next"                   | APP-1       |
| QUE-2 | Queue screen + public display + QR self check-in                          | QUE-1       |
| RT-1  | `realtime-service` (second NestJS app, MongoDB, Socket.IO, Redis adapter) | FND-1       |

**Exit criteria:** **Journeys B and C** pass; two receptionists clicking "Call next"
simultaneously never call the same patient; a socket without a valid token is refused.

## M6 — Realtime, analytics & release

**Goal:** chat, notifications, reporting, settings, billing, and a deployed demo.

| ID    | Item                                                            | Depends on   |
| ----- | --------------------------------------------------------------- | ------------ |
| RT-2  | Staff chat (direct/group, typing, read receipts)                | RT-1         |
| RT-3  | Notification centre                                             | RT-1         |
| ANA-2 | Analytics + reports + CSV/PDF export                            | ANA-1        |
| SET-1 | Settings screens (org/clinic/user) + unsaved-changes guard      | MT-1, AUTH-3 |
| BIL-1 | Lightweight billing: invoices, payment, receipt, insurance card | APP-1        |
| QA-1  | Unit + Supertest integration + Playwright E2E (3 journeys)      | all          |
| QA-2  | Security hardening + OWASP threat model                         | all          |
| QA-3  | Performance: k6 load test, p95 < 400 ms                         | ANA-1, APP-1 |
| QA-4  | Docker images, CD, docs, demo accounts                          | all          |

**Exit criteria:** all three mandated E2E journeys pass in CI in under 10 minutes; the deployed
demo is reachable with working logins per role; no high or critical `npm audit` findings.

## Cross-cutting workstreams (continuous, not milestone-bound)

These cut across every milestone and must not be deferred to M6:

| Workstream                                                          | Cadence       |
| ------------------------------------------------------------------- | ------------- |
| i18n + RTL on every new screen                                      | Every UI task |
| Accessibility (WCAG 2.1 AA, focus, contrast, no colour-only status) | Every UI task |
| Tests for new logic; integration test per endpoint                  | Every task    |
| Swagger updates, committed migrations, no secrets                   | Every task    |
| Lint + typecheck + tests green in CI                                | Every PR      |

## Deferred (not scheduled)

| Item                                                   | Reason                                   |
| ------------------------------------------------------ | ---------------------------------------- |
| Patient portal                                         | Optional in the brief; deferred by owner |
| AI quick-book / message drafter / analytics summariser | Optional bonus in the Ri'aya spec        |
| `packages/shared`                                      | Offered as FND-4; owner did not add it   |

## Open questions

- Confirm the tentative two-week length still applies.
- Should MT-1 be pulled forward into M1, given it changes the schema AUTH-1 sits on?
- Is `packages/shared` needed before MT-1 (shared Zod schemas for the new tenancy DTOs)?
