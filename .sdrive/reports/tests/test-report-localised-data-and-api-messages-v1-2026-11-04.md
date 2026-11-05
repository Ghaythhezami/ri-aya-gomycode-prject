# Test Report: Localised Data and API Messages (v1)

## 1. Summary

- **Date:** 2026-11-04
- **Feature:** localised-data-and-api-messages
- **Version:** v1
- **Total ACs:** 12
- **Tested ACs:** 12
- **Coverage:** 100%
- **Tests Passed:** 13/13

## 2. AC → Test Mapping

| AC ID  | Test ID  | File                                                               | Status  |
| ------ | -------- | ------------------------------------------------------------------ | ------- |
| AC-001 | TEST-091 | server/src/common/filters/http-exception.filter.spec.ts            | ✅ Pass |
| AC-002 | TEST-092 | server/src/common/filters/http-exception.filter.spec.ts            | ✅ Pass |
| AC-003 | TEST-093 | server/src/common/filters/http-exception.filter.spec.ts            | ✅ Pass |
| AC-004 | TEST-094 | server/src/common/filters/http-exception.filter.spec.ts            | ✅ Pass |
| AC-005 | TEST-095 | backoffice/test/localised-data-and-api-messages/formatters.test.ts | ✅ Pass |
| AC-006 | TEST-096 | backoffice/test/localised-data-and-api-messages/formatters.test.ts | ✅ Pass |
| AC-007 | TEST-097 | backoffice/test/localised-data-and-api-messages/formatters.test.ts | ✅ Pass |
| AC-008 | TEST-098 | backoffice/test/localised-data-and-api-messages/formatters.test.ts | ✅ Pass |
| AC-009 | TEST-099 | backoffice/test/localised-data-and-api-messages/formatters.test.ts | ✅ Pass |
| AC-010 | TEST-100 | server/src/tenancy/membership-timezone.spec.ts                     | ✅ Pass |
| AC-011 | TEST-101 | backoffice/test/localised-data-and-api-messages/formatters.test.ts | ✅ Pass |
| AC-012 | TEST-102 | backoffice/test/localised-data-and-api-messages/formatters.test.ts | ✅ Pass |

## 3. Failures

| Test | Reason | Blocking |
| ---- | ------ | -------- |
| None | —      | No       |

## 4. Notes

- **Frameworks:** Jest for the filter and membership-timezone tests, Vitest/jsdom for the client
  header and formatter tests (CON-401/408).
- **Run:** the feature's three files pass (13 tests). The full server suite passes (115 passed, 1
  skipped) and the full backoffice suite passes (21 files).
- **Server:** `Accept-Language` honours q-values and regional tags (`ar-EG` → `ar`), falls back to
  English, keeps the stable `code`, preserves validation `details`, and keeps an unknown code's
  original message (no internal detail is added).
- **Client:** the axios interceptor reads the active language at request time, so a switch applies
  without a reload; an invalid IANA zone falls back to UTC; and en/ar/fr produce distinct, correct
  date and number output.
- **Timezone:** the membership view exposes `clinicTimezone`, and formatting converts a UTC value
  into that zone (Riyadh/Tokyo assertions) without mutating the stored value.
- **No implicit locale:** a source scan rejects argument-less `toLocaleString`,
  `toLocaleDateString` or `toLocaleTimeString` in `backoffice/src`.
