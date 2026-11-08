---
title: Review Report: Authentication, Onboarding & Access Control (v2)
feature: authentication-onboarding-and-access-control
version: v2
status: FAIL
reviewedBy: kenule500
reviewedAt: 2026-11-08T09:15:17.038Z
commit: 2c690a829c7afe94e0937f57e61d46850a036065
base: main
branch: feature/auth-onboarding
coverage: 100
---

# Review Report: Authentication, Onboarding & Access Control (v2)

## 1. Audit Summary

- **Status:** FAIL
- **Date:** 2026-11-08
- **Reviewer:** kenule500 (independent: no — sole admin; recorded as a conflict)
- **Version:** v2
- **Commit:** `2c690a8`
- **Branch / base:** `feature/auth-onboarding` / `main`

The v2 acceptance work itself is green: 19/19 AC tests pass, traceability is complete, `sdrive verify` passes, and the governance chain is valid. The feature cannot be cleared because the branch also carries substantial product work that is not in the v2 plan, and because the format check and documentation are incomplete.

## 2. Evidence

- Test evidence: `.sdrive/governance/authentication-onboarding-and-access-control/v2/test-evidence.json` — exit `0`, `0` failed, `16` Jest tests; the same command ran 3 Vitest tests, and the report/raw log record **19/19** AC tests. Commit `2c690a8` equals HEAD.
- Test report: `.sdrive/reports/tests/test-report-authentication-onboarding-and-access-control-v2-2026-11-07.md` — 19/19 AC tests; newer than `spec.md` and `plan.md`.
- Verification: `.sdrive/governance/authentication-onboarding-and-access-control/v2/verification.json` — PASS, 28 matched, 0 missing/renamed/extra.
- Audit chain: `sdrive audit:verify` — 104 hashed events verified, `brokenAt: null`.
- CI: not verified — no run exists for `feature/auth-onboarding` or HEAD `2c690a8`.

## 3. Criteria Check

- [x] Spec Convergence: v2 code and AC tests match `spec.md`/`spec.json`; `sdrive verify` PASS.
- [x] Task Completion: 14 of 14 implementation tasks are completed; T12.2's formatter claim is inaccurate and is recorded under Code Quality.
- [x] Traceability: 16 rows cover all 19 ACs; every row has a test ID and `status: complete`.
- [x] Coverage: 100% (19/19 ACs tested, 19/19 AC tests passing).
- [x] Test Report: exists, versioned, 19/19, newer than spec and plan.
- [x] Test Evidence: exit 0, 0 failed, commit equals HEAD; the machine summary records 16 of the 19 tests because it parses only the Jest segment.
- [ ] Change Scope: **FAIL** — 92 files against `main`; 16 planned component paths; the settings/custom-role, overview, workspace-shell and related migration/DTO/test work are unplanned.
- [x] Test Quality: no `.only`, `xit`, `xdescribe`, `it.skip`, `describe.skip` or `test.skip`; all 19 AC IDs appear in test names.
- [ ] Code Quality: **FAIL** — typecheck and eslint pass, but `pnpm format:check` exits 2 on repository-wide pre-existing files; the v2 changed files were formatted by the hook.
- [ ] Security: **not_verified** — secrets scan clean; CON-511..519 wired; `pnpm audit` reports 2 critical dev-only `tinypool` advisories and 5 moderate dev-tool advisories; no v2 security report.
- [x] Testing: 19/19 AC tests pass (16 Jest + 3 Vitest); the full repository suite was not re-run in this review.
- [ ] Documentation: **FAIL** — no README/CHANGELOG update for the user-facing invitation lifecycle and settings changes.
- [x] NFR Evidence: NFR-014..NFR-019 covered by tests and code; no performance/SEO NFR in v2.
- [ ] Definition of Done: **FAIL** — scope, code quality, documentation and security prevent release.
- [x] Spec-to-Code Verification: `sdrive verify` PASS (28/0/0/0).
- [ ] CI: **not verified** — no run for this branch/HEAD; the workflow triggers on main/master pushes and PRs only.
- [x] Permission: allowed for kenule500 (admin); the first check hit a transient framework-sync race and was re-run before auditing.
- [x] Reviewer Independence: **warn** — `feature.assignee` is absent and the sole admin authored the branch; the conflict is recorded, and this is a FAIL verdict, not a self-approval.

## 4. Change Scope

- Files changed: **92** against `main`
- Planned files changed: **16** component paths (mail, tenancy, schema/migration, shared schemas, Staff/Accept pages, i18n, `.env.example`)
- Unplanned files:
  - **Settings / custom roles (BP-035):** `backoffice/src/pages/SettingsPage.tsx`, `backoffice/src/pages/settings/*`, `server/src/tenancy/dto/clinic-settings.dto.ts`, `server/src/tenancy/dto/role.dto.ts`, `server/prisma/migrations/20261107110000_clinic_settings`, `server/prisma/migrations/20261107130000_custom_roles`, `server/src/tenancy/settings.e2e.spec.ts`, `server/src/tenancy/roles.e2e.spec.ts`, `backoffice/test/settings/settings.test.tsx`
  - **Organization overview:** `backoffice/src/pages/OverviewPage.tsx`, `server/src/tenancy/organization-overview.e2e.spec.ts`
  - **Workspace shell/switcher:** `backoffice/src/App.tsx`, `backoffice/src/auth/WorkspaceContext.tsx`, `backoffice/src/layouts/AppShell.tsx`, `backoffice/src/layouts/Breadcrumbs.tsx`, `backoffice/src/layouts/WorkspaceSwitcher.tsx`, `server/src/tenancy/dto/clinic.dto.ts`
  - **Build/tooling:** `packages/shared/package.json`, `packages/shared/tsconfig.build.json`, `realtime/*`, `web/eslint.config.mjs`, `server/Dockerfile`, `server/src/database/prisma.service.ts`, `server/src/database/memory-prisma.ts`
  - **Framework files:** broad `.sdrive/*` framework-sync changes (tooling, not feature code)
- Other-feature commits: none (all commits are on the auth-onboarding branch; the scope problem is unplanned work, not another feature's commits)
- Working tree: clean

## 5. Issues Found

| Severity | Issue                                                                                                                                          | Location                                                                                                                                                                                                                        | AC  | Fix Required | Fix with                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------ | ------------------------ |
| High     | Unplanned settings/custom-role, overview and workspace-shell product work is on the v2 branch; it is absent from the v2 plan and productItems. | `backoffice/src/pages/SettingsPage.tsx`, `backoffice/src/pages/settings/*`, `backoffice/src/pages/OverviewPage.tsx`, `server/src/tenancy/dto/clinic-settings.dto.ts`, `server/prisma/migrations/20261107110000_clinic_settings` | —   | Yes          | `/sdrive:update-propose` |
| Medium   | `pnpm format:check` exits 2 and T12.2 is marked complete inaccurately.                                                                         | `.sdrive/templates/turborepo/*`, `backoffice/scripts/*.mjs`, `server/src/auth/auth.e2e.spec.ts`, `test/*.mjs`                                                                                                                   | —   | Yes          | `/sdrive:apply`          |
| Low      | README/CHANGELOG do not cover the user-facing invitation lifecycle and settings changes.                                                       | `README.md`                                                                                                                                                                                                                     | —   | Yes          | `/sdrive:docs`           |
| Medium   | Two critical dev-only `tinypool` advisories and five moderate dev-tool advisories remain; `nodemailer` 10.3.1 has no advisory in this audit.   | `pnpm-lock.yaml`                                                                                                                                                                                                                | —   | No           | `/sdrive:secure`         |
| Low      | The test evidence summary records 16 tests while the report records 19; the Vitest segment and raw log reconcile the difference.               | `.sdrive/governance/authentication-onboarding-and-access-control/v2/test-evidence.json`                                                                                                                                         | —   | No           | —                        |

## 6. Recommendations

- Prefer `/sdrive:update-propose` to bring the settings/custom-role/overview/workspace work under the v2 spec only if that is the intended scope; otherwise move it to a separate feature before re-review.
- Run the repository formatter once and commit the result so `format:check` is actionable for future gates.
- Add a short README section for invitation statuses, resend/cancel/decline, and the settings screens.
- Schedule a Vitest/tinypool upgrade (or record an explicit accepted risk) for the dev-only critical advisories.
- When the fixes are in, run `sdrive test authentication-onboarding-and-access-control` again so the evidence is bound to the new HEAD.

## 7. Security & Performance

| Area                                               | Status         | Reason / measurement                                                                                                          |
| -------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Security — secrets, dependencies, CON-51x baseline | not_verified   | Secrets clean; CON-511..519 pass; `pnpm audit` 2 critical dev-only `tinypool`, 5 moderate dev tooling; no v2 security report. |
| Performance — NFRs, SEO                            | not_applicable | v2 declares no performance or SEO NFR; NFR-014..019 are delivery/security/localization/pagination.                            |

## 8. Handoff

- **If PASS:** run `/sdrive:archive authentication-onboarding-and-access-control` to merge and archive.
- **If FAIL:** fix the findings above (T13.1–T13.4), run `sdrive test authentication-onboarding-and-access-control`, then `/sdrive:review authentication-onboarding-and-access-control` again (round 1 of 3). The review does not modify code; a fix moves HEAD and invalidates this verdict.
- **Round cap:** if round 3 fails on the same finding, stop and hand it to a human.
