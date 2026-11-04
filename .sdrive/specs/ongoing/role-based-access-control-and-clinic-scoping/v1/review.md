---
status: PASS
feature: role-based-access-control-and-clinic-scoping
version: v1
commit: a83226e5f2958a09e7f658e641646fdc4d8b55f0
branch: feature/bp-007-bp-010-bp-011-bp-013
base: main
reviewedBy: kenule500
reviewedAt: 2026-11-04T22:14:03.213Z
coverage: 100
evidence: .sdrive/governance/role-based-access-control-and-clinic-scoping/v1/test-evidence.json
---

# Review Report: RBAC and Clinic Scoping (v1)

## 1. Audit Summary

- **Status:** PASS
- **Date:** 2026-11-04
- **Reviewer:** kenule500 (independent: no — same identity as the implementation; escalated
  and explicitly confirmed by the owner for this verdict)
- **Version:** v1
- **Commit:** `a83226e`
- **Branch / base:** `feature/bp-007-bp-010-bp-011-bp-013` / `main`
- **Coverage:** 100% (9 of 9 ACs tested; 12 tests passing)

There is now one capability matrix in `@riaya/shared`, and the server, the route guards and the
navigation all derive from it. `@Roles` covers the user, invite and suspend endpoints; the
ad-hoc `assertCanInvite` helper and the manual suspend role branch are deleted rather than
duplicated; `RoleRoute` checks capabilities; the forbidden page is localized. Plan §1.4 classifies
every endpoint as public, authenticated-any or role-gated, and the guard/metadata tests enforce the
classification. The owner confirmed the PASS while accepting two non-blocking gaps: the forbidden
page's visual rendering (RTL/WCAG) is asserted structurally rather than in a browser, and CI is
not verified because the shared branch has no pull request yet. The branch is the four-feature
group the owner approved at proposal time; per CON-611 it merges once, when all four features
have passed review.

## 2. Evidence

| Evidence              | Location                                                                                          | Result                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Test evidence         | `.sdrive/governance/.../v1/test-evidence.json`                                                    | exit 0, 115 passed / 0 failed / 1 skipped (116), commit `a83226e` |
| Test report           | `.sdrive/reports/tests/test-report-role-based-access-control-and-clinic-scoping-v1-2026-11-04.md` | 9/9 ACs, 100%, 12/12                                              |
| Verification          | `.sdrive/governance/.../v1/verification.json`                                                     | `pass` — 16 matched, 0 missing                                    |
| Governance validation | `sdrive validate` / `validate-governance.js`                                                      | all files valid                                                   |
| Audit chain           | `sdrive audit:verify`                                                                             | ok                                                                |
| CI                    | GitHub Actions                                                                                    | **not verified** — no PR exists for the shared branch             |

Commands run at `a83226e`, all passing:

- `pnpm --filter server lint` and `typecheck` → exit 0
- `pnpm --filter backoffice lint` and `typecheck` → exit 0
- `pnpm --filter server build` → exit 0
- `pnpm --filter backoffice build` → exit 0, including the three design guards

## 3. Criteria Check

- [x] Spec Convergence: all 9 ACs verified against the implementation and its tests.
- [x] Task Completion: 11/11 tasks complete (4 phases); `tasks.md` agrees.
- [x] Traceability: 14/14 FR/NFR rows complete, each with at least one test ID.
- [x] Coverage: 100% — 9/9 ACs; 12/12 feature tests pass.
- [x] Test Report: present, added in `f4bcaff` after the spec and plan; summary 9/9, 100%,
      12/12.
- [x] Test Evidence: exit 0, zero failures, 116 results, `commit` equals HEAD.
- [x] Change Scope: the shared branch contains the four owner-approved group features; the RBAC
      paths trace to its plan; tree clean (details §4).
- [x] Test Quality: every test name carries its AC ID; no `.only`, `xit`, skips or empty
      assertions in the RBAC suites.
- [x] Code Quality: lint, typecheck and build pass in both packages at HEAD.
- [x] Security: no secrets, no dependency change; the feature centralizes authorization
      (details §7).
- [x] Testing: 12/12 RBAC tests; workspace 115 passed, 0 failed, 1 unrelated skip.
- [x] Documentation: the matrix, the endpoint classification (§1.4) and the capability route are
      documented in the plan and reflected in the tests.
- [x] NFR Evidence: all six NFR rows are authorization, consistency and accessibility constraints;
      all are verified structurally. No performance or SEO NFRs exist.
- [x] Definition of Done: satisfied except reviewer independence, escalated and owner-confirmed.
- [x] Spec-to-Code Verification: `sdrive verify` returns `pass`.
- [ ] CI: not verified — no pull request exists for the shared branch.
- [x] Permission: `check-permission.js slash /sdrive:review` → allowed (`kenule500`, admin).
- [~] Reviewer Independence: same identity; escalated and explicitly confirmed by the owner.

## 4. Change Scope

- Files changed: the branch carries 86 files across the four group features (BP-007, BP-010,
  BP-011, BP-013), which the owner deliberately grouped on one branch.
- RBAC paths: `packages/shared/src/permissions.ts`, `server/src/common/decorators/roles.decorator.ts`,
  `common/guards/roles.guard.ts`, `users/users.controller.ts`, `tenancy/tenancy.controller.ts`,
  `tenancy/onboarding.service.ts` and the invitation DTO, `backoffice/src/auth/roles.ts`,
  `auth/RoleRoute.tsx`, `pages/ForbiddenPage.tsx`, the three locale catalogues, and the four test
  files.
- No RBAC file outside the plan; no unrelated source change.
- Shared-branch consequence (CON-611): the branch merges once, after all four features pass review
  and are archived together.
- Working tree: clean at the reviewed commit.

## 5. Issues Found

| Severity | Issue                                                                                                                                         | Location                                                        | AC     | Fix Required | Fix with                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ | ------------ | ------------------------------------------------------------------ |
| Low      | The forbidden page's RTL and WCAG rendering is asserted structurally (translated text, document direction, roles), not measured in a browser. | `backoffice/test/role-based-access-control-and-clinic-scoping/` | AC-009 | No           | `/sdrive:performance role-based-access-control-and-clinic-scoping` |
| Low      | CI is not verified: the shared branch has no pull request and the workflow does not run on feature-branch pushes.                             | —                                                               | —      | No           | none — CI runs at PR time                                          |

## 6. Recommendations

- Add the 403 page to the browser accessibility pass when the shell's performance review runs.
- Review BP-013 next; the group merges only when all four pass.

## 7. Security & Performance

| Area                               | Status         | Reason / measurement                                                                                                  |
| ---------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Security — secrets                 | pass           | Manual diff scan for key material and credentials: no hits; the matched strings are identifiers and test fixtures.    |
| Security — dependencies            | pass           | No dependency added or upgraded; lockfile unchanged.                                                                  |
| Security — CON-512                 | pass           | Server-side guards remain authoritative on every endpoint; the matrix and the guard tests enforce the classification. |
| Security — CON-515                 | pass           | Invite and suspend inputs are validated; the manual role branch was deleted in favour of the shared matrix.           |
| Security — CON-511/513/514/516-520 | not_applicable | No token, header, route, data-access, HTML, cookie or transport handling changed beyond the authorization layer.      |
| Performance / SEO                  | not_applicable | The spec has no performance or SEO NFRs.                                                                              |

## 8. Handoff

**PASS** — clear the feature for release.

1. `sdrive approve role-based-access-control-and-clinic-scoping review` (human sign-off; the
   archive re-cuts the verdict at the merge HEAD because this record is bound to `a83226e`).
2. Review BP-013; then `/sdrive:archive` the shared branch when all four pass.

**Reviewer independence:** the implementer and reviewer share `kenule500`. The owner explicitly
confirmed this PASS and accepted the gap.

No merge was performed and the feature folder was not moved.
