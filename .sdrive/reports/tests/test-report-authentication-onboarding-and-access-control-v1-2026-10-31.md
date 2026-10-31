# Test Report: Authentication, Onboarding & Access Control (v1)

## 1. Summary

- **Date:** 2026-10-31
- **Feature:** authentication-onboarding-and-access-control
- **Version:** v1
- **Total ACs:** 45
- **Tested ACs:** 45
- **Coverage:** 100%
- **Tests Passed:** 50/51

## 2. How the numbers were produced

- **Command:** `pnpm --filter server exec jest --runInBand --forceExit --testTimeout=120000 && pnpm --filter backoffice exec vitest run`
- **Recorder:** `sdrive test authentication-onboarding-and-access-control --cmd "<above>"`, source `--cmd`
- **Evidence:** `.sdrive/governance/authentication-onboarding-and-access-control/v1/test-evidence.json`
  — `exitCode: 0`, `failed: 0`, commit `0563f28`, 2026-10-31T07:31:01Z → 07:32:24Z (82.6 s)
- **Server (Jest 29 + Supertest, colocated `server/src/**/*.spec.ts` per CON-406):**
  50 passed / 0 failed / 1 skipped of **51**
- **Backoffice (Vitest + React Testing Library):** 4 files, **7 passed**
- **Combined:** 57 passing tests
- **Raw output:** `.sdrive/reports/tests/raw/authentication-onboarding-and-access-control-v1-2026-10-31.log`

The single skip is **AC-009** (lockout survives an API restart). It needs live Redis and
skips itself without `REDIS_URL` plus `LOCKOUT_INTEGRATION=1`; it is executed separately
and passing, recorded in `.sdrive/reports/tests/raw/lockout-integration-ac-009-2026-10-30.log`.

## 3. AC → test mapping

All **45 of 45** acceptance criteria are mapped across **51 rows** in
`.sdrive/governance/authentication-onboarding-and-access-control/v1/traceability.json`,
every row at `status: complete`. No criterion is withdrawn (0 of 45), so nothing is
excluded from coverage.

This pass changed no test and no mapping: the suites were re-run to rebind the evidence
to commit `0563f28`, after the WCAG 2.1 AA contrast commit `99c1036` changed
`backoffice/src/index.css`, `backoffice/src/common/Input.tsx` and
`backoffice/src/pages/AcceptInvitePage.tsx`. Every test name still carries its AC ID.

## 4. Failures

| Test | Reason | Blocking |
| ---- | ------ | -------- |
| -    | none   | -        |

## 5. Notes

- **Arithmetic reconciled (review finding F6).** The 2026-10-30 report headlined
  `50/50` while `test-evidence.json` recorded 50 passed of **51** total with 1 skipped —
  the same run counted two ways. This report states `50/51` and names the skipped suite,
  so the report and the evidence file now agree.
- **Backoffice suite is green after the accessibility fix:** the three auth screens
  (registration wizard, accept-invitation states, legacy-signup redirect) and the RTL
  direction test all pass against the new `--color-border-strong` / `--color-muted` /
  `--color-error` tokens.
- **`sdrive verify`:** `warn` — matched 105, missing 0, renamed 0, extra 19.
  Accepted under CON-602; the extra entries are endpoints the plan did not enumerate.
  Evidence: `.sdrive/governance/authentication-onboarding-and-access-control/v1/verification.json`.
- **Governance validator:** `node .sdrive/scripts/validate-governance.js` — all files valid.
- **Machine note:** the whole run took 82 s in this session, against 599 s for the
  2026-10-30 run. Same suites, same counts; the earlier run was slowed by host load,
  which is also what the NFR-010 benchmark report documents.
