---
title: Technical Plan — Monorepo and local environment (v1)
status: backlog
created: 2026-10-31
updated: 2026-10-31
---

# Technical Plan — Monorepo and Local Environment (v1)

**Feature:** `monorepo-and-local-environment` · **Version:** v1 · **Branch:** `feature/BP-001`
**Product item:** BP-001

## 1. Approach

The stack already works; what is missing is **coverage and one entry point**. So this plan adds one
service, one script, one configuration key and one document — it does not restructure the monorepo.

Three deliberate decisions:

1. **MongoDB is declared now, consumed later.** BP-031 needs it, and declaring the service here
   means that wave inherits a working compose file instead of discovering a gap. No application code
   is written against it in this version, which is why no entity or API appears in the data model.
2. **The bootstrap is a Node script, not shell.** The repo is cross-platform (Windows is a first-class
   developer environment here), and Node 20 is already a documented prerequisite. A `.mjs` script
   with `node:fs` avoids a second toolchain and keeps the idempotency logic testable.
3. **`.env.example` stays the single source.** The bootstrap copies examples; it never synthesises
   values. Nothing secret enters the repository (CON-519).

## 2. Components

| Component                                     | Action     | Notes                                                                                                                                                      |
| --------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.yml`                          | **modify** | Add a `mongo` service beside the existing `postgres` and `redis`: `mongo:7`, healthcheck, named volume `riaya_mongodata`. Existing services are untouched. |
| `scripts/setup-env.mjs`                       | **create** | For each package, copy `<pkg>/.env.example` → `<pkg>/.env` only when the target is absent; report `created` / `skipped` / `missing example`; exit 0.       |
| `package.json` (root)                         | **modify** | Add `"setup": "node scripts/setup-env.mjs"` beside the existing scripts.                                                                                   |
| `server/.env.example`                         | **modify** | Add the MongoDB connection key next to `REDIS_URL`, with a local default and no real secret.                                                               |
| `README.md`                                   | **modify** | Rewrite the quick start around `pnpm setup`; add a troubleshooting block for the default ports and the Docker prerequisite.                                |
| `.gitignore`                                  | **reuse**  | Already ignores `.env`; verified, not changed.                                                                                                             |
| `web/.env.example`, `backoffice/.env.example` | **reuse**  | Already exist; the bootstrap consumes them as-is.                                                                                                          |

## 3. Data model

**No schema change.** `prisma/schema.prisma` is not touched. The MongoDB service stores nothing in
this version; its collections are BP-031's concern.

Flow: `pnpm install` → `pnpm setup` (env files) → `docker compose up -d` (three services reach
healthy) → `pnpm dev` (web 3000, api 4000, backoffice 5173).

## 4. API contracts

None. This feature adds no endpoint and changes no request or response shape.

## 5. Security

- **NFR-002 / CON-519, CON-504, CON-505:** only `.env.example` files are committed. The bootstrap
  writes `.env` files that `.gitignore` already excludes, and it copies example values verbatim —
  it never generates or stores a credential.
- **CON-502/503:** the feature reads `.env.example` only; no `.env` is opened by the tooling.
- Every other CON-51x control is `NOT APPLICABLE` with its rationale recorded in `spec.md` §6,
  because this version introduces no authentication, input handling or HTTP surface.

## 6. Performance / operational targets

- **NFR-001:** the measured fresh-clone run (warm image cache) is recorded as evidence; if it exceeds
  five minutes, the README claim is corrected rather than the measurement.
- **NFR-003:** all three services report healthy within 60 s of `docker compose up -d`; each has a
  healthcheck, so "healthy" is a real signal rather than "container started".

## 7. Dependencies

| Dependency        | Type     | Action    | Notes                                                        |
| ----------------- | -------- | --------- | ------------------------------------------------------------ |
| MongoDB 7         | service  | add       | Compose service; no client library is added in this version. |
| Docker Compose    | service  | no_change | Already required by postgres and redis.                      |
| Node.js `node:fs` | internal | no_change | A built-in, not a package; the bootstrap adds no dependency. |

## 8. Risks

| Risk                                                                 | Mitigation                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Developers with an existing `server/.env` never receive `MONGO_URL`. | The bootstrap reports skipped files, and the README names the key to add by hand (EC-003). |
| A third container makes `up` feel slower.                            | Healthchecks and the documented 60-second expectation (NFR-003).                           |
| The five-minute claim drifts into marketing.                         | NFR-001 records one timed run; the README is corrected if the measurement disagrees.       |

## 9. Out of scope

Deployment and IaC (BP-040), the realtime runtime and its Mongo schema (BP-031), any code reading
MongoDB, production secret management, and changes to the Prisma schema or migrations.

## 10. Test ownership

No phase in `tasks.md` writes or runs tests. Acceptance-criterion tests belong to `/sdrive:test`,
which allocates the `TEST-###` IDs in `traceability.json`. This plan produces production code and
documentation only.

<!-- plan:version v1 -->
