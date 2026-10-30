# RI'AYA (رعاية) — Product Overview

> **Status:** Approved
> **Last Updated:** 2026-10-27
> **Source:** onboarding interview + repository discovery + requirements documents
> **Approved by:** project owner (Gate: backlog approval, 2026-10-27)

RI'AYA is a multilingual clinic and appointment management platform. It is delivered as the
**MediFlow** assignment; "RI'AYA" is the product name used throughout this repository and
"MediFlow" is the name used in the assignment brief. Both refer to the same delivery.

---

## 1. Vision

Give clinics a platform that removes waiting-room chaos: a multilingual, multi-tenant
operations system where receptionists book conflict-free appointments, doctors see their own
schedule, and an optimiser visibly reduces patient waiting time — looking and behaving like a
sellable healthcare SaaS rather than a CRUD exercise.

## 2. Problem

Clinics coordinate doctors, rooms, equipment and patients across paper books, spreadsheets and
phone calls. The consequences are predictable:

- Double-booked doctors and rooms because availability lives in several places at once.
- Long, unexplained waiting times because nobody can see the whole floor at a glance.
- No-shows and cancellations that leave gaps nobody fills.
- Staff who cannot use the system in their own language or writing direction.

## 3. Target users

| Role                              | Who they are                    | What they need                                                               |
| --------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| **Super Admin**                   | Platform owner / group operator | Manage clinics, global settings, audit log                                   |
| **Clinic Admin / Manager**        | Runs one clinic                 | Staff, settings, analytics, reports for their clinic only                    |
| **Doctor**                        | Clinician                       | Own schedule and patients, start/complete consultations, manage availability |
| **Receptionist**                  | Front desk                      | Book, reschedule, cancel, check in, manage the queue                         |
| **Patient** _(portal — deferred)_ | The patient                     | View own appointments, book, cancel, receive reminders                       |

## 4. Primary outcome

A patient walks in, is checked in from a QR code, and is called in the correct priority order;
a receptionist books an appointment that cannot conflict with any other booking; and the
clinic's waiting time measurably drops when a suggested schedule is applied.

## 5. Scope

### In scope

Every screen in the visual reference (dashboard, appointments, create flow, smart scheduling,
waiting list, patients, doctors and staff, analytics, notifications, settings), plus staff chat
and real-time notifications, plus a lightweight billing module.

### Out of scope

- Real medical records — diagnoses and prescriptions.
- Real SMS or WhatsApp delivery. A **mock provider behind an interface** is used instead.
- Machine learning. Smart scheduling is a **deterministic heuristic**.
- The optional patient portal (deferred — see backlog).
- AI enhancements from the Ri'aya feature spec (AI quick-book, AI message drafter, AI analytics
  summariser) — explicitly optional, deferred.

### Data rule

**Fictional data only.** No real patient data may enter the repository, seeds, or screenshots.

## 6. Product decisions (owner-confirmed 2026-10-27)

| Decision          | Ruling                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product name      | **RI'AYA is the product.** The MediFlow brief defines the requirements; the brief's task IDs and acceptance criteria are used as stable identifiers.            |
| Repository layout | **Keep the current flat layout** (`web/`, `server/`, `backoffice/`). Plan `realtime-service` and `packages/shared` as new work rather than restructuring.       |
| Multi-tenancy     | **In scope, P0.** It blocks patients and appointments. Requires `organizations` → `clinics` → `user_memberships` and a workspace switcher.                      |
| Billing           | **Included**, lightweight (invoices, point-of-care payment, receipt, insurance card). The assignment brief marks billing out of scope; the owner overrode this. |
| Sprint plan       | **Mirror the brief's 6 × 2-week sprints** exactly.                                                                                                              |
| Test layout       | Colocated `server/src/**/*.spec.ts` (see `.sdrive/constitution.md` CON-403).                                                                                    |
| Database strategy | Prisma migrations for non-local environments; `db push` is local-only (CON-109).                                                                                |

## 7. Confirmed architecture (what exists today)

Verified from the repository on 2026-10-27:

| Package      | Stack                                                                     | Port          |
| ------------ | ------------------------------------------------------------------------- | ------------- |
| `web`        | Next.js 15 App Router, React 19, next-intl, Tailwind CSS 4                | 3000          |
| `server`     | NestJS 11, Prisma 6, PostgreSQL, ioredis, argon2                          | 4000 (`/api`) |
| `backoffice` | React 19, Vite 6, Redux Toolkit, react-hook-form + Zod, i18next, recharts | 5173          |

- Auth: JWT access (15 min) + refresh (7 days) in an HttpOnly cookie, with **token families** —
  reusing a rotated token revokes the family. Argon2 hashing. Account lockout after 5 failed
  logins in 10 min.
- Security baseline already applied: Helmet, global `ThrottlerGuard` (60/60 s), global
  `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`.
- Schema today: `User` (flat, single `role`), `RefreshToken`, `PasswordResetToken`. **No
  tenancy tables yet.**
- CI: `.github/workflows/ci.yml` runs install, lint, typecheck, test, build on Node 20 + pnpm 10.

## 8. Candidate architecture and tools (proposed, not approved)

| Item               | Proposal                                                           | Rationale                                                              | Status     |
| ------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------- | ---------- |
| `packages/shared`  | Shared Zod schemas + types consumed by API and both front ends     | Removes duplicated contracts; the brief mandates it                    | `proposed` |
| `realtime-service` | Second NestJS app + MongoDB (Mongoose) + Socket.IO + Redis adapter | Isolates append-heavy chat/notification data from the transactional DB | `proposed` |
| MongoDB            | Chat messages, notification feed, read receipts                    | High-volume, schema-flexible, append-heavy                             | `proposed` |
| BullMQ             | Reminders, waitlist auto-fill, domain events                       | Delayed/retryable background jobs                                      | `proposed` |
| dnd-kit            | Optimisation grid drag-and-drop                                    | Brief's suggested library                                              | `proposed` |
| Storybook          | Component documentation                                            | Brief's AC requires a story per component state                        | `proposed` |
| k6                 | Load testing (p95 < 400 ms)                                        | Brief's stated verification method                                     | `proposed` |
| Playwright         | The three mandated E2E journeys                                    | Brief's stated E2E tool                                                | `proposed` |

Database ownership (per the brief): PostgreSQL owns clinics, users, roles, patients, doctors,
specialties, working hours, leaves, appointments, queue entries, settings and the audit log.
Redis owns the refresh-token blacklist, rate-limit counters, cached dashboards and slot lists,
5-minute slot locks, BullMQ jobs and the Socket.IO adapter. MongoDB owns chat, notifications,
delivery logs and read receipts.

## 9. Non-functional requirements

| Area                 | Requirement                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Performance          | p95 < 400 ms for list endpoints; dashboard first paint < 2 s                                           |
| Security             | JWT with refresh rotation, RBAC, clinic isolation, rate limiting, audit log                            |
| Privacy              | Fictional data only; minimal personal data in lists and on the public screen; no personal data in logs |
| Accessibility        | WCAG 2.1 AA, keyboard navigation, visible focus, status never conveyed by colour alone                 |
| Internationalisation | EN, AR (full RTL), FR across every screen and API message                                              |
| Responsiveness       | 1440 px desktop, 768 px tablet, 375 px mobile; card lists replace wide tables on mobile                |
| Reliability          | Atomic schedule changes, idempotent notifications, socket auto-reconnect                               |

## 10. Design references

| Reference                                                 | Type                | Location                                                         | Access                   | What we take from it                                                                                    |
| --------------------------------------------------------- | ------------------- | ---------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Design screenshots, 21 files (`Screenshot (769–790).png`) | Static UI reference | `project-overview/`                                              | Present locally          | Layout, colour system and quality bar for dashboard, appointments, create wizard, calendar and patients |
| MediFlow brief design tokens                              | Written token table | `project-overview/MediFlow — Project Brief for Students.pdf` p.1 | Read                     | Exact colour, font and radius values (see `design-system.md`)                                           |
| `.sdrive/prototype/`                                      | Prototype scaffold  | `.sdrive/prototype/{css,js,screens}`                             | **Empty — folders only** | Nothing; no prototype exists                                                                            |

> **Note:** the visual content of the screenshots was **not inspected** (no vision available in
> that session). They are recorded as file names and as a quality reference only. Nothing was
> copied from them, and their specific layouts remain an open question.

No Figma link exists in the repository. The brief refers to a "Figma brief" as the source of the
token table, but no URL was provided.

## 11. Inspiration

No external inspiration sources (Dribbble, Behance, Mobbin, competitor products) were supplied
by the owner. Nothing is inferred.

## 12. Risks

| Risk                                                                        | Impact                                    | Mitigation                                                                     |
| --------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| Multi-tenancy is not in the current schema and blocks patients/appointments | High — rework if deferred                 | `MT-1` is P0 and scheduled first in M2                                         |
| Two documents disagree on naming and layout                                 | Medium — scope confusion                  | Owner ruled: Ri'aya is the product, current layout stays                       |
| MongoDB + a second service add operational weight                           | Medium — complexity                       | Keep it to one `realtime-service`; PostgreSQL/Redis remain authoritative       |
| Conflict detection correctness                                              | High — double-booking is the core promise | Postgres exclusion constraints + Redis slot lock + dedicated tests             |
| Accessibility and RTL are graded (15 points)                                | Medium                                    | WCAG 2.1 AA and RTL are acceptance criteria on every UI task, not a final pass |
| Screenshots not visually inspected                                          | Low–medium                                | Confirm layout details with the owner before implementing UI-1/UI-2            |

## 13. Open questions

- What exact screens do the 21 screenshots cover, and how should they map to routes?
- Is the optional **Patient portal** wanted at all, or permanently out of scope?
- Are the Ri'aya spec's **AI enhancements** wanted as a bonus, or dropped?
- Which hosting target for the deployed demo (free tier vs VPS)?
- Merge strategy and required-reviewer count (GitHub settings, not in the repo).
- Accessibility conformance is stated as WCAG 2.1 AA by the brief while `.sdrive/constitution.md`
  CON-309 marks the target `[to be confirmed]` — these should be reconciled.

## 14. Assumptions

- The two PDFs are authoritative requirements inputs, not build artifacts. `[assumption]`
- `web` remains the public/unauthenticated marketing surface; `backoffice` is the authenticated
  staff application where clinic operations live. `[assumption]`
- The graded deliverable includes a deployed demo URL and a 15-minute live demo. `[assumption]`
- Fictional seed data (3 clinics, 10 doctors, 200 patients, 600 appointments) is acceptable for
  all local and demo environments. `[assumption — from brief FND-2]`

---

## Previous draft (derived)

Preserved from the onboarding scan (README-derived, never reviewed):

### Vision

Multilingual clinic and appointment platform starter: public landing page, NestJS
authentication API, and staff backoffice.

### Existing Architecture

- pnpm
- monorepo (3 packages)

### Open Questions (from that draft)

- Was the vision above accurate, or is it only the opening paragraph of the README?
- Who are the target users? Nothing in the repository names them.
- What is this product for, and what is deliberately out of scope?
