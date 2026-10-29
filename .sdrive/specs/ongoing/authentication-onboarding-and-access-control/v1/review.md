# Review — authentication-onboarding-and-access-control (v1)

**Verdict: ❌ FAIL**
**Commit:** `04dd65a` · **Branch:** `feature/auth-onboarding` → **Base:** `main`
**Reviewed:** 2026-10-29 · **Reviewer:** SpecDrive review agent

---

## Why it fails

Two blocking criteria, both fixable without touching product behaviour:

| Blocking           | Detail                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AC coverage 7%** | Only **3 of 45** acceptance criteria have a linked test ID in `traceability.json`. The release gate requires **100%**.                                    |
| **Tree not clean** | `backoffice/src/i18n/en.json` is modified but uncommitted (`"clinicName": "Clinic name (Workspace)"`), so the verdict cannot be bound to a single commit. |

## Criteria

| #   | Criterion                   | Result      | Evidence                                                                                     |
| --- | --------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| C1  | Spec alignment              | ✅ pass     | `sdrive verify`: Matched **105**, Missing **0**, Renamed **0**                               |
| C2  | Governance valid            | ✅ pass     | `validate-governance.js`: all files valid                                                    |
| C3  | Verification gate           | ✅ pass     | status **warn** (accepted by the gate)                                                       |
| C4  | Tests execute               | ✅ pass     | **9 suites / 36 tests / 0 failures**                                                         |
| C5  | AC coverage                 | ❌ **fail** | 3 / 45 = **7%** (100% required)                                                              |
| C6  | Test report present & fresh | ✅ pass     | newer than `spec.md` / `plan.md`                                                             |
| C7  | Typecheck & lint            | ⚠️ warn     | server `tsc` + `eslint` = 0; backoffice `tsc` = 0 earlier, lint not re-run after final edits |
| C8  | Secret scan                 | ✅ pass     | no production secrets; one test-fixture password matching the dev seed                       |
| C9  | Working tree clean          | ❌ **fail** | `backoffice/src/i18n/en.json` modified                                                       |
| C10 | Commit binding              | ✅ pass     | HEAD `04dd65a` on `feature/auth-onboarding` from `main`                                      |

## What this review confirms is genuinely done

- **Registration and owner onboarding** — identity + organization + first clinic + `SUPER_ADMIN` membership in one transaction, owner signed in immediately, no pending-approval dead end.
- **Legacy signup retired** — `POST /auth/signup` returns `410 SIGNUP_RETIRED` and writes nothing.
- **Tenant scoping** — token carries `org_id`/`clinic_id`/`role`; switching re-issues scoped tokens; unowned clinics are refused with `403 NO_MEMBERSHIP`.
- **Invitations** — hashed single-use token delivered by email only, exactly the invited role granted, earlier tokens revoked on re-issue.
- **Suspension** — existing tokens die immediately (`NO_ACTIVE_MEMBERSHIP`); last-super-admin is protected.
- **Audit trail** — organization, clinic and membership writes each leave an entry scoped to their tenant; rejected mutations leave none.
- **The membership role reaches the client** — verified live: a user with `users.role = NULL` logs in and receives `SUPER_ADMIN` from their membership.

## Fix list (in order)

1. **Allocate `TEST-###` IDs and link them in `traceability.json`** for every AC that already has a passing test (23 do). This alone lifts coverage from 7% to ~51%.
2. **Write the remaining tests** for the ACs with none — chiefly `AC-033`, `AC-034` (RTL/mirroring), `AC-036`–`AC-038` (Swagger contract, browser states), plus the error-state and rate-limit criteria. Run `/sdrive:test`.
3. **Commit or discard the `en.json` edit**, then re-run the review so it binds to one commit.
4. **Close D14** in BP-001: a native PostgreSQL 17 owns port 5432, so compose's PostgreSQL 16 is unreachable while reporting healthy. The brief mandates PostgreSQL 16.
5. Optional (non-blocking): the 19 duplicate bare-path endpoints in the verifier output, and the D18 leaked Jest handle.

## Explicitly NOT done here

- **No merge, no archive.** Merging is `/sdrive:archive`, and it is blocked by this verdict.
- **No tests written** (the Test agent owns that) and **no product code changed** (the Implementation/Debug agents own that).
- **Not claiming manual ACs passed.** AC-033/034/036/037/038 need a browser; they are recorded as unverified, not as green.

## Next step

```
/sdrive:test authentication-onboarding-and-access-control
```

then re-run `/sdrive:review`. Only after a **PASS** may `/sdrive:archive` merge this branch.
