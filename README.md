# RI'AYA (رعاية)

Multilingual clinic and appointment platform starter: public landing page, NestJS authentication API, and staff backoffice.

This repository currently ships **monorepo tooling**, **authentication**, and the **marketing site**. Appointments, patients, and scheduling modules are intentionally out of scope.

## Apps

| App          | Stack                                 | Port          |
| ------------ | ------------------------------------- | ------------- |
| `web`        | Next.js 15, next-intl, Tailwind CSS 4 | 3000          |
| `server`     | NestJS 11, TypeORM, PostgreSQL        | 4000 (`/api`) |
| `backoffice` | React 19, Vite, i18next               | 5173          |

Languages: English, Arabic (RTL), French.

## Quick start

**Prerequisites:** Node.js 20 LTS, pnpm 10, and a running Docker daemon. Nothing else.

```bash
pnpm install                # 1. dependencies
pnpm setup                  # 2. writes each package's .env from its .env.example
docker compose up -d        # 3. PostgreSQL, Redis and MongoDB
pnpm --filter server seed   # 4. local development users
pnpm dev                    # 5. web :3000, API :4000 (docs at /api/docs), backoffice :5173
```

`pnpm setup` copies examples only where `.env` is missing, so it is safe to re-run: it reports
`created`, `skipped` or `missing example` per package and never overwrites your settings. If your
`server/.env` predates a key that now exists in `server/.env.example` — `MONGO_URL`, for example —
add that key by hand; the script deliberately leaves your file alone.

`REDIS_URL` is required in `server/.env` (see `server/.env.example`). Redis holds the
login-attempt counter and the revoked-refresh-token list; when it is unreachable, security
paths fail closed while ordinary reads keep serving from PostgreSQL.

### Backing services

| Service    | Image                | Port  | Volume            | Used by                                  |
| ---------- | -------------------- | ----- | ----------------- | ---------------------------------------- |
| PostgreSQL | `postgres:16-alpine` | 5432  | `riaya_pgdata`    | Prisma / all application data            |
| Redis      | `redis:7-alpine`     | 6379  | `riaya_redisdata` | lockout counters, revoked refresh tokens |
| MongoDB    | `mongo:7`            | 27017 | `riaya_mongodata` | reserved for the realtime wave (BP-031)  |

All three declare healthchecks, so `docker compose ps` shows `healthy` rather than merely
`running`; they normally reach that state within a minute.

### Troubleshooting

| Symptom                                                               | Cause                                              | Fix                                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Cannot connect to the Docker daemon`                                 | Docker is not running                              | Start Docker Desktop, then re-run `docker compose up -d`                                                             |
| `bind: address already in use` for 5432, 6379 or 27017                | Another Postgres/Redis/Mongo already uses the port | Stop that service, or change the published port in `docker-compose.yml` and the matching URL in the package's `.env` |
| `pnpm setup` prints `skipped` but a key is missing                    | The `.env` was created before that key was added   | Copy the missing key from the same package's `.env.example` (see the note above)                                     |
| `pnpm setup` prints `missing example`                                 | That package has no `.env.example`                 | Add one; the other packages were still prepared                                                                      |
| API starts but security paths return `503 SECURITY_STATE_UNAVAILABLE` | Redis is not reachable                             | `docker compose up -d redis` and confirm `healthy`                                                                   |

Then open:

- Landing page: http://localhost:3000
- API docs: http://localhost:4000/api/docs
- Backoffice: http://localhost:5173

## Development accounts (local only)

| Role         | Email                      | Password             |
| ------------ | -------------------------- | -------------------- |
| Super admin  | `admin@riaya.local`        | `RiayaAdmin123!`     |
| Clinic admin | `clinic.admin@riaya.local` | `RiayaClinic123!`    |
| Doctor       | `doctor@riaya.local`       | `RiayaDoctor123!`    |
| Receptionist | `receptionist@riaya.local` | `RiayaReception123!` |

## Registration, invitations and workspaces

- **Public self-service registration** lives at `/register` → `POST /api/auth/register`. One
  transaction creates the identity, the organization, the first clinic and a `SUPER_ADMIN`
  membership, then signs the new owner in and places them in that clinic's workspace. There is
  no pending or awaiting-approval state at any point.
- **Staff never self-register into an existing clinic.** A `CLINIC_ADMIN` or `SUPER_ADMIN` invites
  them by email (`POST /api/invitations`); the invitee sets their own password via `/accept-invite`.
  Invitation tokens are single-use, stored hashed, and expire.
- **One identity, many clinics.** A user holds a different role per clinic.
  `POST /api/auth/switch-workspace` re-issues an access token scoped to the chosen clinic, and
  every request resolves its tenant scope from that token — never from a request body or query string.
- **The legacy `/signup` path is retired:** it answers `410 Gone` with code `SIGNUP_RETIRED`,
  points at `/register`, and creates no identity.
- **Audit trail:** creates, updates and deletes on audited entities write an append-only audit row
  in the same transaction as the change it describes.

The seeded accounts above are for local development only; they sign in at `/login`.

## Scripts

```bash
pnpm dev
pnpm dev:web
pnpm dev:server
pnpm dev:backoffice
pnpm lint
pnpm test
pnpm build
pnpm typecheck
```

## Auth notes

- Access tokens live **15 minutes** and are returned in the JSON body.
- Refresh tokens live **7 days** in an HttpOnly `SameSite=Lax` cookie (`Secure` in production).
- The backoffice keeps the access token **in memory** and silently calls `/api/auth/refresh` after reload or a 401.
- Five failed logins within 10 minutes lock the account for 15 minutes. Login always returns a generic “Invalid credentials” message.
- Reusing a rotated refresh token revokes the entire token family.
- Lockout counters and revoked tokens live in **Redis** with TTLs, so they survive an API restart
  and are shared across instances. If Redis is unavailable, login fails closed
  (`503 SECURITY_STATE_UNAVAILABLE`) instead of allowing unlimited attempts, while ordinary reads
  keep serving from PostgreSQL.
- `pnpm --filter server test` runs under `NODE_ENV=test` with an in-memory cache double. The
  Redis-only lockout-persistence test (AC-009) needs a live Redis:
  ```bash
  $env:REDIS_URL='redis://localhost:6379'; $env:LOCKOUT_INTEGRATION='1'
  pnpm --filter server exec jest lockout-persistence --runInBand
  ```

## Design system (temporary)

The backoffice includes `/design-system` and reusable primitives in `backoffice/src/common` (buttons, modal, table, charts). The marketing site does not reuse those components.

## License

Private starter for RI'AYA.
