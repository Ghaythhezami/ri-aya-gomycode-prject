# Implementation Report — Monorepo and Local Environment (v1)

- **Feature / version:** `monorepo-and-local-environment` / v1
- **Product item:** BP-001 · **Branch:** `feature/BP-001` · **Base:** `main`
- **Date:** 2026-10-31 · **Commit:** `80ceabf`
- **Agent:** `/sdrive:apply`

## 1. What changed

| Task | File                    | Change                                                                                                                                                                                                                                             |
| ---- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1.1 | `docker-compose.yml`    | New `mongo` service (`mongo:7`, port 27017, healthcheck via `mongosh … db.adminCommand('ping').ok`, named volume `riaya_mongodata`). `postgres` and `redis` untouched.                                                                             |
| T2.1 | `scripts/setup-env.mjs` | New idempotent bootstrap: copies `<pkg>/.env.example` → `<pkg>/.env` only when `.env` is absent; prints `created` / `skipped` / `missing example` per package; always exits 0.                                                                     |
| T2.2 | `package.json`          | `"setup": "node scripts/setup-env.mjs"` added; no existing script renamed or reordered.                                                                                                                                                            |
| T2.3 | `server/.env.example`   | `MONGO_URL=mongodb://localhost:27017/riaya` documented beside `REDIS_URL`; no real credential. `.gitignore` verified (`.env` ignored, `!.env.example` tracked) — unchanged.                                                                        |
| T3.1 | `README.md`             | Quick start rewritten around `pnpm setup`, with prerequisites, a backing-services table (Postgres/Redis/Mongo with ports and volumes) and a troubleshooting table (Docker down, ports in use, skipped `.env`, missing example, Redis unavailable). |

Lifecycle: spec moved `specs/backlog/` → `specs/ongoing/`; version `phase: ongoing`.

## 2. Evidence

### T3.2 — idempotency (verified)

```
run 1: created web/.env, created backoffice/.env, skipped server/.env   → 2 created, 1 skipped
run 2: skipped server/.env, skipped web/.env, skipped backoffice/.env   → 0 created, 3 skipped
```

Satisfies AC-003 (existing files untouched, exit 0) and AC-004 (created files reported).

### T3.2 — Docker-dependent half (DEFERRED)

`docker ps` fails with `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`
— no daemon is running on this host. Therefore **not measured**:

- compose health for the three services (AC-002, NFR-003)
- a timed fresh-clone run for the five-minute target (NFR-001, AC-001)

Recorded as a `resolution: deferred` on T3.2 in `tasks.json` with the reason. The criteria were
**not withdrawn**: they are implementable, only unmeasurable here.

### T3.3 — verification gates

| Gate                                           | Result                                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                    | **exit 0** (web carries 2 pre-existing Next warnings)                                                                                                                                                               |
| `pnpm typecheck`                               | **exit 0**, Done × 3                                                                                                                                                                                                |
| `prettier --check` on this feature's files     | **pass** — "All matched files use Prettier code style!"                                                                                                                                                             |
| `pnpm format:check` (repo-wide)                | **fails, pre-existing** — prettier cannot parse a `.sdrive/templates/*` JSON containing `{{featureName}}` placeholders, and framework markdown under `.sdrive/` is unformatted. Neither is touched by this feature. |
| `node .sdrive/scripts/validate-governance.js`  | **exit 0**, all files valid                                                                                                                                                                                         |
| `sdrive verify monorepo-and-local-environment` | **FAIL** — see §3                                                                                                                                                                                                   |

## 3. `sdrive verify` failure — diagnosis

```
Matched: 4   Missing: 6   Renamed: 1   Extra: 36   Status: FAIL
Missing: [component] scripts/setup-env.mjs, package.json, README.md, .gitignore,
         web/.env.example, backoffice/.env.example
```

Every listed file **exists**. `verify.js` scans only its configured source roots
(`server`, `backoffice`, `web` — see the customisation note in `CONTRIBUTING.md`), so root-level
paths (`package.json`, `README.md`, `.gitignore`, `scripts/`, `*/​.env.example`) can never match.

This is a **tool limitation, not a missing deliverable**. Fixing it means extending the scanner's
roots to the repo root, which is outside this feature's tasks (strict-scope rule). It is recorded
here rather than worked around by rewriting `plan.json` to suit the tool.

**Consequence:** `/sdrive:review` requires `sdrive verify` to return `pass` or `warn` (C15). Until
the scanner covers the repo root, this feature will fail C15 on those six root-level components.

## 4. Not done here

- No tests were written or run — that is `/sdrive:test`.
- No merge and no archive — that is `/sdrive:archive`.
- The five-minute claim in the README is **unverified** until T3.2's timed run is possible.
