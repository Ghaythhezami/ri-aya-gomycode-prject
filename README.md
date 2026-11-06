# RI'AYA (رعاية)

Multilingual (English, Arabic RTL, French) clinic operations platform: appointments, doctors and
availability, patients, a live waiting-room queue, conflict-safe booking, deterministic smart
scheduling, analytics and reports, notifications, settings, audit trail and staff chat.

Built on the MediFlow brief and the team's Ri'aya feature document. Every record is fictional.

## What is in the box

| Area             | Highlights                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booking          | 5-step wizard (patient → doctor → date & time → details → review), Redis/in-memory slot lock (5 min TTL), SERIALIZABLE transaction + `appointments_no_overlap` exclusion constraint, 409 with up to 3 alternative slots, session-kept draft                     |
| Appointments     | List with URL-synced filters, bulk confirm/cancel, state machine (409 on illegal transitions), cancellation policy, reminders (mock SMS/email, retry on failure), Day / Week / Month calendar                                                                   |
| Doctors          | Cards and table, utilisation %, weekly working hours with breaks, leave, conflict list before saving hours, deactivate → future bookings flagged                                                                                                                |
| Patients         | Search (name, ID, phone), duplicate detection, archive, profile tabs, clinical notes hidden from receptionists (UI and API 403)                                                                                                                                 |
| Queue            | Check-in (desk or **QR self check-in**), priority triage Normal / Urgent / Emergency, race-safe "call next" (`FOR UPDATE SKIP LOCKED`), over-target highlighting, public display `/display/:clinicId` with numbers only                                         |
| Smart scheduling | Metrics (utilisation, idle gaps, estimated wait — see `docs/scheduling-metrics.md`), greedy local-search optimiser (minimise wait / reduce gaps / balance load), preview, atomic apply with stale check, undo within 15 min, drag and drop with live validation |
| Analytics        | Dashboard KPIs and 4 charts, reports with period comparison, clinic or organisation scope, streamed CSV (UTF-8 BOM) and server-rendered PDF                                                                                                                     |
| Platform         | JWT access (15 min) + rotating HttpOnly refresh (7 d), lockout after 5 failures, RBAC from one capability matrix, strict tenant isolation, append-only audit log, Accept-Language error messages                                                                |

## Apps

| App               | Stack                                             | Port          |
| ----------------- | ------------------------------------------------- | ------------- |
| `web`             | Next.js 15, next-intl, Tailwind CSS 4 (marketing) | 3000          |
| `server`          | NestJS 11, Prisma 6, PostgreSQL 16, Redis 7       | 4000 (`/api`) |
| `backoffice`      | React 19, Vite 6, RTK Query, i18next, Recharts    | 5174          |
| `realtime`        | NestJS + Socket.IO, MongoDB 7, Redis adapter      | 4001          |
| `packages/shared` | Contracts, capability matrix, localised errors    | –             |

Architecture and hosting decisions: `docs/adr/`. API contract: `docs/API-CONTRACT.md` and Swagger
at `/api/docs`.

## Hosted demo

- Landing and workspace (`/app`): see the repository description for the live URL; logins below
- The demo database is re-seeded daily so "today" always has a live schedule (ADR 0001).

## Quick start

**Prerequisites:** Node.js 20 LTS, pnpm 10, and a running Docker daemon. Nothing else.

```bash
pnpm install                # 1. dependencies
pnpm run setup              # 2. writes each package's .env from its .env.example (`pnpm setup` is a pnpm built-in)
docker compose up -d        # 3. PostgreSQL, Redis and MongoDB
pnpm --filter server exec prisma migrate deploy   # 4. schema
pnpm --filter server seed   # 5. fictional demo data: 3 clinics, 10 doctors, 200 patients, ~700 appointments
pnpm dev                    # 6. web :3000, API :4000 (docs at /api/docs), backoffice :5174
```

`pnpm run setup` copies examples only where `.env` is missing, so it is safe to re-run: it reports
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
| `pnpm run setup` prints `skipped` but a key is missing                | The `.env` was created before that key was added   | Copy the missing key from the same package's `.env.example` (see the note above)                                     |
| `pnpm run setup` prints `missing example`                             | That package has no `.env.example`                 | Add one; the other packages were still prepared                                                                      |
| API starts but security paths return `503 SECURITY_STATE_UNAVAILABLE` | Redis is not reachable                             | `docker compose up -d redis` and confirm `healthy`                                                                   |

Then open:

- Landing page: http://localhost:3000
- API docs: http://localhost:4000/api/docs
- Backoffice: http://localhost:5174

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

## Design system

Tokens live in `backoffice/src/index.css` / `design-system/tokens.ts` (kept equal by a check script); primitives in `backoffice/src/common`, feature building blocks in `backoffice/src/features/shared`. `pnpm --filter backoffice build` fails on colour literals, physical-direction utilities (RTL) or missing translation keys.

## License

Private starter for RI'AYA.
