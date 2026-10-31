---
title: Monorepo and local environment
status: backlog
created: 2026-10-31
updated: 2026-10-31
---

# Monorepo and Local Environment (BP-001)

> **Product item:** `BP-001` · Milestone M1 — Foundation & shell · Priority P0 · Brief task FND-1
> **Branch / base:** `feature/BP-001` / `main`

## 1. Overview

### Problem

A new developer cannot get from `git clone` to a running stack in the five minutes BP-001
promises, and the backing services the plan depends on are incomplete:

- `docker-compose.yml` declares **Postgres and Redis only**. The Product Plan's realtime wave
  (BP-031 realtime service, BP-032 staff chat, BP-033 notification centre) requires **MongoDB**,
  so that wave currently has no service to connect to and would fail at runtime, not at design time.
- Environment setup is **three manual `cp` commands** copied out of the README. Skipping one is
  silent until the first request fails with a connection error that does not name the cause.
- `server/.env.example` documents no MongoDB key, so even a careful developer has nothing to fill in.

The backlog row for this item is stale in one respect: it says compose has "Postgres only — no
Redis/Mongo". Redis was added with the authentication feature; the real gap is Mongo plus the
bootstrap.

### Proposed solution

1. Add a health-checked **MongoDB** service with a named volume, alongside the existing Postgres
   and Redis services, so all three services the plan needs are declared in one place.
2. Add **one idempotent bootstrap script** at the repo root that creates each package's `.env`
   from its `.env.example` **only when missing**, and reports what it created and skipped.
3. Extend `server/.env.example` with the MongoDB connection key so configuration is complete and
   carries no real values (CON-519).
4. Rewrite the README quick start so the documented path is the working path: prerequisites, the
   bootstrap command, `docker compose up -d`, and the three ports.

### Target audience

- **A new developer** cloning the repository for the first time, on a machine with Node 20, pnpm 10
  and Docker.
- **The maintainers** who add services later and need the compose file, env examples and README to
  stay in agreement.
- **CI**, which installs and builds but must never receive a real secret from the repository.

### Assumptions

- MongoDB is required by the Product Plan (BP-031/BP-032/BP-033) even though no current application
  code connects to it. The service is declared now so that wave is not blocked later.
- "Under five minutes" is measured on the documented prerequisites (Node 20 LTS, pnpm 10, Docker
  Desktop), from a warm image cache; the first image download is excluded and stated as such.
- Local development credentials stay the committed non-secret defaults already in
  `docker-compose.yml` and `.env.example`; this feature adds no secret.
- The three packages keep their own `.env`; no shared root `.env` is introduced.
- `pnpm install` already runs from the root; the bootstrap runs after it.

### Out of scope

- Deployment, infrastructure-as-code and CD pipelines (BP-040).
- A second NestJS runtime for realtime work and its Mongo schema (BP-031).
- Any application code that reads MongoDB — this feature only makes the service available.
- Production secret management (vault, SOPS, cloud parameters).
- Changing the existing Prisma schema or migrations.

## 2. User stories

### US-001 — Clone to running stack in one path

**As a** developer new to the project, **I want** one documented command that prepares my
environment, **so that** I can start working instead of debugging setup.

| AC     | Criterion                                                                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-001 | Given a fresh clone, when I run the documented bootstrap and `docker compose up -d`, then Postgres, Redis and MongoDB all report healthy and `pnpm dev` serves web on 3000, the API on 4000 and the backoffice on 5173. |

### US-002 — Every service the plan needs is declared

**As a** maintainer, **I want** every backing service declared and health-checked in compose, **so
that** a later feature cannot discover a missing dependency at runtime.

| AC     | Criterion                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-002 | Given the compose file, when I inspect the services, then Postgres, Redis and MongoDB each declare a healthcheck and persist to a named volume. |

### US-003 — Setup is idempotent and never clobbers my work

**As a** developer, **I want** the bootstrap to leave my existing configuration alone, **so that**
re-running it after a pull never destroys local settings.

| AC     | Criterion                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-003 | Given every `.env` already exists, when the bootstrap runs again, then each file is byte-identical afterwards and the script exits 0.                                |
| AC-004 | Given one package has no `.env`, when the bootstrap runs, then it creates that file from its `.env.example` and reports which files it created and which it skipped. |

### US-004 — Configuration is complete and safe to commit

**As a** maintainer, **I want** the documented configuration to match what the code reads and to
contain no secrets, **so that** the repository stays safe to share.

| AC     | Criterion                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-005 | Given a clone, when I run `git ls-files`, then no `.env` is tracked and every `.env.example` is.                                                                                 |
| AC-006 | Given the README quick start, when I follow it verbatim, then it names all three services, the bootstrap command and the three ports, with no undocumented manual step.          |
| AC-007 | Given `server/.env.example`, when I compare it with the keys the server reads, then every key is present — including the MongoDB connection — and no value is a real credential. |

## 3. Functional requirements

- **FR-001:** `docker-compose.yml` MUST declare a MongoDB service (`mongo:7`) with a healthcheck and a named volume, alongside the existing `postgres` and `redis` services. (AC-002)
- **FR-002:** A root package script MUST create each package's `.env` from that package's `.env.example` when, and only when, the `.env` is missing. (AC-001, AC-003, AC-004)
- **FR-003:** The bootstrap MUST NOT modify an existing `.env`, and MUST report every file it created and every file it skipped. (AC-003, AC-004)
- **FR-004:** The README quick start MUST document the prerequisites, the bootstrap command, `docker compose up -d`, and the three ports, in the order that actually works. (AC-001, AC-006)
- **FR-005:** `server/.env.example` MUST document the MongoDB connection key consumed by server configuration. (AC-007)
- **FR-006:** `.gitignore` MUST continue to ignore every `.env` file while keeping each `.env.example` tracked. (AC-005)

## 4. Non-functional requirements

- **NFR-001 (CON-519):** A fresh clone MUST reach a running stack within 5 minutes on the documented prerequisites, excluding the first Docker image download; the measured run and its timing MUST be recorded with the evidence. (AC-001)
- **NFR-002 (CON-519, CON-504, CON-505):** Only `.env.example` files MAY be committed; no real secret, token or password may appear in any committed file. (AC-005, AC-007)
- **NFR-003:** All compose services MUST report healthy within 60 seconds of `docker compose up -d` on a machine meeting the prerequisites. (AC-002)
- **NFR-004:** The bootstrap MUST be idempotent: running it any number of times leaves the working tree unchanged after the first run. (AC-003)

## 5. Edge cases

| ID     | Case                                            | Expected behaviour                                                                                              |
| ------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| EC-001 | Docker daemon is not running                    | The documented step fails with a message naming Docker as the prerequisite; the README states the check.        |
| EC-002 | Port 5432, 6379 or 27017 already in use         | The compose error is reported as-is and the README troubleshooting section names the conflicting default ports. |
| EC-003 | An existing `.env` predates the new MongoDB key | The bootstrap does not touch it; the README tells the developer which key to add by hand.                       |
| EC-004 | A `.env.example` is missing for one package     | The bootstrap reports the missing example and continues with the others instead of failing silently.            |

## 6. Security Baseline

Read from `.sdrive/constitution.md` §Security Baseline (CON-51x). This feature adds a backing
service and local configuration; it introduces **no** authentication, user input or HTTP surface,
so most controls are `NOT APPLICABLE` here **by design** and are recorded rather than skipped.

| Control                           | Status         | Rationale for this feature                                                                                                                                                    |
| --------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-511 Authentication            | NOT APPLICABLE | No identity or token handling is added or changed.                                                                                                                            |
| CON-512 Authorization             | NOT APPLICABLE | No routes, roles or guards are added or changed.                                                                                                                              |
| CON-513 Security Headers (Helmet) | NOT APPLICABLE | No HTTP response path changes; `main.ts` is untouched.                                                                                                                        |
| CON-514 Rate Limiting             | NOT APPLICABLE | No new endpoint; throttling configuration is unchanged.                                                                                                                       |
| CON-515 Input Validation          | NOT APPLICABLE | No request DTO or endpoint is added.                                                                                                                                          |
| CON-516 NoSQL / Injection         | NOT APPLICABLE | The Mongo service is declared but no query code is written by this feature.                                                                                                   |
| CON-517 XSS                       | NOT APPLICABLE | No UI renders user content.                                                                                                                                                   |
| CON-518 CSRF                      | NOT APPLICABLE | No state-changing route is added or modified.                                                                                                                                 |
| CON-519 Environment Security      | **REQUIRED**   | This feature owns the env examples: new keys MUST be documented in `.env.example` only, never in `.env`, and no real value may be committed. Expanded as NFR-001 and NFR-002. |
| CON-520 HTTPS / HSTS              | NOT APPLICABLE | No transport or cookie configuration changes.                                                                                                                                 |

## 7. Dependencies

| Name           | Type    | Notes                                                                                          |
| -------------- | ------- | ---------------------------------------------------------------------------------------------- |
| MongoDB 7      | service | New compose service. Required by BP-031 (realtime) and BP-032/BP-033; no code consumes it yet. |
| Docker Compose | service | Already required by the existing Postgres and Redis services.                                  |

## 8. Risks

| ID       | Risk                                                                           | Mitigation                                                                                                                           |
| -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| RISK-001 | A third container slows local startup and invites "works on my machine" drift. | Healthchecks for all services and a documented 60-second expectation (NFR-003).                                                      |
| RISK-002 | Developers with an existing `server/.env` never receive the new MongoDB key.   | EC-003 documents the manual key addition in the README; the bootstrap reports skipped files so the gap is visible.                   |
| RISK-003 | The five-minute claim is asserted, not measured.                               | NFR-001 requires one recorded, timed run as evidence; if it fails, the claim is corrected in the README rather than the measurement. |

## 9. Research note

No external research was required: every element reuses a pattern already present in this
repository — the existing compose healthchecks and volumes, the `.env.example` + `.gitignore`
policy in CON-519, and the root script convention in `package.json`. MongoDB's official image
healthcheck (`mongosh --eval "db.adminCommand('ping')"`) is the only new external detail and is
cited from the MongoDB Docker documentation at implementation time.
