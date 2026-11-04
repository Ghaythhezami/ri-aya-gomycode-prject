---
title: Localised data and API messages
status: backlog
version: v1
feature: localised-data-and-api-messages
product_items: [BP-013]
branch: feature/bp-007-bp-010-bp-011-bp-013
base: main
created: 2026-11-04
updated: 2026-11-04
---

# Localised Data and API Messages (BP-013)

> **Product item:** `BP-013` · Milestone M2 — Tenancy, people & records · Priority P1 · Brief task I18N-2
> **Branch / base:** `feature/bp-007-bp-010-bp-011-bp-013` / `main`

## Overview

- **Problem Statement**: The backoffice renders in en/ar/fr and the catalogues are in parity, but
  the data and API layers are not localised. The server never reads `Accept-Language` and returns
  English `message` strings from `HttpExceptionFilter`; the client never sends
  `Accept-Language` and displays the server message as-is. Date and number formatting is
  inconsistent: `DatePicker`/`TimePicker` use `Intl` with the active locale, while
  `OverviewPage` and `StaffDirectoryPage` call `toLocaleDateString()` with no locale and no clinic
  timezone. `Clinic.timezone` exists but the membership view does not expose it, so the UI cannot
  format a timestamp in the clinic's zone. Appointment types, specialties and statuses do not
  exist yet (BP-018/BP-019), so their labels have nothing to attach to today.
- **Proposed Solution**: Add one shared locale layer: `SUPPORTED_LOCALES`,
  `negotiateLocale(Accept-Language)` and an error-code catalogue in `@riaya/shared`; make
  `HttpExceptionFilter` return a localized `message` while keeping the stable `code`, `details`
  and `requestId`; send `Accept-Language` from the backoffice's axios client using the active UI
  language; add shared `Intl` formatters for date, time, number and currency that take the active
  locale and the clinic timezone; expose `clinicTimezone` in the membership view; and replace the
  ad-hoc formatting calls with the shared helpers. Later features register their own domain
  labels against the same mechanism.
- **Target Audience**: Arabic-, French- and English-speaking staff who see localized errors and
  correctly zoned dates; API consumers beyond the backoffice; engineers adding screens after this
  feature.
- **Assumptions**:
  1. Supported locales are exactly `en`, `ar`, `fr`; a missing, malformed or unsupported
     `Accept-Language` falls back to `en`, and `ar-EG` / `fr-CA` resolve to their base language.
  2. Error `code` values stay stable; only `message` is localized. Clients may still map codes
     themselves, and the backoffice keeps a localized generic fallback for an unknown code.
  3. `Clinic.timezone` already exists (UTC default) and is the authority for display; stored
     timestamps remain UTC and are never rewritten by the UI.
  4. Appointment types, specialties and statuses are not modelled yet. Their labels are added by
     BP-018/BP-019 against this mechanism; BP-013 localises errors, existing enums and formatting.
  5. No new dependency: `Intl` is built in and `i18next` is already installed; the shared package
     holds plain data and pure functions.
- **Out of Scope**:
  - Translating the clinical domain model that does not exist yet (BP-018/BP-019).
  - Server-rendered documents or emails; invitation emails already take the user's
    `preferredLocale`.
  - A profile screen for changing the stored locale (settings, BP-035).
  - RTL layout changes beyond the existing direction handling (BP-005/BP-007).

## User Stories

### US-001: Errors arrive in my language

As an Arabic-speaking receptionist, I want API errors in my language, so that I can act on them
without translating English text.

**Acceptance Criteria:**

- AC-001: Given a request with `Accept-Language` naming a supported locale (including a regional
  variant such as `ar-EG` or `fr-CA`), when the server returns an error, then `message` is in that
  language and `code` is unchanged and stable.
- AC-002: Given a request with no header, a malformed header or an unsupported language, when the
  server returns an error, then the message falls back to English and `code` is still the stable
  code.
- AC-003: Given an unknown error code, when the server responds, then it returns the existing
  message without crashing, and the backoffice falls back to a localized generic message.
- AC-004: Given a validation failure, when the server responds, then the summary message is
  localized and the field-level constraint details are preserved.

### US-002: The client speaks the active language

As a staff member who switches to Arabic, I want every subsequent request to advertise Arabic, so
that errors come back in Arabic without a reload.

**Acceptance Criteria:**

- AC-005: Given the backoffice, when it issues any API request, then it sends `Accept-Language`
  built from the active i18n language.
- AC-006: Given the user changes the language in the switcher, when the next request is sent, then
  it carries the new language without a page reload.
- AC-007: Given a localized Arabic error, when it is displayed, then it renders correctly in an RTL
  document.

### US-003: Dates and numbers respect locale and clinic timezone

As a clinic manager, I want dates, times, numbers and currency shown in my language and my clinic's
timezone, so that the values match the clinic's day, not the server's.

**Acceptance Criteria:**

- AC-008: Given a stored UTC timestamp and the active clinic's timezone, when the UI renders a
  date or time, then it uses the active locale and that timezone via `Intl`, and the stored value
  is not mutated.
- AC-009: Given a number, currency amount or date, when it is formatted through the shared
  helpers, then the output is correct for en, ar and fr.
- AC-010: Given the membership list, when it is returned, then each membership exposes its clinic
  timezone, and the UI uses it for formatting.
- AC-011: Given a missing or invalid clinic timezone, when the UI formats a value, then it falls
  back to UTC and does not throw.
- AC-012: Given the backoffice source, when it is reviewed, then no component calls a locale-less
  `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` for user-facing values.

## Requirements

### Functional Requirements

- FR-001: The server MUST negotiate `Accept-Language` over `en`, `ar`, `fr` with base-language
  resolution and an English fallback.
- FR-002: The error `code` MUST remain stable while `message` is localized from a shared
  error-code catalogue.
- FR-003: Validation errors MUST return a localized summary with the field-level constraint
  details preserved.
- FR-004: The backoffice MUST send `Accept-Language` from the active i18n language on every API
  request, including after a language change.
- FR-005: `@riaya/shared` MUST provide locale- and timezone-aware `Intl` formatters for date, time,
  number and currency.
- FR-006: The membership view MUST expose the clinic timezone, and the UI MUST format with it.
- FR-007: User-facing components MUST NOT format with an implicit locale or timezone; they MUST use
  the shared helpers.
- FR-008: Unknown error codes MUST degrade safely on both the server and the client.

### Non-Functional Requirements

- NFR-001: All three catalogues and the shared error catalogue MUST stay in parity; a missing key
  fails the build (existing locale guard).
- NFR-002: The feature MUST add no dependency; it uses `Intl`, the existing `i18next` and
  `@riaya/shared`.
- NFR-003: The error response shape `{ code, message, details, requestId }` MUST stay unchanged
  apart from the localized message.
- NFR-004: Stored timestamps MUST remain UTC; timezone conversion happens only at display time.
- NFR-005: Localized errors MUST NOT leak stack traces, ORM errors or internal identifiers
  (CON-507); unknown exceptions keep the generic message.
- NFR-006: Localized content MUST render in the correct text direction under en/ar/fr.

## UI/UX & Data Requirements

- **UI/UX**: No new screens. Error text, dates and numbers in the existing screens follow the active
  language and clinic timezone. The language switcher already sets `lang`/`dir`.
- **Data**: `GET /auth/memberships` gains `clinicTimezone` per membership. `Clinic.timezone` is the
  source; no migration and no new table.

## Edge Cases & Error States

- EC-001: `Accept-Language: ar-EG,ar;q=0.9,en;q=0.5` → Arabic.
- EC-002: `Accept-Language: de` → English.
- EC-003: No `Accept-Language` header → English.
- EC-004: Unknown error code → existing message on the server, localized generic fallback on the
  client.
- EC-005: Validation error with several fields → localized summary, details preserved.
- EC-006: Clinic timezone missing or invalid → UTC fallback, no throw.
- EC-007: A value crosses a DST boundary → `Intl` resolves it in the clinic zone; the stored UTC
  value is unchanged.
- EC-008: Language changed mid-session → the next request carries the new language.
- EC-009: An error message contains user data → it is escaped by React; no raw HTML.

## Security Baseline

BP-013 touches the error response path, so CON-507 and the existing controls apply.

- CON-507 Error handling: **in scope** — localized messages must not expose stack traces, ORM
  errors or internal identifiers; unknown exceptions keep the generic message.
- CON-511 Authentication: unchanged.
- CON-512 Authorization: unchanged (BP-011 owns it).
- CON-513/514: unchanged.
- CON-515 Input validation: the validation pipe is unchanged; only its summary message is
  localized.
- CON-516 Injection protection: no data access is added.
- CON-517 XSS: messages render through React escaping; no raw HTML.
- CON-518/519/520: unchanged.

## Out of Scope

- Appointment types, specialties, statuses and their labels (BP-018/BP-019).
- Emails and documents (invitation email already uses `preferredLocale`).
- A locale preference screen (BP-035).
- Server-side rendering of localized pages.

## Dependencies & Risks

- `@riaya/shared` — modify; add `SUPPORTED_LOCALES`, `negotiateLocale`, the error catalogue and the
  Intl formatters.
- `HttpExceptionFilter` — modify; negotiate and look up the localized message.
- `TenancyService.listMemberships` — modify; add `clinicTimezone`.
- Backoffice `lib/api.ts` — modify; send `Accept-Language`.
- Backoffice pages and DatePicker/TimePicker — modify; use the shared formatters.
- No new package.

- RISK-001: The server catalogue and the client catalogues drift. Mitigation: both derive from
  `@riaya/shared`, and the locale-parity guard covers the client catalogues.
- RISK-002: A localized message hides a code clients rely on. Mitigation: `code` is stable and
  never localized.
- RISK-003: Timezone bugs at DST boundaries. Mitigation: `Intl` with `timeZone`, UTC storage, and
  tests for a DST date (test agent).
- RISK-004: Validation details remain English strings from `class-validator`. Mitigation: the
  summary is localized, details are structured, and a later feature can map constraint keys.
