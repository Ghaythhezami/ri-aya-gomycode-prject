# Backoffice feature brief (shared by every frontend workstream)

Monorepo: `C:\Users\A\Desktop\DEV\riaya\src-clone`. App: `backoffice/` (React 19, Vite 6, Tailwind CSS 4,
Redux Toolkit + RTK Query, react-router-dom 7 with `BrowserRouter`, i18next, lucide-react, recharts 3,
react-hook-form + zod). Product: RI'AYA (رعاية), a clinic operations SaaS. Brand name in UI is
**RI'AYA** (the mockups say "TABIBI" — never show that name).

## Design reference (look at the images with the Read tool before building)

`project-overview/` (1920×1080 screenshots of the Figma prototype):

| Screen                                                                                                                           | File                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Dashboard (overview)                                                                                                             | `image.png`                          |
| Booking wizard steps 1–4                                                                                                         | `Screenshot (769).png` … `(772).png` |
| Appointments list                                                                                                                | `Screenshot (773).png`               |
| Calendar week                                                                                                                    | `Screenshot (775).png`               |
| Patients                                                                                                                         | `Screenshot (776).png`               |
| Doctors & Staff                                                                                                                  | `Screenshot (777).png`               |
| Waiting list                                                                                                                     | `Screenshot (778).png`               |
| Smart scheduling                                                                                                                 | `Screenshot (779).png`               |
| Analytics & Reports                                                                                                              | `Screenshot (780).png`, `(781).png`  |
| Notifications                                                                                                                    | `Screenshot (782).png`               |
| Settings sections (clinic info, departments, working hours, appointments, reminders, roles & permissions, audit log, appearance) | `Screenshot (783).png` … `(790).png` |
| Auth look                                                                                                                        | `ri-aya.png`                         |

Match layout, hierarchy, spacing and colour system: white cards (`bg-surface`, `border-border`,
`rounded-lg`, `shadow-(--shadow-card)`) on `bg-bg`, deep teal primary, navy sidebar, eyebrow label in
teal caps above each page title (`features/shared/PageHeader.tsx`), soft accent icon tiles on KPI cards.
Where a mockup section is only a placeholder ("Open departments"), build the real working UI.

## Hard rules

1. **Tokens only.** Colours come from the `@theme` tokens in `src/index.css`: `primary`, `primary-dark`,
   `navy`, `sidebar`, `bg`, `surface`, `text`, `muted`, `border`, `border-strong`, `success`, `warning`,
   `error`, `accent`, `info`, `alert` (e.g. `bg-primary`, `text-muted`, `bg-info/10`). No hex literals,
   no raw Tailwind palette (`bg-red-50`), no arbitrary radius. Enforced by
   `node scripts/check-token-literals.mjs` (run from `backoffice/`).
2. **RTL-safe.** Use logical utilities only: `ms-* me-* ps-* pe-* start-* end-* text-start text-end
border-s border-e rounded-s rounded-e`. Never `ml/mr/pl/pr/left/right/text-left/text-right`.
   Mirror directional icons (chevrons, arrows) with `rtl:-scale-x-100`. Keep numbers, times, phone
   numbers readable (`dir="ltr"` on phone numbers and codes inside RTL text).
3. **i18n, no hard-coded strings.** Each feature has `src/i18n/features/<feature>/{en,ar,fr}.json`
   (mounted at runtime under `<feature>`; `t('patients.title')`). Real Arabic and French translations,
   identical key sets (`node scripts/check-locale-parity.mjs`). Never name a feature folder after an
   existing root key (`app auth nav shell ds firstRun register invite workspace staff roles breadcrumbs
forbidden errors`). Shared words live in `clinic.*` (status, type, priority, save, cancel, back,
   next, retry, …) — reuse them. API errors: show `t('errors.' + code, { defaultValue: error.message })`
   (the API already localises `message` via `Accept-Language`).
4. **Data.** Types come from `@riaya/shared` (`packages/shared/src/schemas/clinic.ts`); endpoints and
   roles from `docs/API-CONTRACT.md`. Add endpoints with `clinicApi.injectEndpoints` in
   `src/features/<feature>/api.ts` (`src/store/clinicApi.ts`; tags: Reference, Appointment, Patient,
   Doctor, Queue, Schedule, Dashboard, Analytics, Notification, Settings, Audit, Chat). Mutations
   invalidate the tags they affect so other screens refresh without a manual reload. Errors are
   `ClinicApiError { status, code, message, details }` (`asClinicError`). Downloads (CSV/PDF) use the
   axios client `api` from `src/lib/api.ts` with `responseType: 'blob'`.
5. **Formatting.** `useClinicFormat()` (`features/shared/format.ts`) for dates, times, numbers in the
   clinic time zone and UI locale. Never `toLocaleString()` ad hoc.
6. **Reuse primitives** in `src/common/` (Button, Input/Field, Modal, ConfirmDialog, Table, Tabs,
   Dropdown, SearchableSelect, DatePicker, KpiCard, Skeleton, States (empty/error), Toast, Tooltip,
   Popover, charts) and `src/features/shared/` (PageHeader, Avatar, StatusBadge, TypeLabel,
   typeBlockClass, useClinicReferenceQuery). Read their props before use. Extend them only if you own
   them; otherwise compose.
7. **States on every data screen:** loading skeleton shaped like the content, first-use empty
   (what appears here + one action), no-results-for-filters (echo filters + reset), error with retry
   (other widgets keep working), and success feedback (toast). Never wipe user input on error.
8. **Accessibility (WCAG 2.1 AA):** interactive targets ≥ 40 px, full keyboard operation, visible focus,
   labels on every control, `aria-live="polite"` for live counters, status never by colour alone
   (icon + text), charts with legends/tooltips that also work on focus, dialogs trap focus (Modal does).
9. **Responsive:** usable at 375, 768 and 1440 px in all three languages. Wide tables become card lists
   below `md`.
10. **Roles:** hide actions the role cannot perform (`can(role, capability)` from `@riaya/shared`;
    `useAuth().user.role`), the API enforces them anyway.
11. Booking wizard is opened anywhere with `openBooking({ patientId?, doctorId?, startsAt? })` from
    `features/booking/booking-launcher.ts`.
12. Live screens poll as the realtime fallback (`pollingInterval`, `skipPollingIfUnfocused: true`).

## Verify before reporting (from `backoffice/`)

```
npx tsc --noEmit -p tsconfig.app.json
npx eslint "src/features/<your features>/**/*.{ts,tsx}" --max-warnings=0
node scripts/check-token-literals.mjs && node scripts/check-locale-parity.mjs && node scripts/check-token-parity.mjs
npx vitest run src/features/<your features>
```

Do not start dev servers or browsers (the orchestrator does visual QA afterwards); do not commit;
do not add npm dependencies (already installed: `@dnd-kit/core`, `socket.io-client`, `qrcode.react`,
recharts, react-hook-form, zod).
