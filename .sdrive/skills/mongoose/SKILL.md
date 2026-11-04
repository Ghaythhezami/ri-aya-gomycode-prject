---
name: mongoose
description: Use when adding or changing the MongoDB connection in realtime/ - MongooseModule wiring, readiness reporting, and the no-collection rule this project holds until chat and notifications exist.
package: mongoose
version-range: '^8.24.8'
source: custom (generated for this project, no upstream skill repo)
verified: false
---

# Mongoose in Ri-aya

Custom skill generated for this repository. It is not an upstream community skill: do not
overwrite it from a remote source, and update it here when a convention changes.

> **Unverified.** No upstream skill repository was fetched when this file was written, and the
> official documentation could not be retrieved in that session. Everything below that is not
> visible in this repository is stated as a rule for our code, not as a claim about the library's
> behaviour. Check <https://mongoosejs.com/docs/> before relying on a detail and correct this file
> in the same change. This is recorded as RISK-003 in the realtime-service spec.

## Versions and install

| Package            | Range               | Why                                                                             |
| ------------------ | ------------------- | ------------------------------------------------------------------------------- |
| `@nestjs/mongoose` | `^11.0.4`           | peers `@nestjs/common`/`core` 10 or 11; 12.x requires Nest 12                   |
| `mongoose`         | `^8.24.8`           | `@nestjs/mongoose@11` also allows mongoose 9; 8 is the conservative choice here |
| `ioredis`          | `not used by Mongo` | Mongo and Redis clients are separate; do not share them                         |

`@nestjs/mongoose@11.0.4` peers `mongoose ^7 || ^8 || ^9`. Do not install mongoose 9 casually: the
project has no Mongo code yet, so a major bump has nothing to fall back on.

## This project's rule: connect, do not model

`realtime/` connects to MongoDB to prove the connection and **declares no collection** (FR-012,
NFR-003). Concretely:

- `MongooseModule.forRootAsync(...)` with `uri` from `MONGO_URI`. No `forFeature(...)` call, no
  `@Schema()`, no `model(...)`. A single `@Schema()` here would create a collection and would also
  mean this service stores patient data, which the spec forbids.
- `server` uses Prisma against Postgres. `realtime` does not touch Postgres, does not import
  Prisma, and does not import from `server/src` at all (CON-106, NFR-004).
- When RT-2 or RT-3 adds a collection, it lands here behind its own spec version, with the
  tenancy rule applied: every document carries `clinicId` and every query filters on it.

## Startup and readiness

- Set a short `serverSelectionTimeoutMS` (2000 is enough locally). The default is 30 s, and a
  service that blocks its own bootstrap for 30 s on an unreachable Mongo will fail a container
  health check before it ever answers.
- Mongo being down must not stop the socket server from accepting connections (AC-016). Connect
  asynchronously: a failed connect is a readiness signal, not a boot failure.
- Report readiness from `mongoose.connection.readyState`: `1` is connected, anything else is not.
  Do not run a ping query per readiness probe - a health check that loads the database is a
  health check that fails under load.

## Injection rules

- No raw queries. `mongoose.connection.db.command(...)` and `.collection(...)` bypass the model
  layer and the tenancy filter, so they are out under CON-516 / NFR-015.
- No user input interpolated into a query object. In a later version, validate with Zod
  (CON-515) and pass a built object, never `JSON.parse` of a request body.
- Connection strings are secrets: environment only, never logged, never in `.env.example` with a
  working production value (CON-519, NFR-017).
