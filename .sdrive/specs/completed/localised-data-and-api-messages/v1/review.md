---
status: PASS
feature: localised-data-and-api-messages
version: v1
commit: a83226e5f2958a09e7f658e641646fdc4d8b55f0
branch: feature/bp-007-bp-010-bp-011-bp-013
base: main
reviewedBy: kenule500
reviewedAt: 2026-11-04T22:14:03.213Z
coverage: 100
evidence: .sdrive/governance/localised-data-and-api-messages/v1/test-evidence.json
---

# Review Report: Localised Data and API Messages (v1)

## 1. Audit Summary

- **Status:** PASS
- **Date:** 2026-11-04
- **Reviewer:** kenule500 (independent: no — same identity as the implementation; escalated
  and explicitly confirmed by the owner for this verdict)
- **Version:** v1
- **Commit:** `a83226e`
- **Branch / base:** `feature/bp-007-bp-010-bp-011-bp-013` / `main`
- **Coverage:** 100% (12 of 12 ACs tested; 13 tests passing)

Locales are negotiated once in `@riaya/shared` (`SUPPORTED_LOCALES`, `negotiateLocale`) from the
`Accept-Language` header, with English as the fallback. The error filter localizes known codes and
keeps the code, the details and any bespoke message intact; dates, numbers and currency go through
Intl formatters; the membership view exposes the clinic timezone; all three catalogues carry 230
keys. The owner confirmed the PASS while accepting two non-blocking gaps: the Arabic rendering
check is structural rather than a browser measurement, and CI is not verified because the shared
branch has no pull request yet. The branch is the four-feature group the owner approved at
proposal time; per CON-611 it merges once, when all four features have passed review.

## 2. Evidence

| Evidence              | Location                                                                             | Result                                                            |
| --------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Test evidence         | `.sdrive/governance/.../v1/test-evidence.json`                                       | exit 0, 115 passed / 0 failed / 1 skipped (116), commit `a83226e` |
| Test report           | `.sdrive/reports/tests/test-report-localised-data-and-api-messages-v1-2026-11-04.md` | 12/12 ACs, 100%, 13/13                                            |
| Verification          | `.sdrive/governance/.../v1/verification.json`                                        | `pass` — 14 matched, 0 missing                                    |
| Governance validation | `sdrive validate` / `validate-governance.js`                                         | all files valid                                                   |
| Audit chain           | `sdrive audit:verify`                                                                | ok                                                                |
| CI                    | GitHub Actions                                                                       | **not verified** — no PR exists for the shared branch             |

Commands run at `a83226e`, all passing:

- `pnpm --filter server lint` and `typecheck` → exit 0
- `pnpm --filter backoffice lint` and `typecheck` → exit 0
- `pnpm --filter server build` → exit 0
- `pnpm --filter backoffice build` → exit 0, including locale parity (230 keys per locale)

## 3. Criteria Check

- [x] Spec Convergence: all 12 ACs verified against the implementation and its tests.
- [x] Task Completion: 9/9 tasks complete (4 phases); `tasks.md` agrees.
- [x] Traceability: 14/14 FR/NFR rows complete, each with at least one test ID.
- [x] Coverage: 100% — 12/12 ACs; 13/13 feature tests pass.
- [x] Test Report: present, added in `f4bcaff` after the spec and plan; summary 12/12, 100%,
      13/13.
- [x] Test Evidence: exit 0, zero failures, 116 results, `commit` equals HEAD.
- [x] Change Scope: the shared branch contains the four owner-approved group features; the
      localization paths trace to its plan; tree clean (details §4).
- [x] Test Quality: every test name carries its AC ID; no `.only`, `xit`, skips or empty
      assertions in the localization suites.
- [x] Code Quality: lint, typecheck and build pass in both packages at HEAD.
- [x] Security: no secrets, no dependency change; error handling stays generic (details §7).
- [x] Testing: 13/13 localization tests; workspace 115 passed, 0 failed, 1 unrelated skip.
- [x] Documentation: the locale negotiation, the error catalogue and the formatter contract are
      documented in the plan and reflected in the tests.
- [x] NFR Evidence: the locale-parity and formatting constraints are verified; there are no
      performance or SEO NFRs. The Arabic rendering check is structural (low finding).
- [x] Definition of Done: satisfied except reviewer independence, escalated and owner-confirmed.
- [x] Spec-to-Code Verification: `sdrive verify` returns `pass`.
- [ ] CI: not verified — no pull request exists for the shared branch.
- [x] Permission: `check-permission.js slash /sdrive:review` → allowed (`kenule500`, admin).
- [~] Reviewer Independence: same identity; escalated and explicitly confirmed by the owner.

## 4. Change Scope

- Files changed: the branch carries 86 files across the four group features (BP-007, BP-010,
  BP-011, BP-013), which the owner deliberately grouped on one branch.
- Localization paths: `packages/shared/src/i18n.ts`, `format.ts`, `index.ts`,
  `server/src/common/filters/http-exception.filter.ts`, `tenancy/membership-timezone` surfaces,
  the switch-workspace and invitation DTOs, `backoffice/src/common/DatePicker.tsx`,
  `lib/api.ts`, `OverviewPage.tsx`, `StaffDirectoryPage.tsx`, the three locale catalogues, and the
  three test files.
- No localization file outside the plan; no unrelated source change.
- Shared-branch consequence (CON-611): the branch merges once, after all four features pass review
  and are archived together.
- Working tree: clean at the reviewed commit.

## 5. Issues Found

| Severity | Issue                                                                                                             | Location                                           | AC     | Fix Required | Fix with                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------ | ------------ | ----------------------------------------------------- |
| Low      | The Arabic date/number rendering and document direction are asserted structurally, not measured in a browser.     | `backoffice/test/localised-data-and-api-messages/` | AC-007 | No           | `/sdrive:performance localised-data-and-api-messages` |
| Low      | CI is not verified: the shared branch has no pull request and the workflow does not run on feature-branch pushes. | —                                                  | —      | No           | none — CI runs at PR time                             |

## 6. Recommendations

- Include the Arabic formatting and direction checks in the browser pass when the shell's
  performance review runs.
- Archive the group once the four reviews are approved.

## 7. Security & Performance

| Area                    | Status         | Reason / measurement                                                                                                             |
| ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Security — secrets      | pass           | Manual diff scan for key material and credentials: no hits; the matched strings are identifiers and test fixtures.               |
| Security — dependencies | pass           | No dependency added or upgraded; lockfile unchanged.                                                                             |
| Security — CON-507      | pass           | The filter maps known codes and never emits a stack or internal error text; unknown codes keep the message the thrower supplied. |
| Security — others       | not_applicable | No token, authorization, route, data-access, HTML, cookie or transport handling changed.                                         |
| Performance / SEO       | not_applicable | The spec has no performance or SEO NFRs.                                                                                         |

## 8. Handoff

**PASS** — clear the feature for release.

1. `sdrive approve localised-data-and-api-messages review` (human sign-off; the archive re-cuts
   the verdict at the merge HEAD because this record is bound to `a83226e`).
2. `/sdrive:archive` the shared branch once all four features are approved.

**Reviewer independence:** the implementer and reviewer share `kenule500`. The owner explicitly
confirmed this PASS and accepted the gap.

No merge was performed and the feature folder was not moved.
