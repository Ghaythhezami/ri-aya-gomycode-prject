# RI'AYA (رعاية)

Multilingual clinic and appointment platform: public marketing site, NestJS/Prisma authentication and tenancy API, and a staff backoffice for invitations, clinic settings, organization overview and workspace switching.

This repository currently ships **monorepo tooling**, **authentication**, the **marketing site**, and the **staff workspace controls** described below. Booking, patient and scheduling screens remain intentionally out of scope; the organization overview reads their aggregate counts.

## Apps

| App          | Stack                                 | Port          |
| ------------ | ------------------------------------- | ------------- |
| `web`        | Next.js 15, next-intl, Tailwind CSS 4 | 3000          |
| `server`     | NestJS 11, Prisma, PostgreSQL         | 4000 (`/api`) |
| `backoffice` | React 19, Vite, i18next               | 5174          |

Languages: English, Arabic (RTL), French.

## Quick start

**Prerequisites:** Node.js 20 LTS, pnpm 10, and a running Docker daemon. Nothing else.

```bash
pnpm install                # 1. dependencies
pnpm setup                  # 2. writes each package's .env from its .env.example
docker compose up -d        # 3. PostgreSQL, Redis and MongoDB
pnpm --filter server seed   # 4. local development users
pnpm dev                    # 5. web :3000, API :4000 (docs at /api/docs), backoffice :5174
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

## Invitations, settings, overview and workspace controls

- **Invitation lifecycle.** The staff directory shows every invitation with a single lifecycle label — `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED` or derived `EXPIRED` — plus the delivery outcome. A sender/admin can resend or cancel a pending invitation, and an invitee can decline from the accept page. Cancel/decline invalidate the token; the row is kept for the record.
- **Email delivery.** Invitations and password resets go through the `MAIL_SERVICE` transport. Production uses authenticated Mailtrap SMTP; the console transport remains for local/test. The SMTP keys are documented by name in `server/.env.example` and are never committed. A failed send leaves the invitation `PENDING` with a failed delivery outcome and a resend action — it is never presented as sent.
- **Clinic settings.** `/settings` has eight routed panels. Clinic information, working hours and roles/permissions are functional. Departments, appointments, reminders, audit log and appearance are clearly labelled placeholders and make no settings mutation. Working hours support per-day opening and breaks; invalid times and duplicate/overlapping breaks are rejected. Custom roles are editable definitions with a base role and a permission subset; assigning a custom role to a member is not part of v2, and built-in roles remain immutable.
- **Organization overview.** The overview page reads `GET /api/organizations/overview` and shows totals for every clinic in the caller's organization — clinics, staff, patients, today's appointments and upcoming appointments — plus one row per clinic. It never reads another organization's data.
- **Workspace switching.** The sidebar switcher lists the caller's memberships, marks the active clinic and offers a create-clinic dialog. Creating a clinic adds it to the active organization and switches to it. A switch validates the membership, issues a scoped access token and rotates the refresh cookie; the client proves the refresh before reloading, so a failed switch shows an error instead of sending the user to signup. The page header no longer repeats the active clinic name.

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
