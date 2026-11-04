---
title: Localised data and API messages — Tasks
status: backlog
version: v1
feature: localised-data-and-api-messages
branch: feature/bp-007-bp-010-bp-011-bp-013
created: 2026-11-04
updated: 2026-11-04
---

# Tasks — Localised Data and API Messages (BP-013)

Production code only. Test authoring and execution belong to `/sdrive:test`.

## P1 — Shared locale layer and server messages

- [x] T1.1 — Add `packages/shared/src/i18n.ts` with `SUPPORTED_LOCALES`, `negotiateLocale(header)` and `ERROR_MESSAGES` for en/ar/fr; export it from the package index. (FR-001, FR-002, NFR-001)
- [x] T1.2 — Update `HttpExceptionFilter` to negotiate `Accept-Language` and return the localized message for the stable code, keeping `code`, `details` and `requestId`; localize the validation summary and keep an unknown code's existing message. (FR-001, FR-002, FR-003, FR-008, NFR-003, NFR-005)

## P2 — Client header and fallback

- [x] T2.1 — Add an axios request interceptor that sends `Accept-Language` from `i18n.language` at request time. (FR-004, AC-005, AC-006)
- [x] T2.2 — Add a localized generic error string to en/ar/fr and use it in `getErrorMessage` when the server code is unknown. (FR-008, NFR-001, NFR-006, AC-003)

## P3 — Timezone and formatters

- [x] T3.1 — Add `packages/shared/src/format.ts` with date/time/number/currency formatters that take the locale and clinic timezone and fall back to UTC. (FR-005, NFR-004, AC-008, AC-009, AC-011)
- [x] T3.2 — Add `clinicTimezone` to `MembershipView` in `TenancyService.listMemberships` and to the backoffice membership type. (FR-006, AC-010)
- [x] T3.3 — Replace the ad-hoc formatting in `OverviewPage`, `StaffDirectoryPage`, `DatePicker` and `TimePicker` with the shared helpers. (FR-005, FR-006, FR-007, AC-008, AC-012)

## P4 — Verification

- [x] T4.1 — Run `pnpm --filter server lint`, `pnpm --filter backoffice lint`, both typechecks, `pnpm --filter @riaya/shared build`, `sdrive verify localised-data-and-api-messages` and `node .sdrive/scripts/validate-governance.js`; all must pass. Do not run the test suite. (NFR-001, NFR-002)
- [x] T4.2 — Grep the backoffice for argument-less `toLocaleString` / `toLocaleDateString` / `toLocaleTimeString` on user-facing values, confirm no dependency or lockfile change, and record the result. (FR-007, NFR-002)

Negotiation, formatter and DST tests are authored by `/sdrive:test`, which fills
`traceability.json` `testIds`.
