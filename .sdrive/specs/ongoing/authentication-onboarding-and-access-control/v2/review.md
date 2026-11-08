---
title: Review Report: Authentication, Onboarding & Access Control (v2)
feature: authentication-onboarding-and-access-control
version: v2
status: FAIL
reviewedBy: kenule500
reviewedAt: 2026-11-08T10:10:33.375Z
commit: 0b36f0dc3c82e35310ffdce881db6d5531022191
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
- **Commit:** `0b36f0d`
- **Branch / base:** `feature/auth-onboarding` / `main`
- **Round:** 2 of 3

The test and scope blockers are cleared: **30/30 ACs have tests and pass**, traceability is complete, and the former high finding (settings/overview/workspace product work outside the spec) is resolved. The feature still cannot be cleared because four tasks remain incomplete, the repository formatter fails, and the user-facing documentation and security verification are still open.

## 2. Evidence

- Test evidence: `.sdrive/governance/authentication-onboarding-and-access-control/v2/test-evidence.json` — exit `0`, `0` failed, `23` passed + `7` skipped Jest tests; the same command ran 7 Vitest AC tests, and the report records **30/30** AC tests. Commit `0b36f0d` equals HEAD.
- Test report: `.sdrive/reports/tests/test-report-authentication-onboarding-and-access-control-v2-2026-11-08.md` — 30/30 ACs; newer than `spec.md` and `plan.md`.
- Verification: `.sdrive/governance/authentication-onboarding-and-access-control/v2/verification.json` — **warn**, 76 matched, 0 missing, 0 renamed, 28 extra (pre-existing endpoints; CON-602).
- Audit chain: `sdrive audit:verify` — 104 hashed events verified, `brokenAt: null`.
- CI: not verified — no run exists for `feature/auth-onboarding` or HEAD `0b36f0d`.

## 3. Criteria Check

- [x] Spec Convergence: all 30 ACs implemented and covered; the product scope extension is in spec/plan.
- [ ] Task Completion: **FAIL** — T13.2, T13.3, T13.4 and T17.2 are still incomplete.
- [x] Traceability: 32 rows cover all 30 ACs; every row has a test ID and `status: complete`.
- [x] Coverage: 100% (30/30 ACs tested, 30/30 AC tests passing).
- [x] Test Report: exists, versioned, 30/30, newer than spec and plan.
- [x] Test Evidence: exit 0, 0 failed, commit equals HEAD; 7 non-AC Jest tests were skipped by the AC filter and 7 Vitest AC tests passed.
- [x] Change Scope: **warn** — 97 files; all planned product components are present; remaining unplanned files are build/tooling/test support (Dockerfiles, eslint configs, shared build config, lockfile, memory Prisma double).
- [x] Test Quality: no `.only`/`xit`/skips; all AC-046–AC-075 test names carry AC IDs; no empty assertions.
- [ ] Code Quality: **FAIL** — typecheck and eslint pass, but `pnpm format:check` exits 2 on repository-wide test/tooling files.
- [ ] Security: **not_verified** — secrets clean; CON-511..519 wired; `pnpm audit` reports 2 critical dev-only `tinypool` advisories and 5 moderate dev-tool advisories; no v2 security report.
- [x] Testing: 30/30 AC tests pass (23 Jest + 7 Vitest); the full repository suite was not re-run in this review.
- [ ] Documentation: **FAIL** — no README/CHANGELOG update for the user-facing invitation lifecycle, settings, overview or workspace changes.
- [x] NFR Evidence: NFR-014..NFR-025 covered; no performance/SEO NFR in v2.
- [ ] Definition of Done: **FAIL** — task completion, formatter, documentation and security verification are not satisfied.
- [x] Spec-to-Code Verification: `sdrive verify` warn (76/0/0/28); no planned item missing.
- [ ] CI: **not verified** — no run for this branch/HEAD.
- [x] Permission: allowed for kenule500 (admin).
- [x] Reviewer Independence: **warn** — assignee absent; sole admin authored the branch; conflict recorded. This is a FAIL verdict, not a self-approval.

## 4. Change Scope

- Files changed: **97** against `main`
- Planned product files: settings, roles, overview, workspace, mail, invitations, schema/migrations, shared schemas and tests — all present in the plan.
- Unplanned build/tooling/test-support files: `packages/shared/package.json`, `packages/shared/tsconfig.build.json`, `realtime/Dockerfile`, `realtime/eslint.config.mjs`, `realtime/package.json`, `server/Dockerfile`, `server/eslint.config.mjs`, `web/eslint.config.mjs`, `pnpm-lock.yaml`, `server/src/database/memory-prisma.ts`.
- Other-feature commits: none; the branch is based on `main` (CON-612).
- Working tree: clean.

## 5. Issues Found

| Severity | Issue                                                                                                                                                                     | Location                                                                                                              | AC  | Fix Required | Fix with         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --- | ------------ | ---------------- |
| Medium   | `pnpm format:check` exits 2 on repository-wide test/tooling files; T13.2/T17.2 remain open.                                                                               | `backoffice/scripts/*.mjs`, `server/src/auth/auth.e2e.spec.ts`, `test/**/*.mjs`, `.sdrive/templates/*`                | —   | Yes          | `/sdrive:apply`  |
| Low      | README/CHANGELOG do not cover the user-facing v2 extension.                                                                                                               | `README.md`                                                                                                           | —   | Yes          | `/sdrive:docs`   |
| Medium   | Two critical dev-only `tinypool` advisories and five moderate dev-tool advisories remain; no accepted-risk record.                                                        | `pnpm-lock.yaml`                                                                                                      | —   | No           | `/sdrive:secure` |
| Low      | The evidence summary records 23 passed / 7 skipped of 30 Jest tests while the report records 30/30 AC tests; the skipped tests are non-AC and 7 Vitest tests also passed. | `.sdrive/governance/.../test-evidence.json`                                                                           | —   | No           | —                |
| Medium   | Unplanned build/tooling/test-support files remain outside the plan.                                                                                                       | `packages/shared/package.json`, Dockerfiles, eslint configs, `pnpm-lock.yaml`, `server/src/database/memory-prisma.ts` | —   | No           | —                |

The former high finding — settings/custom-role, organization-overview and workspace product work outside the v2 spec — is **resolved** by the 2026-11-08 extension and the 30/30 tests.

## 6. Recommendations

- Fix the formatter first: run the repository formatter on the named files, commit, and confirm `pnpm format:check` exits 0. The extension test files themselves are already clean.
- Add the README section for invitation statuses/resend/cancel/decline, settings, organization overview and workspace switching.
- Upgrade Vitest/tinypool or record an explicit accepted risk for the dev-only advisories.
- The build/tooling files are not product behavior; either add a short plan note covering them or move them to an infrastructure task so the next review’s change-scope criterion is unambiguous.

## 7. Security & Performance

| Area                                               | Status         | Reason / measurement                                                                                                          |
| -------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Security — secrets, dependencies, CON-51x baseline | not_verified   | Secrets clean; CON-511..519 pass; `pnpm audit` 2 critical dev-only `tinypool`, 5 moderate dev tooling; no v2 security report. |
| Performance — NFRs, SEO                            | not_applicable | v2 declares no performance or SEO NFR; NFR-014..025 are delivery/security/localization/bounded reads/tenant scope.            |

## 8. Handoff

- **If PASS:** run `/sdrive:archive authentication-onboarding-and-access-control` to merge and archive.
- **If FAIL:** fix the findings above (T13.2, T13.3, T13.4), run `sdrive test authentication-onboarding-and-access-control`, then `/sdrive:review authentication-onboarding-and-access-control` again (round 3 of 3). The review does not modify code; a fix moves HEAD and invalidates this verdict.
- **Round cap:** if round 3 fails on the same finding, stop and hand it to a human.
