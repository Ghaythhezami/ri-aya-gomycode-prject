---
title: Execution Tasks â€” Monorepo and local environment (v1)
status: backlog
created: 2026-10-31
updated: 2026-10-31
---

# Execution Tasks â€” Monorepo and Local Environment (v1)

**Feature:** `monorepo-and-local-environment` Â· **Version:** v1 Â· **Branch:** `feature/BP-001`

No task in this file writes or runs a test. Tests for the acceptance criteria are authored and run by
`/sdrive:test`, which fills the `TEST-###` IDs in `traceability.json`.

## P1 â€” Compose services

| ID   | Task                                                                                                                                                                                                                    | Requirements    | Acceptance criteria | Done? |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------- | ----- |
| T1.1 | Add the `mongo` service to `docker-compose.yml`: `mongo:7-alpine`, port 27017, healthcheck via `mongosh --eval "db.adminCommand('ping')"`, named volume `riaya_mongodata`. Leave `postgres` and `redis` byte-identical. | FR-001, NFR-003 | AC-002              | [x]   |

## P2 â€” Environment bootstrap and configuration

| ID   | Task                                                                                                                                                                                                                                                                  | Requirements            | Acceptance criteria | Done? |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------- | ----- |
| T2.1 | Create `scripts/setup-env.mjs`: for `server`, `web`, `backoffice`, copy `.env.example` â†’ `.env` only when `.env` is absent; print one line per package (`created`, `skipped`, `missing example`); exit 0 even when a later package is missing its example (EC-004). | FR-002, FR-003, NFR-004 | AC-003, AC-004      | [x]   |
| T2.2 | Add `"setup": "node scripts/setup-env.mjs"` to the root `package.json` scripts, next to the existing entries, without reordering or renaming anything.                                                                                                                | FR-002                  | AC-001, AC-004      | [x]   |
| T2.3 | Document the MongoDB key in `server/.env.example` beside `REDIS_URL` (local default `mongodb://localhost:27017/riaya`, no real credential) and confirm `.gitignore` still covers `.env` while `.env.example` stays tracked.                                           | FR-005, FR-006, NFR-002 | AC-005, AC-007      | [x]   |

## P3 â€” Documentation and verification

| ID   | Task                                                                                                                                                                                                                                                                                                                                               | Requirements                      | Acceptance criteria    | Done?                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------- | ---------------------------------------- |
| T3.1 | Rewrite the README quick start: prerequisites (Node 20, pnpm 10, Docker running), `pnpm install`, `pnpm setup`, `docker compose up -d`, `pnpm dev`, the three ports, and a troubleshooting block for the default ports (5432/6379/27017) and the Docker prerequisite. Add a note that an existing `.env` needs `MONGO_URL` added by hand (EC-003). | FR-004                            | AC-001, AC-006         | [x]                                      |
| T3.2 | Record the evidence by hand: run `pnpm setup` twice and confirm the second run changes nothing and reports `skipped` for all three packages; bring the stack up and confirm all three services report healthy; time a fresh-clone run for NFR-001 and record the result in the implementation report.                                              | NFR-001, NFR-003, NFR-004, FR-006 | AC-001, AC-002, AC-003 | [ ] deferred — Docker daemon unavailable |
| T3.3 | Run the verification gates: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `sdrive verify monorepo-and-local-environment`, and `node .sdrive/scripts/validate-governance.js`.                                                                                                                                                                 | â€”                               | â€”                    | [x]                                      |
