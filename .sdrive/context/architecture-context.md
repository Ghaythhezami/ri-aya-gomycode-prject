# Architecture Context

<!-- source: repository discovery, 2026-10-27 -->

## Observed Project Facts

### Repository shape

Three deployable applications in one pnpm workspace. There is **no shared library package** — `web`, `server` and `backoffice` do not import from one another; they communicate over HTTP.

### Server (`server/`) — NestJS 11

- **Bootstrap (`src/main.ts`):**
  - Global route prefix `api` (`app.setGlobalPrefix('api')`).
  - `app.use(helmet()` — security headers.
  - `app.use(cookieParser())` — HttpOnly refresh-token cookie.
  - CORS allow-list parsed from `CORS_ORIGINS` (fallback `http://localhost:3000,http://localhost:5173`), with `credentials: true`.
  - Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
  - Global `HttpExceptionFilter`.
  - Swagger/OpenAPI at `api/docs` with `addBearerAuth()` and `addCookieAuth('refresh_token')`.
  - Listens on `PORT` (default 4000).
- **Root module (`src/app.module.ts`):** imports `ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] })`, `ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: NODE_ENV === 'test' ? 1000 : 60 }] })`, `PrismaModule`, `RedisCacheModule`, `AuthModule`, `UsersModule`, `HealthModule`. Registers `ThrottlerGuard` globally via `APP_GUARD`.
- **Module/layer structure (`src/`):**
  - `auth/` (+ `dto/`, `entities/`), `users/` (+ `dto/`), `health/`, `cache/`, `mail/`, `database/` (+ `migrations/`, `seeds/`), `common/` (+ `decorators/`, `filters/`, `guards/`, `validators/`), `types/`.
  - Cross-cutting primitives: `common/guards/jwt-auth.guard.ts`, `common/guards/roles.guard.ts`, `common/decorators/current-user.decorator.ts`, `common/decorators/roles.decorator.ts`, `common/filters/http-exception.filter.ts`.
- **Data access:** Prisma Client (`@prisma/client` 6) with `prisma/schema.prisma` (`provider = "postgresql"`, `url = env("DATABASE_URL")`). A `PrismaService` lives in `src/database/prisma.service.ts` and connects in `onModuleInit`, so a failed DB connection prevents application startup.
- **Schema (current):** enums `UserRole` (`SUPER_ADMIN`, `CLINIC_ADMIN`, `DOCTOR`, `RECEPTIONIST`) and `PreferredLocale` (`en`, `ar`, `fr`); models `User` (`@@map("users")`), `RefreshToken` (`@@map("refresh_tokens")`, indexed on `userId` and `familyId`), `PasswordResetToken` (`@@map("password_reset_tokens")`). Primary keys are `uuid()`. `User` tracks `failedLoginCount`, `failedLoginWindowStart`, `lockedUntil`, `lastLoginAt`.
- **Caching:** `RedisCacheService` (`src/cache/`) degrades to an in-memory cache and logs a warning when Redis is unreachable; the API stays available.
- **Mail:** `src/mail/` module exists (used by password-reset flows).
- **Persistence modes:** `DB_SYNC` and `DB_MIGRATIONS_RUN` env flags exist. `server/package.json` exposes `prisma:generate`, `prisma:push`, `prisma:studio`, `migration:run` (`prisma migrate deploy`), `migration:generate` (`prisma migrate dev`).
- **Legacy dependency note:** `@nestjs/typeorm` and `typeorm` are declared in `server/package.json`, but no TypeORM usage was found in `src/` — Prisma is the actual ORM.

### Web (`web/`) — Next.js 15

- App Router with locale segmentation: `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`.
- `next-intl` drives localisation; catalogues in `messages/`.
- SEO routes: `src/app/robots.ts`, `src/app/sitemap.ts`.
- Styling: Tailwind CSS 4 via `@tailwindcss/postcss` and `src/app/globals.css`.
- `next.config.ts` present; a build warning reports multiple lockfiles, meaning Next infers the workspace root from `C:\Users\KENULE-NWINEE\pnpm-lock.yaml` rather than the repo. `[observed, non-blocking]`

### Backoffice (`backoffice/`) — React 19 + Vite

- `src/` structure: `auth/`, `common/`, `i18n/`, `layouts/`, `lib/`, `pages/`, `store/`.
- Routing: `react-router-dom` 7. Pages: `LoginPage`, `SignupPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `OverviewPage`, `DesignSystemPage`, `PublicUiPage`, `PlaceholderPage`.
- State: Redux Toolkit (`@reduxjs/toolkit`, `react-redux`) in `src/store/`.
- Forms/validation: `react-hook-form` + `@hookform/resolvers` + `zod`.
- HTTP: `axios` via `src/lib/`; base URL from `VITE_API_BASE_URL`.
- Localisation: `i18next` + `i18next-browser-languagedetector` + `react-i18next`.
- Charts: `recharts`. Icons: `lucide-react`.

### Authentication architecture (as implemented)

- Access token: JWT, 15 minutes (`JWT_ACCESS_EXPIRES`), returned in the JSON response body.
- Refresh token: 7 days (`REFRESH_TOKEN_EXPIRES_DAYS`), delivered as an HttpOnly `SameSite=Lax` cookie (`Secure` when `COOKIE_SECURE=true`).
- Refresh-token **rotation with family tracking**: `RefreshToken.familyId`; reusing a rotated token revokes the whole family (documented in `README.md`).
- Passwords hashed with **argon2**.
- **Account lockout:** five failed logins within 10 minutes locks the account for 15 minutes; login always returns a generic "Invalid credentials" message (`README.md`).
- Backoffice keeps the access token **in memory only** and silently calls `/api/auth/refresh` after a reload or a 401 (`README.md`).
- No public self-registration: staff accounts are provisioned by admins via `POST /api/users`.

### API surface (from startup route map)

- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `POST /api/users`
- `GET /api/health`

## Standard Best Practices (from MCP/skills)

- **Context7 — NestJS security docs** (`content/security/helmet.md`, `content/security/rate-limiting.md`, `content/security/authorization.md`): global security headers, `ThrottlerModule` for rate limiting, and policy/guard-based authorization are the framework-sanctioned approach. The project already follows these.
- **ux-ui-library MCP:** unavailable — no external UI architecture standards were fetched.
- **stackwise MCP:** unavailable — no external backend/data architecture standards were fetched.

## Assumptions

- Horizontal scale-out is not currently required; `RedisCacheService` in-memory fallback implies single-instance deployments are acceptable today. `[assumption]`
- The backoffice is the only authenticated client; `web` consumes no protected endpoints. `[assumption]`
- `typeorm`/`@nestjs/typeorm` are inadvertently-declared leftovers rather than an active second ORM. `[assumption]`
