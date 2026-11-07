# Benchmark: Doktouri (doktouri.com) — UI/UX review and upgrade ideas for RI'AYA

Reviewed 2026-11-07 on desktop (1440 px) and mobile (390 px): public landing, public doctor
directory and profiles, patient app shell, and the read-only doctor demo
(`/auth/login?demo=true`, no account needed). Nothing was submitted. Screenshots: `_scratch/doktouri/`
(outside the repository; third-party material, kept for internal reference only).

## 1. What Doktouri is

A Tunisian practice-management SaaS for **single doctors / small cabinets** plus a **patient
app** (PWA). French-first with an FR/AR switch, green brand, DM Sans headings and Inter body,
rounded cards, pill buttons. Freemium (Free / Pro 49 TND / Cabinet+ 99 TND) with metered SMS
and "AI credits".

## 2. Flows and patterns worth noting

| Area                    | What they do                                                                                                                                                                                                                                         | Why it works                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Landing hero            | One sentence, doctor search box, two role CTAs ("I am a doctor" / "I am a patient"), "Try the doctor demo" link                                                                                                                                      | Visitor self-segments in one click; search is the primary action for patients |
| Public doctor directory | Cards: photo or initials, specialty, city, **Book** button; "Use my location"                                                                                                                                                                        | Booking starts before any sign-up                                             |
| Public doctor profile   | Cover photo, verified badge, years of experience, consultation length, Message / Call, About, **visit types with duration and price**, cabinet address + map, **month calendar with dots on days that have availability → time slots**               | Everything a patient needs to decide, on one SEO-indexable page               |
| One-click demo          | Opens the full doctor workspace read-only with a sticky banner "Demo mode — changes are not saved"                                                                                                                                                   | Zero-friction evaluation; no credentials to type                              |
| Dashboard               | Greeting, period chips (Today / This week / This month / Custom), 4 KPI cards, insurance (CNAM) block, patient mix chart, **peak-hours heatmap**, revenue vs expenses, upcoming list with filters                                                    | Period filter drives every widget                                             |
| Calendar                | List / Day / Week / Month, "Today" button, current-time red line, mini month picker, time zone shown                                                                                                                                                 | Familiar Google-Calendar model                                                |
| Patient record          | Header actions (Message, Add document, Add appointment); personal + health section (blood group, chronic disease); **attendance stats** (total, attended, cancelled, attendance rate); visit history **grouped by month** with status and type chips | Clinician sees reliability and history at a glance                            |
| Availability editor     | Per day: on/off switch, open–close, breaks, **timeline bar 06:00–20:00** showing work vs break                                                                                                                                                       | Visual check of the week without reading numbers                              |
| Visit types             | Name · duration · price (e.g. Consultation 30 min · 70 TND, Follow-up 15 min · free, Emergency 45 min · 100 TND)                                                                                                                                     | Price is shown to patients when booking                                       |
| SMS workflows           | Cards "trigger → delay → send", e.g. _new booking → 24 h before → SMS_, _no-show → 2 h after → SMS_, _visit done → 48 h → SMS → if no reply 48 h → SMS_; toggle per workflow                                                                         | Automations are understandable without a rules engine UI                      |
| AI assistant            | Full page + floating bubble on every screen; answers rendered as **stat tiles** (e.g. revenue / expenses / net) above the text; conversation list                                                                                                    | Numbers are scannable; assistant always one click away                        |
| AI consultation summary | Settings toggle + choose sections (reason, findings, diagnosis, treatment, advice, next visit)                                                                                                                                                       | Doctor controls the output shape                                              |
| Audit log               | Date, action, entity, **"performed via"** (UI, assistant page, assistant bubble), details                                                                                                                                                            | Accountability for AI-initiated changes                                       |
| Patient app (mobile)    | Greeting, big "Book an appointment" button, **digital health card with a code**, counters (total, upcoming, done, prescriptions), doctor list, bottom tab bar (Home, Doctors, Messages, Blog, Profile)                                               | Thumb-first, one primary action                                               |
| Content                 | Health blog, short videos by doctors, public Q&A                                                                                                                                                                                                     | SEO and trust                                                                 |
| Pricing                 | 3 plans + detailed comparison table + "book a 30-min demo" date picker                                                                                                                                                                               | Clear upgrade path                                                            |

## 3. Weaknesses to avoid

- **Blocking install popup on the first visit** (modal over the hero before the user has seen anything).
  RI'AYA should offer install only after a successful action, never as a modal on load.
- **Empty demo**: the demo dashboard shows 0 appointments, 0 revenue, empty heatmap and AI
  conversations dated months ago. RI'AYA's daily re-seeded, date-relative demo is a real advantage — keep it.
- **17-item sidebar** (dashboard, appointments, consultations, queue, patients, inventory,
  staff, messages, SMS, Q&A, assistant, blog, videos, finances, reports, audit, settings).
  Group by job (Today / Patients / Clinic / Admin) instead.
- Inconsistent data quality on public pages: lower-case city names, "Other" as a specialty, missing photos.
- Marketing hero uses made-up metrics in the product mock.
- Their AI tile answers look pre-rendered; no visible confirmation step for AI-created records
  (only the audit log shows them afterwards). RI'AYA's confirm-card model is safer — keep it.

## 4. Where RI'AYA is already ahead

Multi-clinic tenancy with RBAC roles, full Arabic RTL, conflict-safe booking (serializable
transaction + exclusion constraint), live queue with public display and QR self check-in,
deterministic smart-scheduling optimiser, three role-specific AI assistants whose writes go
through confirmation cards, document OCR/extraction, staff chat, realtime notifications.

## 5. Recommended upgrades for RI'AYA (prioritised)

### P1 — highest impact, fits the current architecture

1. **Public doctor directory and profile pages on the landing (Next.js SSG, SEO).**
   `/[locale]/doctors` and `/[locale]/doctors/[slug]`: photo/initials, specialty, languages,
   clinic and map, visit types with duration and price, a month calendar with availability
   dots → slots → "Book" hands off to `/portal/register` (or login) with doctor, type and slot
   prefilled. `schema.org/Physician` + `MedicalClinic` JSON-LD, sitemap entries. Data from a new
   public, cached, read-only endpoint (only doctors whose clinic enabled the portal).
2. **One-click role demos.** "Try as front desk / doctor / clinic admin / patient" buttons on the
   landing and login page (only when `DEMO_MODE=true`), issuing a normal session for the seeded
   demo account, plus a sticky "Demo — data resets every day" banner. Removes the need to type
   demo passwords.
3. **Prices on appointment types** (amount + clinic currency, optional "free"), shown in staff
   booking, the portal and the public profile; used later for billing.
4. **Richer assistant answers.** Render tool results as UI, not only markdown: **clickable slot
   chips** (click → booking proposal card), KPI tiles for counts and rates, patient chips that
   open the profile. Keeps the confirm-card safety model.
5. **Automations page (email + in-app, SMS later)** built on the Resend key: visual
   _trigger → delay → channel_ cards with toggles — booking confirmation (immediately),
   reminder (24 h before), cancellation/reschedule notice, no-show follow-up (2 h after),
   post-visit check-in (48 h after). Reuse `RemindersSection` and the domain events; respect the
   patient's contact preference and the portal consent.

### P2 — polish that users feel daily

6. **Patient health card in the portal**: patient code + QR that the kiosk / front desk scans
   for check-in (reuses the QR check-in flow), with "add to home screen".
7. **Patient profile stats strip**: total visits, attended, cancelled, no-show, attendance rate;
   history grouped by month with status and type chips.
8. **Availability editor timeline bar** (06:00–20:00 band showing work vs breaks per day).
9. **⌘K / Ctrl+K command palette**: patients, appointments by code, doctors, and actions
   ("New appointment", "Open queue"), keyboard-first, all three locales.
10. **Audit "performed via" column**: UI, assistant, portal, API, system job — the data is
    already partly there (`source = ASSISTANT | PORTAL | STAFF`).
11. **Sidebar grouping** if the nav keeps growing (Today · Patients · Scheduling · Clinic · Admin).

### P3 — later

12. Payments / invoices per visit and insurance claims (Doktouri's CNAM module is a strong local
    differentiator in Tunisia).
13. Health content hub (articles, short videos, public Q&A) for SEO — only with clinician review.
14. Non-blocking PWA install prompt after a booking.
15. Plans and a pricing page with a feature comparison table, if RI'AYA becomes a commercial product.

## 6. Suggested next step

Ship P1-1 (public doctor pages) and P1-2 (one-click demos) together: they change the first
five minutes of every visitor and reuse existing slot and booking code. P1-5 (automations)
pairs with the Resend email work.
