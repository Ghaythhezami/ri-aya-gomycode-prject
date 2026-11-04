# Test Report: Design Tokens and Component Library (v1)

## 1. Summary

- **Date:** 2026-11-04
- **Feature:** design-tokens-and-component-library
- **Version:** v1
- **Total ACs:** 11
- **Tested ACs:** 11
- **Coverage:** 100%
- **Tests Passed:** 46/47

Verdict: **RED** — the suite exits `1`. Every acceptance criterion has at least
one test, but `AC-006` fails against a real defect in the page's Dropdown demo,
and `AC-005` / `AC-010` make layout claims that jsdom cannot measure. Those two
are covered structurally and are recorded as unproven, not as passing.

Run: `npx vitest run test/design-tokens-and-component-library --reporter=dot`
(exit `1`, 6 files, 47 tests, 46 passed, 1 failed, 44.42 s).
Raw log: `.sdrive/reports/tests/raw/design-tokens-and-component-library-v1-2026-11-04.log`
(`sha256:4b606b20b68e2f433120637755d950df0371f3796bd4f8b03d1e7f6af6d96c35`).

## 2. AC → Test Mapping

| AC ID  | Test ID  | File                                                                   | Status     |
| ------ | -------- | ---------------------------------------------------------------------- | ---------- |
| AC-001 | TEST-050 | test/design-tokens-and-component-library/token-literals.test.ts        | ✅ Pass    |
| AC-002 | TEST-051 | test/design-tokens-and-component-library/token-parity.test.ts          | ✅ Pass    |
| AC-003 | TEST-052 | test/design-tokens-and-component-library/design-system-page.test.tsx   | ✅ Pass    |
| AC-004 | TEST-053 | test/design-tokens-and-component-library/token-literals.test.ts        | ✅ Pass    |
| AC-005 | TEST-054 | test/design-tokens-and-component-library/design-system-page.test.tsx   | ⚠️ Partial |
| AC-006 | TEST-055 | test/design-tokens-and-component-library/design-system-page.test.tsx   | ❌ Fail    |
| AC-007 | TEST-056 | test/design-tokens-and-component-library/badge.test.tsx                | ✅ Pass    |
| AC-008 | TEST-057 | test/design-tokens-and-component-library/inventory-and-states.test.tsx | ✅ Pass    |
| AC-009 | TEST-058 | test/design-tokens-and-component-library/inventory-and-states.test.tsx | ✅ Pass    |
| AC-010 | TEST-059 | test/design-tokens-and-component-library/design-system-page.test.tsx   | ⚠️ Partial |
| AC-011 | TEST-060 | test/design-tokens-and-component-library/locales.test.ts               | ✅ Pass    |

**What each test proves**

- **TEST-050 / TEST-053** run the real `check-token-literals.mjs`, then copy it
  into a scratch tree beside a fixture `src/` that breaks one rule at a time.
  The guard must exit `1` and name the offending utility, so a clean run of the
  real tree is evidence rather than an untested assumption. All ten
  physical-direction utilities are probed individually.
- **TEST-051** runs `check-token-parity.mjs` on the real tree and against a
  fixture whose CSS and TS modules disagree by one value.
- **TEST-052** asserts every colour name and hex, and every font/radius/space/
  elevation token name, appears in the tokens section, and that no rendered hex
  falls outside the module.
- **TEST-054** renders the page under `dir="rtl"` with the Arabic catalogue and
  scans every rendered element for physical utilities and physical inline styles.
- **TEST-055** tabs through every interactive control and requires visit order to
  match DOM order, activates buttons with Enter and Space, verifies the global
  `*:focus-visible` rule, and asserts no interactive element nests another.
- **TEST-056** requires every Badge tone to carry readable text plus a distinct
  screen-reader cue, with the glyph hidden from assistive tech.
- **TEST-057** checks all 17 primitives are exported and that each owning module
  exists on disk; **TEST-058** renders each primitive's default, open, error,
  disabled and empty states.
- **TEST-059** asserts the table branch is `hidden md:block` inside an
  `overflow-x-auto` container and the card branch is `md:hidden` with the same
  row count.
- **TEST-060** runs `check-locale-parity.mjs`, compares `ds.*` key sets across
  en/ar/fr, and rejects values that fall back to English.

## 3. Failures

| Test     | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Blocking |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| TEST-055 | `AC-006: no interactive control is nested inside another` fails. `DesignSystemPage.tsx:265` passes `trigger={<Button variant="secondary">…</Button>}` to `Dropdown`, and `Dropdown.tsx` already renders its own `<button>` around `trigger`, producing `<button>` inside `<button>`. React logs "In HTML, <button> cannot be a descendant of <button>". The Popover demo was done correctly (a native `<button>` via the trigger render function), so this is a page-level bug, not a primitive API limit. | Yes      |

Not counted as failures, but not proven either:

| AC     | Gap                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------ |
| AC-005 | Mirroring and logical-class usage are proven; "no clipping / no horizontal scrollbar" needs a browser. |
| AC-010 | Breakpoint wiring and equal row counts are proven; 375 px overflow needs a browser.                    |

## 4. Notes

- **Framework:** Vitest 3.2.7 with jsdom, Testing Library and `user-event`
  (CON-408). Tests live under `backoffice/test/design-tokens-and-component-library/`
  per the contract in `backoffice/vitest.config.ts`. Test IDs continue the
  repository sequence at `TEST-050` (the highest existing is `TEST-049`).
- **No production code was modified.** The failure above is a `/sdrive:apply` fix:
  pass a non-button element to `Dropdown`'s `trigger`, as `inventory-and-states.test.tsx`
  does with a `<span aria-hidden>`.
- **Not verifiable in jsdom, deliberately not faked:** real overflow and scrollbar
  behaviour at 375 px (AC-005, AC-010), and computed focus-ring rendering
  (AC-006, asserted via the CSS rule instead). These belong to
  `/sdrive:performance` or a browser-measured run.
- **Locale note:** six `ds.*` values are identical in French and English
  (`ds.badges`, `ds.danger`, `ds.textarea`, `ds.minutes`, `ds.colPatient`,
  `ds.colType`). All six are legitimate — true cognates or identical medical
  abbreviations — so TEST-060 lists them explicitly instead of weakening the
  check. Arabic has zero fallbacks.
- **Traceability:** 13 rows are `complete`; 8 are `in_progress` because they link
  AC-005, AC-006 or AC-010. Rows for NFR-004/005/006/007 remain `in_progress`
  until a browser-measured run exists.
- **Test count:** 47 tests across 6 files. The four guard-script assertions run
  the scripts as subprocesses, which accounts for most of the 44 s runtime.
