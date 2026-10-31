# Test Report: Monorepo and Local Environment (v1)

## 1. Summary

- **Date:** 2026-10-31
- **Feature:** monorepo-and-local-environment
- **Version:** v1
- **Total ACs:** 7
- **Tested ACs:** 7
- **Coverage:** 100%
- **Tests Passed:** 7/7

## 2. How the numbers were produced

- **Framework:** `node --test` (built in; no dependency added). Chosen because the feature's
  production code is a repo-root Node script and configuration files, outside the
  `server` (Jest) and `backoffice` (Vitest) packages.
- **Command:**
  ```bash
  node --test test/monorepo-and-local-environment/setup-env.test.mjs \
                test/monorepo-and-local-environment/env-files.test.mjs \
                test/monorepo-and-local-environment/docs-and-compose.test.mjs \
                test/monorepo-and-local-environment/compose-health.test.mjs
  ```
- **Result:** exit **0** — 7 tests, 7 passed, 0 failed, 0 skipped (the `compose-health` test ran
  against the live stack; it skips itself when no Docker daemon is present).
- **Location:** `test/monorepo-and-local-environment/` (feature folder per the placement rule).
- Every test name carries its AC ID (CON-405).

## 3. AC → test mapping

| AC     | Test     | File                                                                                                                                                                                    | Status |
| ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC-002 | TEST-001 | `docs-and-compose.test.mjs` — each of postgres/redis/mongo declares a `healthcheck` and a named volume                                                                                  | pass   |
| AC-003 | TEST-002 | `setup-env.test.mjs` — second run changes nothing, reports `0 created, 3 skipped`, exits 0                                                                                              | pass   |
| AC-004 | TEST-003 | `setup-env.test.mjs` — missing `.env` is created from its example; `created`/`skipped`/`missing example` reported; exit 0                                                               | pass   |
| AC-005 | TEST-004 | `env-files.test.mjs` — `git ls-files` shows no tracked `.env` and all three `.env.example` files tracked                                                                                | pass   |
| AC-006 | TEST-005 | `docs-and-compose.test.mjs` — README names the three services, `pnpm setup`, `docker compose up -d` and ports 3000/4000/5173; the retired `cp …` instructions are gone                  | pass   |
| AC-007 | TEST-006 | `env-files.test.mjs` — `server/.env.example` documents `DATABASE_URL`, `REDIS_URL`, `MONGO_URL`, `JWT_ACCESS_SECRET`, `COOKIE_SECURE`; no credential shapes; JWT value is a placeholder | pass   |
| AC-001 | TEST-007 | `compose-health.test.mjs` — the three services report `healthy` (skips without a daemon). The three-port half was verified manually — see Notes                                         | pass   |

## 4. Withdrawn criteria

None (0 of 7). AC-001 is in scope and now tested: Docker was started on this host, the stack came
up, and both `compose-health` tests passed against it.

## 5. Failures

| Test | Reason | Blocking |
| ---- | ------ | -------- |
| —    | none   | —        |

## 6. Notes

- **Coverage is 100 %.** AC-001's service-health half is automated (TEST-007); it skips when no
  Docker daemon is present rather than passing vacuously.
- **The ports half of AC-001 is manual evidence, not automated.** `pnpm dev` was run and all three
  apps answered: web on `3000`, the API on `4000`, and the backoffice on `[::1]:5173` (Vite binds the
  IPv6 loopback, so an IPv4-only probe reports it as down). It is not asserted in the suite because
  that would require a human to leave three long-running servers up, and a stale server on `:4000`
  makes the run fail for reasons unrelated to this feature. Automating it properly means spawning
  and tearing down the dev stack inside the test - a follow-up task, deliberately not faked here.
- `sdrive verify monorepo-and-local-environment` returns **FAIL** (matched 4, missing 6) because the
  scanner's roots are `server`, `backoffice`, `web` only; the six "missing" components are repo-root
  files that exist. Recorded in the implementation report; it will fail review criterion C15 until
  the scanner covers the repo root.
- NFR-003 (services healthy) is verified by TEST-007. The **five-minute target (NFR-001) is still
  unmeasured**: the 71.1 s recorded was `docker compose up -d` on a warm image cache, not a fresh
  clone through `pnpm install`, so NFR-001 stays `in_progress`.
