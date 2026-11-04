# RI'AYA — Conceptual App Map & Mockup

> **Status:** Conceptual overview only — not an implementable prototype
> **Last Updated:** 2026-10-27
> **Source:** Ri'aya feature spec part 1, MediFlow brief §11 (UI-1, UI-2), 21 screenshots (names only)

This document describes **areas, navigation and journeys in words and tables**. It contains no
HTML, CSS, JavaScript or interactive prototype, and no image mockups. Visual layout details are
**not** specified here because the 21 design screenshots were not visually inspected.

---

## 1. Application map

Two front-end surfaces plus two back ends:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  web (Next.js, :3000) — public, unauthenticated, SEO, localized landing   │
└──────────────────────────────────────────────────────────────────────────┘
                                  │  links to
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  backoffice (React + Vite, :5174) — authenticated staff application       │
└──────────────────────────────────────────────────────────────────────────┘
                                  │  HTTPS /api
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  server (NestJS, :4000/api) ── guards: JWT → roles → clinic scope         │
│      ├── PostgreSQL   (transactional: clinics, patients, appointments…)   │
│      └── Redis        (cache, locks, rate limits, BullMQ, socket adapter) │
└──────────────────────────────────────────────────────────────────────────┘
                                  │  domain events (appointment.created, queue.updated…)
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  realtime-service (NestJS #2, Socket.IO) ── MongoDB (chat, notifications) │
└──────────────────────────────────────────────────────────────────────────┘
```

### Public surfaces (no authentication)

| Area                                               | Purpose                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| Marketing landing page (`/`, `/[locale]`)          | Product description, localised EN/AR/FR                                    |
| Public waiting-room display (`/display/:clinicId`) | Read-only screen showing queue number and room only — **no personal data** |

### Authenticated surfaces (backoffice)

| Area                 | Primary roles                                        | Purpose                                                              |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| Dashboard            | All                                                  | 4 KPI cards, today's schedule timeline, 4 charts                     |
| Appointments         | Receptionist, Clinic Admin, Doctor                   | List + day/week/month calendar, booking wizard, conflict detection   |
| Smart Scheduling     | Clinic Admin                                         | Metrics, optimisation grid, insights, preview, apply/rollback        |
| Waiting List / Queue | Receptionist, Doctor                                 | Check-in, triage, call next, start/complete consultation             |
| Patients             | Receptionist (admin data), Doctor (clinical notes)   | Directory, profile tabs, intake forms                                |
| Doctors & Staff      | Clinic Admin                                         | Directory (card + table), working hours, breaks, leave, rooms        |
| Analytics & Reports  | Clinic Admin, Super Admin                            | Volume, no-show/cancellation rates, wait-time trends, CSV/PDF export |
| Billing              | Receptionist, Clinic Admin                           | Invoices, point-of-care payment, receipt, insurance card             |
| Chat                 | All staff                                            | Direct and group chat, typing indicators, read receipts              |
| Notifications        | All staff                                            | Bell with unread counter; reminders, cancellations, conflicts        |
| Settings             | Org (Super Admin), Clinic (Clinic Admin), User (all) | Hierarchical configuration                                           |
| Audit Log            | Super Admin, Clinic Admin                            | Who/what/when + before/after values                                  |

### Auth & tenancy surfaces

| Area                                     | Purpose                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Login / Logout                           | JWT + refresh cookie                                                          |
| Register wizard (3 steps)                | New Super Admin: Account → Organization → first Clinic                        |
| Accept invite (`/accept-invite?token=…`) | Staff set their own password; staff cannot self-register for a clinic         |
| Workspace switcher                       | Switch between clinics; shows role per clinic, e.g. "Central Clinic — Doctor" |
| Forgot / Reset password                  | Token-based reset                                                             |

## 2. Navigation model

```
Sidebar (role-filtered)
├── Dashboard
├── Appointments ── Calendar (Day | Week | Month)
│                └── New Appointment (5-step wizard)
├── Smart Scheduling
├── Waiting List / Queue
├── Patients ── Patient Profile (tabs)
├── Doctors & Staff ── Doctor Detail (hours, breaks, leave)
├── Analytics & Reports
├── Billing
└── Settings ── Organization | Clinic | User | Audit Log

Top bar
├── Workspace switcher (clinic + role per clinic)
├── Language switcher (EN / AR / FR)
├── Notification bell (unread counter)
├── Chat
└── User menu (profile, settings, logout)
```

Two navigational rules from the spec:

- **The sidebar shows only what the role permits.** A receptionist never sees Settings or
  Analytics.
- **Field-level permissions inside a page.** On a patient profile, a receptionist sees
  administrative data while a doctor sees clinical notes.

## 3. Screen inventory

| Screen            | Key elements                                                                                          | Roles                               |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Dashboard         | Greeting, 4 KPI cards with deltas, today's timeline with current-time marker, 4 charts, activity feed | All                                 |
| Appointment list  | Filters, search, pagination, colour-coded status badges, bulk actions                                 | Receptionist, Admin                 |
| Calendar          | Day / Week / Month, colour-coded, drag to move                                                        | Receptionist, Admin, Doctor         |
| Booking wizard    | 5 steps: Patient → Doctor → Date/Time → Details → Review                                              | Receptionist                        |
| Smart Scheduling  | Metrics panel, drag-and-drop grid, insights panel, preview diff, Apply / Undo                         | Clinic Admin                        |
| Queue screen      | Summary cards (waiting, average wait, longest wait), ordered list, action buttons                     | Receptionist, Doctor                |
| Public display    | Queue number and room only                                                                            | Unauthenticated                     |
| Patient directory | Table with search, filters, pagination, soft-deleted hidden                                           | Receptionist                        |
| Patient profile   | Tabs: Personal Info, Upcoming, Past Visits, Clinical Notes, Contact Preferences                       | Receptionist / Doctor (field-level) |
| Doctor detail     | Profile, weekly schedule, breaks, leave, utilisation %, room assignment                               | Clinic Admin                        |
| Analytics         | Date-range picker with previous-period comparison, charts, export                                     | Clinic Admin                        |
| Settings          | Sectioned forms with inline validation, unsaved-changes guard, confirm dialogs                        | Per scope                           |
| Chat              | Conversation list, message thread, typing indicator, read receipts                                    | All staff                           |

## 4. Representative journeys

### Journey A — Book an appointment (the flanking happy path)

1. Receptionist opens **Appointments → New Appointment**.
2. **Patient** — searches by name, ID or phone; the system warns if name+DOB or phone already
   exists.
3. **Doctor** — selects a doctor; specialty and default duration shown.
4. **Date/Time** — the slot generator returns only genuinely free slots. While the receptionist
   is in this step, the slot is **locked in Redis for 5 minutes** (`slot:{doctor}:{start}`).
5. **Details** — appointment type (Consultation, Follow-up, Emergency) and notes.
6. **Review** — confirm. If another booking won the race, the API returns the conflict and up to
   3 alternative slots.
7. The appointment appears on the calendar and the doctor's schedule; a reminder job is queued.

Never possible at any step: an overlapping appointment for the same doctor, or a slot inside a
break, leave or outside working hours.

### Journey B — Optimise a schedule

1. Clinic Admin opens **Smart Scheduling** for a date.
2. The metrics panel shows per-doctor booked/free minutes, idle gaps, utilisation and estimated
   waiting time (cached 60 s, invalidated on any appointment change).
3. The optimiser proposes a set of moves (deterministic heuristic — never ML).
4. Insights panel previews the expected waiting-time reduction.
5. Admin drags blocks to adjust, then presses **Apply Schedule**.
6. If the schedule changed since the proposal was generated, the apply is **rejected** as stale.
7. Undo is available for **15 minutes**.

### Journey C — Queue and consultation

1. Patient arrives and scans the clinic QR code → self check-in into the queue.
2. Triage sets priority: Normal, Urgent or Emergency.
3. Receptionist presses **Call next**. Selection order: highest priority → earliest appointment
   time → earliest check-in (Redis sorted set prevents two receptionists calling the same
   patient).
4. Doctor starts the consultation, then completes it.
5. Waiting duration is computed **server-side** and survives a page reload.
6. The public display (`/display/:clinicId`) shows only the queue number and room.

### Journey D — Join a second clinic (tenancy)

1. A logged-in user opens the workspace switcher and chooses **+ Create New Organization** (or
   accepts an invite from an admin).
2. A membership row links the user to the new clinic with a role.
3. The switcher now lists both clinics with the per-clinic role.
4. Selecting a clinic calls `/auth/switch-workspace`, which re-issues the JWT with the new
   `org_id`, `clinic_id` and `role`.
5. Every subsequent query is filtered by `clinic_id` **taken from the token** — never from the
   request body. Clinic A can never read Clinic B's data.

## 5. State machines

**Appointment lifecycle** — illegal transitions are rejected (409):

```
Scheduled → Confirmed → Checked In → In Progress → Completed
    ↓            ↓            ↓            ↓
 Cancelled    Cancelled    No-show     Cancelled
```

**Queue entry:** waiting → called → in consultation → completed / no-show

## 6. Open questions

- How do the 21 screenshots map to the screens in the inventory above?
- Is there a separate route per calendar view, or one route with a view toggle?
- Does the public display require any auth token, or is it fully open?
- Where does the patient portal (if built) sit — `web`, or a fourth app?
