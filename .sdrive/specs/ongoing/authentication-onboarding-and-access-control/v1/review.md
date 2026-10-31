---
status: FAIL
feature: authentication-onboarding-and-access-control
version: v1
branch: feature/auth-onboarding
base: main
commit: 8c97d5d7b1c217554e35ad0453ac5b12ad9a7cdb
reviewedBy: specdrive-review-agent
reviewedAt: 2026-10-29T17:07:57.000Z
coverage: 89
evidence: .sdrive/governance/authentication-onboarding-and-access-control/v1/test-evidence.json
---

# Review Report: Authentication, Onboarding & Access Control (v1)

## 1. Audit Summary

- **Status:** ❌ **FAIL** (release blocked)
- **Date:** 2026-10-29
- **Reviewer:** `specdrive-review-agent` via `/sdrive:review` — **independent of the implementer: no.** The workspace has a single member (`kenule500`, admin) who both implemented and requested this review. The conflict is recorded rather than silently self-approved; a PASS would additionally need that human to confirm the verdict.
- **Version:** `v1` (`currentVersion` in `.sdrive/workflow-state.json`)
- **Lifecycle location:** `.sdrive/specs/ongoing/authentication-onboarding-and-access-control/v1/` — resolved before reading; the folder was **not** moved.
- **Commit:** `8c97d5d7b1c217554e35ad0453ac5b12ad9a7cdb` (`8c97d5d`)
- **Branch / base:** `feature/auth-onboarding` / `main` (matches `feature.branch` / `feature.base`; no merge target was selected or changed here)
- **Withdrawn criteria:** **0 of 45** — nothing was withdrawn, so 45 criteria are in scope.

### Why it fails

| # | Blocking criterion | Measured | Required |
| - | ------------------ | -------- | -------- |
| 1 | **AC coverage** | **40 / 45 = 89 %** (`AC-006`, `AC-009`, `AC-012`, `AC-032`, `AC-042` unlinked) | 100 % |
| 2 | **Traceability integrity** | 4 in-scope ACs have no `traceability.json` row at all; `FR-014` is `in_progress`; **6 linked `TEST-` IDs do not exist in the codebase** | every AC linked, every linked test exists |
| 3 | **Spec-to-code verification** | `sdrive verify` → **`fail`** (matched 4, missing 94, renamed 7) | `pass` or `warn` (CON-602) |
| 4 | **Test evidence** | `test-evidence.json` **absent** (`governance.requireTestEvidence: true`) | exit 0, 0 failed, `commit === HEAD` |
| 5 | **Commit binding / clean tree** | working tree **dirty**: 97 modified + 9 untracked paths | clean tree (CON-609) |

Supporting failures: no `/sdrive:secure` report or recorded waiver for an auth/data-heavy change, no NFR report for the performance and accessibility NFRs, no README/CHANGELOG update, and CI not verified for this branch.

## 2. Evidence

| Evidence | Path / command | Result |
| -------- | -------------- | ------ |
| Test evidence | `.sdrive/governance/authentication-onboarding-and-access-control/v1/test-evidence.json` | **missing** — the file does not exist; only the schema (`.sdrive/schemas/test-evidence.schema.json`) is present |
| Test report | `.sdrive/reports/tests/test-report-authentication-onboarding-and-access-control-v1-2026-10-29.md` | exists, 2026-10-29 14:57 — newer than `spec.md` (01:41) and `plan.md` (02:08) |
| Server tests (run for this review) | `pnpm --filter server exec jest --runInBand --forceExit` | **10 suites passed, 1 skipped; 47 tests passed, 1 skipped, 0 failed** (115 s) |
| Front-end tests (run for this review) | `pnpm --filter backoffice exec vitest run` | **4 files / 7 tests passed, 0 failed** |
| Lint | `pnpm lint` (web + server + backoffice) | exit **0**, no warnings |
| Typecheck | `pnpm typecheck` (web + server + backoffice) | all three packages **Done**, no errors |
| Verification | `sdrive verify authentication-onboarding-and-access-control --json` | **`fail`** — matched 4, missing 94, renamed 7, extra 0 (`verification.json`, `checkedAt 2026-10-29T16:15:46Z`) |
| Governance validation | `sdrive check --json`, `sdrive validate --json` | `ok: true`; every governance file `valid`; `test-evidence.json` reported as `skipped` |
| Audit chain | `sdrive audit:verify --json` | `ok: true`, “no audit log yet” (0 entries) |
| Permission | `node .sdrive/scripts/check-permission.js slash /sdrive:review` | ✅ `User "kenule500" (admin) is allowed.` |
| CI | `gh run list --json …` | one run in the repository, branch `main`, conclusion **failure** (2026-10-28). **No CI run exists for `feature/auth-onboarding` / `HEAD` → CI not verified** |
| Secret scan | pattern search (`AKIA…`, `BEGIN … PRIVATE KEY`, `sk_live_…`, `password = "…"`) | no production secrets; only test-fixture passwords in `*.e2e.spec.ts` (one, `RiayaAdmin123!`, equals the documented local dev seed). **No `gitleaks`/`trufflehog` available → manual secret scan only.** |
| Dependency audit | `exa`/Context7 vulnerability lookup | **not performed** in this environment — dependency-CVE status is `not_verified` |


## 3. Criteria Check

| # | Criterion | Result | Detail |
| - | --------- | ------ | ------ |
| 1 | Spec convergence | ⚠️ **not_verified** | Code inspection confirms the planned routes, entities and modules exist (e.g. `server/src/auth/auth.controller.ts`, `server/prisma/schema.prisma`, `docker-compose.yml`), and `HEAD`'s committed `verification.json` reported matched 105 / missing 0. But the verifier as it now runs reports 94 missing (see issue **I-3**), so this criterion cannot be certified by tooling. |
| 2 | Task completion | ✅ pass | `tasks.md`: **0** unchecked boxes; `tasks.json`: **38 / 38** tasks `completed: true`. |
| 3 | Traceability | ❌ **fail** | `AC-006`, `AC-012`, `AC-032`, `AC-042` have **no row at all**; `AC-009` sits on `FR-014` (`in_progress`). Six linked IDs — `TEST-025`, `TEST-028`, `TEST-029`, `TEST-030`, `TEST-032`, `TEST-033` — appear **nowhere** in the codebase. |
| 4 | Coverage | ❌ **fail** | 45 ACs in scope, 0 withdrawn, **40 tested → 89 %**; the gate requires 100 %. Untested: `AC-006`, `AC-009`, `AC-012`, `AC-032`, `AC-042`. |
| 5 | Test report | ✅ pass | Present and newer than `spec.md` and `plan.md`. Caveat: its headline “44 / 45 = 98 %” is **not reproducible** from `traceability.json` (40/45). |
| 6 | Test evidence | ❌ **fail** | `test-evidence.json` missing, so no run can be bound to `HEAD`. The suites were executed during this review, but that is reviewer evidence, not a gate artefact. |
| 7 | Change scope | ❌ **fail** | Tree dirty (97 M / 9 ??); see §4. |
| 8 | Test quality | ❌ **fail** | No `.only`, no `xit`, no commented-out assertions; the single skip is justified in-file (Redis integration, `LOCKOUT_INTEGRATION=1`). **But** CON-405 is violated: AC IDs live in comments (`// TEST-040 → AC-032`), not in test names, for every server suite; only the four backoffice suites put the ID in the name. |
| 9 | Code quality | ✅ pass | `pnpm lint` exit 0 and `pnpm typecheck` clean across all three packages. |
| 10 | Security | ❌ **not_verified** | No `.sdrive/reports/security/` report and no recorded waiver, for a feature that rewrites authentication and tenancy. Manual pattern scan found no secrets, but that is not a `/sdrive:secure` audit. |
| 11 | Testing | ✅ pass | 54 tests pass (47 server + 7 backoffice), 1 skipped, 0 failed. |
| 12 | Documentation | ❌ **fail** | No `README.md`/`CHANGELOG.md` (or `docs/`) change in the 107-file diff, although registration, invitations, workspace switching and the Redis requirement are user-facing/dev-facing changes. |
| 13 | NFR evidence | ❌ **not_verified** | `NFR-010` (login p95 ≤ 400 ms) and `NFR-011` (WCAG 2.1 AA) have no `/sdrive:performance` report; `.sdrive/reports/performance/` is empty. `NFR-012`/`NFR-013` are covered by tests. |
| 14 | Definition of Done | ❌ **fail** | Blocked by criteria 3, 4, 6, 7, 8, 10, 12, 13 and 15. |
| 15 | Spec-to-code verification | ❌ **fail** | `sdrive verify` → `fail` (CON-602 forbids completing a feature without `pass`/`warn`). |
| 16 | CI | ⚠️ **not verified** | CI workflow exists (`.github/workflows/ci.yml`: install, lint, typecheck, test, build) but has never run for this branch; the only run failed on `main`. |
| 17 | Permission | ✅ pass | `kenule500` (admin) is authorised. |
| 18 | Reviewer independence | ⚠️ warn | Implementer and reviewer are the same person; no independent reviewer exists in the workspace. Recorded explicitly (no silent self-approval). |


## 4. Change Scope

- **Files changed vs `main`:** 107 (`git diff --name-only main...HEAD`), 31 commits.
- **Planned and present:** auth module, tenancy module (org/clinic/membership/invitation), audit module, tenant context + middleware, `RedisCacheService` strict mode, token-blacklist and login-attempt stores, `RolesGuard`, JWT strategy, mail templates, backoffice pages/i18n, `docker-compose.yml`, Prisma migration — matches `plan.json` components.
- **Unplanned / out-of-scope files:**
  - `CUsersKENULE-NWINEEDocumentsRi-aya/.t3-probe.tmp`, `CUsersKENULE-NWINEEDocumentsRi-aya/T3-HANDOFF.md` — a stray directory created by a mis-quoted path, committed to the branch.
  - `.sdrive/scripts/verify.js`, `.sdrive/scripts/lib/product-plan.js` — framework CLI changes committed inside a feature branch.
  - `.sdrive/product/backlog.md` — product-backlog edit (`188b42c fix(backlog): treat an encoded dash as no dependency`).
  - `.sdrive/reports/tests/raw/link-testids.cjs` — a helper script that wrote `traceability.json` links, committed as evidence; it is the source of the dangling `TEST-` IDs.
  - `.gitignore`, `server/src/database/memory-prisma.ts`, `backoffice/vitest.config.ts`, `backoffice/test/setup.ts` — plausible enablers, not listed in the plan.
- **Planned but not delivered:** `plan.json` says the i18n component adds auth strings “in both front ends”; **no `web/` file changed** in the diff.
- **Other-feature / out-of-scope commits:** `188b42c` (product backlog), `f5b4fa9` and `04dd65a` (`chore(verify)` framework script).
- **Working tree:** **dirty** — 97 modified, 9 untracked at audit time (99 modified once this review wrote `review.md` and `review.json`):
  - 95 of the modified files are the `.sdrive/` framework itself (agents, commands, dashboard, MCP, migrations, schemas, scripts, templates, `framework-manifest.json`). `framework-manifest.json` records `cliVersion 0.1.47`, `installedAt 2026-10-29T16:05:38Z`, i.e. a framework re-sync landed in the tree mid-feature.
  - `server/src/cache/lockout-persistence.spec.ts` — an **uncommitted source edit**.
  - `.sdrive/governance/.../verification.json` — rewritten by this review's `sdrive verify` run.
  - Untracked: `.sdrive/.backups/`, `.sdrive/scripts/lib/resolution.js`, `server/probe-redis.cjs`, and five raw probe/test logs under `.sdrive/reports/tests/raw/`.


## 5. Issues Found

| # | Severity | Issue | Location | AC | Fix required |
| - | -------- | ----- | -------- | -- | ------------ |
| I-1 | **High** | AC coverage is 89 % (40/45); `AC-006`, `AC-009`, `AC-012`, `AC-032`, `AC-042` are unlinked. `AC-009` exists as `TEST-050` but the suite is skipped unless `LOCKOUT_INTEGRATION=1`. | `traceability.json`; `server/src/cache/lockout-persistence.spec.ts` | AC-006, AC-009, AC-012, AC-032, AC-042 | Yes |
| I-2 | **High** | Six linked test IDs do not exist anywhere in the code: `TEST-025`, `TEST-028`, `TEST-029`, `TEST-030`, `TEST-032`, `TEST-033`. They were written by `link-testids.cjs`, not by a test author, and they carry `AC-004`, `AC-005`, `AC-007`, `AC-008`, `AC-029`, `AC-035`, `AC-038`. | `.sdrive/governance/.../traceability.json`; `.sdrive/reports/tests/raw/link-testids.cjs` | AC-004, AC-005, AC-007, AC-008, AC-029, AC-035, AC-038 | Yes |
| I-3 | **High** | `sdrive verify` reports `fail` (matched 4 / missing 94 / renamed 7) for the same commit whose committed report says matched 105 / missing 0. Root cause: the 16:05 framework re-sync replaced the project-customised `.sdrive/scripts/verify.js` (the customisation added by `f5b4fa9`). The new scanner has **no NestJS decorator detection**, does **not** include `.prisma` in `CODE_EXTENSIONS`, and only scans root candidates that exclude `web/` and `backoffice/`. The code is present — this is a tooling regression, but CON-602 still blocks. | `.sdrive/scripts/verify.js`, `.sdrive/framework-manifest.json` | all | Yes |
| I-4 | **High** | `test-evidence.json` is missing while `governance.requireTestEvidence` is `true`, so no test run is bound to `HEAD`. | `.sdrive/governance/authentication-onboarding-and-access-control/v1/` | — | Yes |
| I-5 | **Medium** | Working tree is dirty (97 M / 9 ??): uncommitted edit to `lockout-persistence.spec.ts`, the whole `.sdrive/` framework re-sync, `.sdrive/.backups/`, `.sdrive/scripts/lib/resolution.js`, `server/probe-redis.cjs` and five probe logs. The verdict cannot be bound to `HEAD` (CON-609). | repository root | — | Yes |
| I-6 | **Medium** | No `/sdrive:secure` report and no recorded waiver for a change that rewrites authentication, tenancy and token handling. | `.sdrive/reports/security/` (empty) | — | Yes |
| I-7 | **Medium** | CON-405 violated: server test names do not contain the AC ID (IDs appear only as `// TEST-0xx → AC-0xx` comments). `AC-004`, `AC-005`, `AC-006`, `AC-007`, `AC-008`, `AC-026`, `AC-029`, `AC-038` appear as IDs in no test file at all. | `server/src/**/*.spec.ts` | AC-004…AC-008, AC-026, AC-029, AC-038 | Yes |
| I-8 | **Medium** | The test report claims “44 / 45 = 98 %” while `traceability.json` supports 40/45 = 89 %. Evidence and governance disagree. | `.sdrive/reports/tests/test-report-…-2026-10-29.md` §8 | — | Yes |

| I-9 | **Medium** | No README/CHANGELOG/docs update for user-facing changes (registration, invitations, workspace switching, Redis requirement). | `README.md`, `CHANGELOG.md` | — | Yes |
| I-10 | **Medium** | NFR-010 (p95 ≤ 400 ms) and NFR-011 (WCAG 2.1 AA) have no report; `.sdrive/reports/performance/` is empty. | `.sdrive/reports/performance/` | AC-004, AC-033 | Yes |
| I-11 | **Medium** | D14 still open: a native PostgreSQL 17 owns host port 5432, so compose's PostgreSQL 16 is unreachable while the container reports healthy; development silently runs on 17. | `docker-compose.yml` | AC-039 | Yes |
| I-12 | **Low** | `TEST-040`/AC-032 asserts `GET /api/health`, not a dashboard cache read, so the criterion is only weakly evidenced even once linked. | `server/src/tenancy/acceptance-gaps.e2e.spec.ts:217` | AC-032 | No |
| I-13 | **Low** | D18: Jest still leaks a handle — the run needs `--forceExit` to return (115 s), consistent with the ioredis client. | `server/src/cache/redis-cache.service.spec.ts` | — | No |
| I-14 | **Low** | Stray committed artefacts on the branch (`CUsersKENULE-NWINEEDocumentsRi-aya/…`) and uncommitted debug probes (`server/probe-redis.cjs`, `.txt` logs). | repository root | — | No |
| I-15 | **Low** | Framework scripts and product backlog were modified on a feature branch; framework changes belong in their own change. | `.sdrive/scripts/*`, `.sdrive/product/backlog.md` | — | No |


## 6. What this review confirms is genuinely done

Verified by running the suites and reading the diff — not inherited from earlier reports:

- **Registration and owner onboarding** — identity + organization + first clinic + `SUPER_ADMIN` membership, owner signed in immediately (`registration.e2e.spec.ts`, 6 tests).
- **Legacy signup retired** — `POST /auth/signup` returns `410 SIGNUP_RETIRED` and writes nothing (`signup-retired.e2e.spec.ts`).
- **Tenant scoping** — tokens carry `org_id`/`clinic_id`/`role`; switching re-issues a scoped token; an unowned clinic is refused (`switch-workspace.e2e.spec.ts`).
- **Invitations and suspension** — single-use hashed tokens; suspension kills live tokens and protects the last super admin (`invitations`, `suspension` suites).
- **Audit trail** — mutations write an audit row in the same transaction (`audit-trail.e2e.spec.ts`).
- **Front-end states** — wizard back-navigation, accept-invite states, RTL direction and `/signup` redirect (4 Vitest suites, 7 tests).
- **Build health** — root lint and typecheck are clean across `web`, `server` and `backoffice`.

## 7. Recommendations

1. Fix the tree first: commit or discard `server/src/cache/lockout-persistence.spec.ts`, remove `server/probe-redis.cjs` and the raw probe logs, and decide what to do with the `.sdrive/` framework re-sync (commit it as its own `chore(specdrive)` change, or revert it). Then re-run the review so it binds to one commit.
2. Restore NestJS/Prisma verification: either re-apply the customised `verify.js` (commit `f5b4fa9`) or add `.prisma` to `CODE_EXTENSIONS`, a NestJS decorator branch in `detectEndpoints`, and `web`/`backoffice` to the scanned roots. Until `sdrive verify` returns `pass`/`warn`, no feature in this repository can be completed.
3. Run `sdrive test authentication-onboarding-and-access-control` so the gate gets a real `test-evidence.json` bound to `HEAD`.
4. Then close the four missing traceability rows and delete the six dangling `TEST-` IDs — only after the tests those IDs claim to represent actually exist. `AC-006` needs a new test; `AC-009` needs a recorded integration run (or an explicit waiver).
5. Run `/sdrive:secure` (auth/tenancy) and `/sdrive:performance` (NFR-010 p95, NFR-011 WCAG) so criteria 10 and 13 stop being `not_verified`.
6. Update `README.md` for the registration/invitation flow and the Redis requirement; close D14 in BP-001.


## 8. Explicitly NOT done here

- **No merge and no archive.** The feature folder was **not** moved out of `specs/ongoing/`; only `/sdrive:archive` may do that, and only after a PASS.
- **No tests written and no product code changed** — those belong to `/sdrive:test` and `/sdrive:apply`/`/sdrive:debug`.
- **`traceability.json` was not hand-edited.** Adding rows for `AC-012`/`AC-032`/`AC-042` would have lifted coverage to 96 % on the reviewer's authority — exactly the failure mode that produced the six phantom IDs. Linking is the Test agent's job.
- **No fix tasks were injected into `tasks.json`.** The blocking items are process/tooling fixes with no FR/NFR to link, and `tasks.schema.json` requires at least one `linkedRequirements` entry; inventing a link would breach CON-703. The fix list above is the authoritative hand-off.
- **Nothing was committed or pushed.** The tree already carries unrelated framework changes, no approval gate was granted, and CON-613 forbids committing without an explicit human request.

## 9. Handoff

```
/sdrive:test authentication-onboarding-and-access-control
```

Then re-run `/sdrive:review authentication-onboarding-and-access-control`. Only a **PASS** clears `/sdrive:archive authentication-onboarding-and-access-control`.

