# Test Report: Monorepo and Local Environment (v1)

## 1. Summary

- **Date:** 2026-10-31
- **Feature:** monorepo-and-local-environment
- **Version:** v1
- **Total ACs:** 7
- **Tested ACs:** 6
- **Coverage:** 86%
- **Tests Passed:** 6/6

## 2. How the numbers were produced

- **Framework:** `node --test` (built in; no dependency added). Chosen because the feature's
  production code is a repo-root Node script and configuration files, outside the
  `server` (Jest) and `backoffice` (Vitest) packages.
- **Command:**
  ```bash
  node --test test/monorepo-and-local-environment/setup-env.test.mjs \
                test/monorepo-and-local-environment/env-files.test.mjs \
                test/monorepo-and-local-environment/docs-and-compose.test.mjs
  ```
- **Result:** exit **0** — 6 tests, 6 passed, 0 failed, 0 skipped (7.1 s).
- **Location:** `test/monorepo-and-local-environment/` (feature folder per the placement rule).
- Every test name carries its AC ID (CON-405).

## 3. AC → test mapping

| AC     | Test     | File                                                                                                                                                                                    | Status   |
| ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-002 | TEST-001 | `docs-and-compose.test.mjs` — each of postgres/redis/mongo declares a `healthcheck` and a named volume                                                                                  | pass     |
| AC-003 | TEST-002 | `setup-env.test.mjs` — second run changes nothing, reports `0 created, 3 skipped`, exits 0                                                                                              | pass     |
| AC-004 | TEST-003 | `setup-env.test.mjs` — missing `.env` is created from its example; `created`/`skipped`/`missing example` reported; exit 0                                                               | pass     |
| AC-005 | TEST-004 | `env-files.test.mjs` — `git ls-files` shows no tracked `.env` and all three `.env.example` files tracked                                                                                | pass     |
| AC-006 | TEST-005 | `docs-and-compose.test.mjs` — README names the three services, `pnpm setup`, `docker compose up -d` and ports 3000/4000/5173; the retired `cp …` instructions are gone                  | pass     |
| AC-007 | TEST-006 | `env-files.test.mjs` — `server/.env.example` documents `DATABASE_URL`, `REDIS_URL`, `MONGO_URL`, `JWT_ACCESS_SECRET`, `COOKIE_SECURE`; no credential shapes; JWT value is a placeholder | pass     |
| AC-001 | —        | **untested** — requires a running Docker daemon                                                                                                                                         | deferred |

## 4. Withdrawn criteria

None (0 of 7). AC-001 is **not** withdrawn: cloning, bootstrapping and bringing the stack up is
plainly implementable — it simply cannot be executed on this host, where `docker ps` fails with
`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`.

## 5. Failures

| Test | Reason | Blocking |
| ---- | ------ | -------- |
| —    | none   | —        |

## 6. Notes

- **Coverage is 86 %, not 100 %.** AC-001 has no test, so this feature cannot pass
  `/sdrive:review` (C04 requires 100 %) until a Docker daemon is available and a test can drive
  `docker compose up -d` plus the three ports.
- `sdrive verify monorepo-and-local-environment` returns **FAIL** (matched 4, missing 6) because the
  scanner's roots are `server`, `backoffice`, `web` only; the six "missing" components are repo-root
  files that exist. Recorded in the implementation report; it will fail review criterion C15 until
  the scanner covers the repo root.
- No test asserts runtime health (NFR-003) or the five-minute target (NFR-001); both stay
  `in_progress` in `traceability.json`.
