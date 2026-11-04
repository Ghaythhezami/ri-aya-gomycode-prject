---
title: Localised data and API messages — Technical Plan
status: backlog
version: v1
feature: localised-data-and-api-messages
productItems: [BP-013]
branch: feature/bp-007-bp-010-bp-011-bp-013
created: 2026-11-04
updated: 2026-11-04
---

# Localised Data and API Messages — Technical Plan

## 1. Architecture

### 1.1 Approach

One shared locale layer in `@riaya/shared` serves both the server's error path and the
backoffice's display path:

- `SUPPORTED_LOCALES` (`en`, `ar`, `fr`), `negotiateLocale(header)` (q-values, base-language
  resolution, English fallback), and `ERROR_MESSAGES` keyed by error code and locale.
- `HttpExceptionFilter` reads `Accept-Language`, looks up the localized message for the stable
  `code`, and leaves the response shape `{ code, message, details, requestId }` unchanged. An
  unknown code keeps its existing message (CON-507: no internals leak).
- The backoffice axios instance sends `Accept-Language` from `i18n.language` on every request,
  read at request time so a language switch applies without a reload.
- `format.ts` provides date, time, number and currency formatters that take the active locale and
  the clinic timezone, with a UTC fallback for a missing/invalid zone.
- `GET /auth/memberships` adds `clinicTimezone` per membership (from `Clinic.timezone`), so the
  backoffice can format in the clinic's zone without a new endpoint or schema change.

Components that currently format with an implicit locale (`OverviewPage`,
`StaffDirectoryPage`) or duplicate `Intl` logic (`DatePicker`/`TimePicker`) move onto the shared
helpers.

### 1.2 Existing Asset Check (anti-redundancy)

| Asset                        | Location                                             | Decision                                          |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Error filter                 | `server/src/common/filters/http-exception.filter.ts` | **modify** — negotiate and localize `message`     |
| Error response shape         | `{ code, message, details, requestId }`              | **reuse** — unchanged                             |
| Membership view              | `tenancy.service.ts` `listMemberships`               | **modify** — add `clinicTimezone`                 |
| Axios client                 | `backoffice/src/lib/api.ts`                          | **modify** — send `Accept-Language`               |
| Error helper                 | `backoffice/src/lib/api.ts` `getErrorMessage`        | **modify** — localized generic fallback           |
| i18n setup                   | `backoffice/src/i18n/index.ts`                       | **reuse** — already tracks the language           |
| DatePicker/TimePicker `Intl` | `common/DatePicker.tsx`                              | **modify** — use the shared formatters            |
| Ad-hoc formatting            | `OverviewPage`, `StaffDirectoryPage`                 | **modify** — use the shared formatters            |
| Shared package               | `packages/shared/src/index.ts`                       | **modify** — export the locale and format modules |

No new package, no duplicate catalogue, and no new endpoint.

### 1.3 Components

| Component             | Action | File                                                 | Notes                                   |
| --------------------- | ------ | ---------------------------------------------------- | --------------------------------------- |
| `i18n`                | create | `packages/shared/src/i18n.ts`                        | locales, negotiation, error catalogue   |
| `format`              | create | `packages/shared/src/format.ts`                      | date/time/number/currency formatters    |
| `HttpExceptionFilter` | modify | `server/src/common/filters/http-exception.filter.ts` | localized `message`, stable `code`      |
| `TenancyService`      | modify | `server/src/tenancy/tenancy.service.ts`              | `clinicTimezone` in the membership view |
| `api`                 | modify | `backoffice/src/lib/api.ts`                          | `Accept-Language` + generic fallback    |
| `OverviewPage`        | modify | `backoffice/src/pages/OverviewPage.tsx`              | shared date formatter                   |
| `StaffDirectoryPage`  | modify | `backoffice/src/pages/StaffDirectoryPage.tsx`        | shared date formatter                   |
| `DatePicker`          | modify | `backoffice/src/common/DatePicker.tsx`               | shared date/time formatters             |
| `WorkspaceSwitcher`   | modify | `backoffice/src/layouts/WorkspaceSwitcher.tsx`       | membership type gains `clinicTimezone`  |
| `tokens`              | reuse  | `backoffice/src/design-system/tokens.ts`             | no visual change                        |

### 1.4 Locale negotiation rules

- Parse `Accept-Language` q-values; match the base language of each tag (`ar-EG` → `ar`).
- First supported match wins; no match or no header → `en`.
- Negotiation is pure and unit-testable (test agent); the server does not depend on i18next.

### 1.5 Timezone rules

- `Clinic.timezone` is an IANA zone string; the membership view passes it through.
- `Intl.DateTimeFormat(locale, { timeZone })` does the conversion; components never construct
  dates in a different zone.
- A missing or invalid zone falls back to `UTC`; the helper catches the `RangeError`.

## 2. Data model

No persistence change. `Clinic.timezone` already exists; the membership response gains a
`clinicTimezone` field. No migration.

## 3. Phases

| Phase | Name                                    | Purpose                                                      |
| ----- | --------------------------------------- | ------------------------------------------------------------ |
| P1    | Shared locale layer and server messages | negotiation, error catalogue, filter                         |
| P2    | Client header and fallback              | `Accept-Language` interceptor, generic fallback strings      |
| P3    | Timezone and formatters                 | shared Intl helpers, `clinicTimezone`, migrate pages/pickers |
| P4    | Verification                            | lint, typechecks, shared build, verify, governance           |

## 4. Dependencies

No dependency is added. `Intl` is built in, `i18next` is already installed, and
`@riaya/shared` is already consumed by both apps.

## 5. Risks

- **R-P1 (RISK-001)**: server and client catalogues drift. Mitigation: shared source and the
  locale-parity guard.
- **R-P2 (RISK-002)**: a localized message hides the code. Mitigation: `code` is never localized.
- **R-P3 (RISK-003)**: DST/timezone bugs. Mitigation: `Intl` with `timeZone`, UTC storage and a
  DST-date test.
- **R-P4 (RISK-004)**: `class-validator` details stay English. Mitigation: localized summary,
  structured details, constraint mapping later.
