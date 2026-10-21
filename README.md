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

1. **Start PostgreSQL**
   ```bash
   docker compose up -d
   ```
2. **Install dependencies**
   ```bash
   pnpm install
   ```
3. **Configure environment**
   ```bash
   cp server/.env.example server/.env
   cp web/.env.example web/.env
   cp backoffice/.env.example backoffice/.env
   ```
4. **Seed development users**
   ```bash
   pnpm --filter server seed
   ```
5. **Run all apps**
   ```bash
   pnpm dev
   ```

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

There is no public self-registration. Staff accounts are created by admins (`POST /api/users`).

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

## Design system (temporary)

The backoffice includes `/design-system` and reusable primitives in `backoffice/src/common` (buttons, modal, table, charts). The marketing site does not reuse those components.

## License

Private starter for RI'AYA.
