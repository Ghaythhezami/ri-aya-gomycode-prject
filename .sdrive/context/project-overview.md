# Project Overview Context

<!-- source: repository discovery, 2026-10-27 -->

## Observed Project Facts

### Identity

- **Product name:** RI'AYA (رعاية) — multilingual clinic and appointment management platform.
- **Repository purpose (from `README.md`):** "Multilingual clinic and appointment platform starter: public landing page, NestJS authentication API, and staff backoffice."
- **Explicit scope boundary (from `README.md`):** "This repository currently ships **monorepo tooling**, **authentication**, and the **marketing site**. Appointments, patients, and scheduling modules are intentionally out of scope."
- **License:** Private starter for RI'AYA.
- **Root `package.json`:** `name: riaya`, `private: true`, `version: 0.1.0`, `packageManager: pnpm@10.11.0`, `engines.node: >=20`.
- **Node pin:** `.nvmrc` = `20`. Observed runtime on the dev machine was Node v24.20.0.

### Applications

| App          | Location      | Stack                                                                     | Dev port      | Build tool              |
| ------------ | ------------- | ------------------------------------------------------------------------- | ------------- | ----------------------- |
| `web`        | `web/`        | Next.js 15, React 19, next-intl, Tailwind CSS 4                           | 3000          | Next.js                 |
| `server`     | `server/`     | NestJS 11, Prisma 6, PostgreSQL, ioredis                                  | 4000 (`/api`) | Nest CLI (`nest build`) |
| `backoffice` | `backoffice/` | React 19, Vite 6, Redux Toolkit, react-hook-form + Zod, i18next, recharts | 5173          | Vite                    |

### Workspace definitions

- `pnpm-workspace.yaml` packages: `web`, `server`, `backoffice`.
- Root orchestration via `concurrently`:
  `pnpm dev` runs `pnpm --filter web dev`, `pnpm --filter server start:dev`, `pnpm --filter backoffice dev`.
- Root aggregate scripts (each uses `-r --if-present`): `build`, `lint`, `test`, `typecheck`.
- `seed` → `pnpm --filter server seed`.

### Localisation

- Supported locales: **English (`en`), Arabic (`ar`, RTL), French (`fr`)**.
- Message catalogues exist in `web/messages/{en,ar,fr}.json` and `backoffice/src/i18n/{en,ar,fr}.json`.
- `web/src/app/[locale]/` is a locale-segmented App Router tree; `web/src/app/robots.ts` and `sitemap.ts` exist for SEO.
- Server `PreferredLocale` enum: `en | ar | fr`; `User.preferredLocale` defaults to `en`.

### Design system

- `README.md`: "The backoffice includes `/design-system` and reusable primitives in `backoffice/src/common` (buttons, modal, table, charts). The marketing site does not reuse those components."
- Corresponding pages exist: `backoffice/src/pages/DesignSystemPage.tsx`, `PublicUiPage.tsx`.

### Test posture

- `server`: Jest with coverage thresholds; 3 colocated specs exist (`auth/auth.e2e.spec.ts`, `cache/redis-cache.service.spec.ts`, `common/validators/password-strength.spec.ts`).
- `backoffice`: `vitest run --passWithNoTests` — no test files currently.
- `web`: `test` script is a placeholder that prints `web: no unit tests`.

### Environment configuration

- `server/.env.example` declares: `NODE_ENV`, `PORT`, `APP_NAME`, `DATABASE_URL`, `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`, `REDIS_URL`, `DB_SYNC`, `DB_MIGRATIONS_RUN`, `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES`, `REFRESH_TOKEN_EXPIRES_DAYS`, `COOKIE_SECURE`, `COOKIE_DOMAIN`, `CORS_ORIGINS`, `BACKOFFICE_URL`.
- `web/.env.example`: `NEXT_PUBLIC_BACKOFFICE_URL`, `NEXT_PUBLIC_SITE_URL`.
- `backoffice/.env.example`: `VITE_API_BASE_URL`.
- `docker-compose.yml` defines a `postgres:16-alpine` service with user/password/db `riaya` on port 5432 (non-secret defaults for local use only).

## Standard Best Practices (from MCP/skills)

- **Context7 (`/nestjs/docs.nestjs.com`):** NestJS provides first-party guidance for security headers (Helmet), rate limiting (`ThrottlerModule`), authorization guards, and validation — all of which this project already uses. Reference: `content/security/helmet.md`, `content/security/rate-limiting.md`, `content/security/authorization.md`.
- **ux-ui-library MCP:** unavailable in this environment (server disabled). UI standards below are therefore derived from repository facts only.
- **stackwise MCP:** unavailable in this environment (server disabled). Backend standards below are therefore derived from repository facts and Context7 only.

## Assumptions

- The `docker-compose.yml` Postgres is the intended local database. `[assumption]`
- `web` is public/unauthenticated marketing surface; `backoffice` is authenticated staff surface. `[assumption]`
- The two PDF files at repository root (`Ri-aya.pdf`, `MediFlow — Project Brief for Students.pdf`) are requirements inputs, not build artifacts. `[assumption]`
