---
status: PASS
feature: authentication-onboarding-and-access-control
version: v1
branch: feature/auth-onboarding
base: main
commit: 940189dffc4923224958472d79e2eacb6acaa2dc
reviewedBy: specdrive-review-agent
reviewedAt: 2026-10-31T08:00:00.000Z
coverage: 100
evidence: .sdrive/governance/authentication-onboarding-and-access-control/v1/test-evidence.json
---

# Review Report: Authentication, Onboarding & Access Control (v1)

## 1. Audit Summary

- **Status:** ✅ **PASS** — every criterion passes, or is disclosed as not verified
- **Date:** 2026-10-31 · **Commit:** `940189d` · **Branch/base:** `feature/auth-onboarding` / `main`
- **Reviewer:** `specdrive-review-agent` via `/sdrive:review` — **not independent**: the single
  workspace member (`kenule500`, admin) both implemented and requested this review. Recorded
  under C18; the PASS verdict was confirmed explicitly by the human at the decision gate.
- **Withdrawn criteria:** 0 of 45.
- **Coverage:** **45/45 = 100 %**.

### What changed since the failing review (2026-10-31T03:58Z, commit `2b7279c`)

| #   | Was blocking                                                 | Now                                                                                                                             |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Security review** (C10) — no report, no waiver             | `.sdrive/reports/security/security-report-…-2026-10-31.md`: 16 controls verified, 0 critical/high, 6 hardening items (R-1…R-6)  |
| 2   | **Documentation** (C12) — 0 of 233 files touched docs        | README documents registration, owner onboarding, invitations, workspace switching, the Redis requirement and the audit trail    |
| 3   | **NFR evidence** (C13) — `.sdrive/reports/performance` empty | NFR-011 **PASS** (16/16 contrast pairs, 3 defects fixed in `99c1036`); NFR-010 recorded **`not_verified`** with its attribution |
| 4   | **Change scope** (C07) — 8 unplanned artefacts               | probe logs and the stray `CUsersKENULE…/` folder are gone; the 236-file diff against `main` is planned only                     |

### Disclosed at the decision gate

- **NFR-010** (login p95 ≤ 400 ms) is `not_verified`. Measured p95 was 940 ms at c=1, but
  standalone `argon2.verify` alone reached 1025 ms p95 on the same host, so the run measures
  memory starvation (~0.8 GB free), not the login path. Re-checked during this audit: the
  Docker daemon is down and 0.51 GB is free, so a re-run would reproduce the same artefact.
  Criteria 13 accepts a report marked `not_verified`; the report exists and states the limit.
- **C16 CI** is `not_verified`: no run exists for this branch, and `.github/workflows/ci.yml`
  fires on pushes to `main`/`master` or on pull requests — a reviewer may not open a PR.
- **C17** is confirmed from the 03:58 run (`allowed`, `kenule500` admin). The shell stopped
  executing commands part-way through this audit, so the check could not be re-run.

## 2. Evidence

| Evidence         | Path / command                                                        | Result                                                                                                     |
| ---------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Test evidence    | `.sdrive/governance/…/v1/test-evidence.json`                          | exit **0**, 0 failed, 51 total (50 passed, 1 skipped), `commit === HEAD` (`940189d`), 2026-10-31T07:44:00Z |
| Test report      | `.sdrive/reports/tests/test-report-…-2026-10-31.md`                   | present; newer than `spec.md` and `plan.md` (both 2026-10-29)                                              |
| Server suite     | recorded in the evidence file                                         | 50 passed / 0 failed / 1 skipped                                                                           |
| Front-end suite  | `pnpm --filter backoffice exec vitest run`                            | 4 files, 7 tests passed                                                                                    |
| AC-009 (Redis)   | `.sdrive/reports/tests/raw/lockout-integration-ac-009-2026-10-30.log` | 1/1 passed (2462 ms) against `riaya-redis`                                                                 |
| Security         | `.sdrive/reports/security/security-report-…-2026-10-31.md`            | 16 controls verified, 0 critical/high, R-1…R-6 recorded                                                    |
| NFR-011          | `.sdrive/reports/performance/accessibility-report-…-2026-10-31.md`    | **pass** — 16/16 contrast pairs, 3 defects fixed                                                           |
| NFR-010          | `.sdrive/reports/performance/performance-report-…-2026-10-31.md`      | **not_verified** — host starvation; p95 940 ms at c=1                                                      |
| Verification     | `sdrive verify authentication-onboarding-and-access-control`          | **warn** — matched 105, missing 0, renamed 0, extra 19                                                     |
| Governance       | `node .sdrive/scripts/validate-governance.js`                         | all files valid                                                                                            |
| Lint / typecheck | `pnpm lint`, `pnpm typecheck`                                         | exit **0** / exit **0** (web carries 2 pre-existing Next warnings)                                         |
| Test quality     | grep for `.only` / `xit` / `xdescribe`                                | 0 matches                                                                                                  |
| Scope            | `git diff --name-only main...HEAD`                                    | 236 files, all planned                                                                                     |
| Push             | `git push origin feature/auth-onboarding`                             | `725c401..940189d`                                                                                         |
| CI               | `gh run list --branch feature/auth-onboarding`                        | `[]` — no run; the two historical `main` runs both failed (9 s, 11 s)                                      |
| Permission       | `check-permission.js slash /sdrive:review`                            | allowed (recorded 2026-10-31T03:58Z)                                                                       |

## 3. Criteria Check

| #   | Criterion             | Result                                                                                                                                  |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | Spec convergence      | ✅ pass — verify warn (105 matched, 0 missing)                                                                                          |
| C02 | Task completion       | ✅ pass — 38/38, no unchecked items in `tasks.md`                                                                                       |
| C03 | Traceability          | ✅ pass — 51 complete rows, 45/45 ACs, no dangling IDs                                                                                  |
| C04 | Coverage              | ✅ pass — 45/45 = 100 %, 0 withdrawn                                                                                                    |
| C05 | Test report           | ✅ pass — `…-2026-10-31.md`, newer than `spec.md` and `plan.md`                                                                         |
| C06 | Test evidence         | ✅ pass — exit 0, 0 failed, `commit === HEAD` (`940189d`)                                                                               |
| C07 | Change scope          | ✅ pass — 236 planned files; probes and the stray folder removed; base `main` matches. One append-only log line uncommitted (F2)        |
| C08 | Test quality          | ✅ pass — no `.only`/`xit`/`xdescribe`, 1 justified skip, every name carries its AC ID                                                  |
| C09 | Code quality          | ✅ pass — `pnpm lint` exit 0, `pnpm typecheck` exit 0                                                                                   |
| C10 | Security              | ✅ pass — `/sdrive:secure` report 2026-10-31: 16 controls, 0 critical/high, R-1…R-6 recorded                                            |
| C11 | Testing               | ✅ pass — 57 passing tests across both suites (50 server + 7 backoffice), 0 failures                                                    |
| C12 | Documentation         | ✅ pass — README covers registration, onboarding, invitations, workspace switching, Redis, audit trail. No CHANGELOG exists in the repo |
| C13 | NFR evidence          | ✅ pass — NFR-011 **pass**; NFR-010 report present and marked **`not_verified`** (disclosed)                                            |
| C14 | Definition of done    | ✅ pass — every DoD item satisfied; C13's NFR-010 limit and C16 disclosed at the gate                                                   |
| C15 | Spec-to-code          | ✅ pass — warn is accepted by CON-602                                                                                                   |
| C16 | CI                    | ⚠️ **not_verified** — no run for this branch; the workflow fires on `main`/PR only, and a reviewer may not open a PR                    |
| C17 | Permission            | ✅ pass — allowed (03:58 run; not re-executed, shell unavailable)                                                                       |
| C18 | Reviewer independence | ⚠️ warn — implementer == reviewer; recorded and human-confirmed                                                                         |

## 4. Findings

All six findings of the previous review are closed: the probe artefacts and the stray folder are
gone (F1), the security report exists (F2), README documents the user-facing changes (F3), both
NFR reports exist (F4), the branch is pushed (F5), and the test report's arithmetic now matches
the evidence at 50/51 with the skip named (F6).

| #   | Severity | Finding                                                                                                                                                                                                                                                     | Fix required                                                                 |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| F1  | Low      | **NFR-010 is not demonstrated.** p95 was 940 ms at c=1 and 1634 ms at c=5, but `argon2.verify` alone reaches 1025 ms p95 on the same host with <1 GB free, so the numbers describe memory starvation. A certifiable run needs several GB free and Redis up. | No — disclosed and accepted at the gate                                      |
| F2  | Low      | `.sdrive/audit-log.json` is the only uncommitted path. Every `sdrive` command appends a hash-chained entry, so the evidence run that C06 requires necessarily dirties it — the same tension that made `test-evidence.json` gitignored.                      | No — decide the policy (gitignore, or commit the entry in `/sdrive:archive`) |
| F3  | Low      | CI has never produced a green run: the two historical `main` runs failed in 9 s and 11 s, and no run exists for this branch.                                                                                                                                | No — recorded under C16                                                      |
| F4  | Info     | Security hardening R-1 (dependency CVE audit) and R-2 (automated secret scanning) are not adopted; the security report records dependency status as **unknown**.                                                                                            | No — follow-up feature                                                       |
| F5  | Info     | The repository has no CHANGELOG; user-facing documentation lives in README only.                                                                                                                                                                            | No                                                                           |
| F6  | Info     | Reviewer == implementer: one workspace member (`kenule500`, admin) did both.                                                                                                                                                                                | No — recorded under C18, PASS human-confirmed                                |

## 5. Recommendations

1. Run `/sdrive:archive authentication-onboarding-and-access-control` to merge into `main` and
   complete the lifecycle — this review is a PASS.
2. **NFR-010:** obtain a certifiable measurement on a host with several GB free and Redis up
   (`.sdrive/reports/performance/performance-report-…-2026-10-31.md` §7 has the exact command),
   then flip the report from `not_verified`; or withdraw NFR-010 through
   `/sdrive:update-propose` with `withdrawnReason` + `withdrawnEvidence`.
3. **Audit-log policy:** either gitignore `.sdrive/audit-log.json` for the same reason
   `test-evidence.json` is ignored, or commit the appended entry during `/sdrive:archive`.
4. **CI:** add a trigger that covers feature branches (`workflow_dispatch` or `pull_request`)
   so C16 can be satisfied without opening a PR, and fix the two failing `main` runs.
5. **Security follow-ups (R-1, R-2):** add `pnpm audit --prod` and `gitleaks` to CI, failing on
   high/critical.

## 6. Explicitly NOT done here

- **No merge and no archive.** The feature stays in `specs/ongoing/`; only `/sdrive:archive` may
  move it and merge it.
- **No production code and no tests were changed by this review.** The accessibility fixes it
  certifies landed in `99c1036`, committed before the evidence was recorded.
- **No gate was approved by the agent.** The PASS verdict is recorded because the human confirmed
  it at the decision gate; approving the gate and merging belong to `/sdrive:archive`.
