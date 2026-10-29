# Implementation Report — authentication-onboarding-and-access-control

**Date:** 2026-10-28
**Branch:** `feature/auth-onboarding` (base `main`)
**Version:** v1
**Status:** Code complete · **verification FAIL (tool limitation)** · login blocked pending Redis

---

## Summary

All 32 tasks across 6 phases were implemented. Typecheck and lint pass for `server` and
`backoffice`. The server builds, boots, and `/api/health` reports `database: up`.

**One runtime blocker remains:** `POST /api/auth/login` returns 500 with
`Redis unavailable: security state requires a live connection`. This is `NFR-009` / `AC-031`
behaving as approved — lockout fails closed. Redis is not installed on this machine and Docker
Desktop was not running at the time of writing.

## Phases delivered

| Phase                         | Tasks     | Delivered                                                                                                                                                                                                                        |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 Redis security state       | T1.1–T1.4 | Redis service in `docker-compose.yml`; `getStrict`/`setStrict`/`delStrict`/`incrementStrict`/`ttlStrict` on `RedisCacheService`; `TokenBlacklistService`; `LoginAttemptService`                                                  |
| P2 Tenancy data model         | T2.1–T2.4 | `Organization`, `Clinic`, `UserMembership`, `Invitation`, `AuditLog` Prisma models; `MembershipStatus` enum; Prisma accessors + `$transaction`; seed creates org/clinic/memberships idempotently                                 |
| P3 Scoped tokens              | T3.1–T3.6 | `org_id`/`clinic_id`/`role` JWT claims; `TenantContext` (request-scoped, token-only); `TenancyService`; `JwtStrategy` re-verifies membership; `GET /auth/memberships`; `POST /auth/switch-workspace`; last-super-admin invariant |
| P4 Registration & invitations | T4.1–T4.6 | `OnboardingService` (transactional register, create-org, invite, accept-invite); `POST /auth/register`, `/auth/accept-invite`, `/organizations`, `/invitations`; `PATCH /memberships/:id/suspend`; invitation email template     |
| P5 Audit & password lifecycle | T5.1–T5.5 | `AuditService` (transactional, append-only); audit wired into register and accept-invite; Redis lockout in login; session revocation on password change/reset                                                                    |
| P6 Front end & contract       | T6.1–T6.7 | `RegisterPage` (3-step wizard), `AcceptInvitePage`, `WorkspaceSwitcher`, `StaffDirectoryPage`; routes wired; EN/AR/FR keys; per-endpoint throttles; Swagger decorators                                                           |

## Verification — FAIL, and why

`sdrive verify` reports `status: fail`, `matched: 0`, `missing: 96`, `renamed: 7`.

**This is a limitation of the verifier, not a defect in the code.** `.sdrive/scripts/verify.js`:

- `detectEndpoints()` only recognises Express (`app.get(...)`), FastAPI (`@app.get(...)`) and
  Next.js `pages/api/` routes. It has **no NestJS decorator support**, so every `@Post('login')`
  is invisible to it.
- `CODE_EXTENSIONS` does not include `.prisma`, and `CANDIDATE_ROOTS` does not include
  `server/prisma`, so Prisma models are never scanned.
- Component names in `plan.json` are human labels ("auth module"), which the scanner cannot map
  to file paths — hence the 7 spurious "renamed" entries.

**Independently confirmed present in code** (16 routes across two controllers):

```
auth.controller.ts     POST signup, login, refresh, logout, change-password,
                       forgot-password, reset-password, switch-workspace
                       GET  me, memberships
tenancy.controller.ts  POST auth/register, auth/accept-invite, organizations, invitations
                       GET  invitations
                       PATCH memberships/:id/suspend
```

Per the owner's decision, verification is recorded as a **known tool limitation** and the feature
is **NOT marked complete**.

## Checks run

| Check                                                | Result                          |
| ---------------------------------------------------- | ------------------------------- |
| `pnpm --filter server typecheck`                     | pass                            |
| `pnpm --filter server lint` (`--max-warnings=0`)     | pass                            |
| `pnpm --filter server build`                         | pass                            |
| `pnpm --filter backoffice typecheck`                 | pass                            |
| `pnpm --filter backoffice lint` (`--max-warnings=0`) | pass                            |
| `node .sdrive/scripts/validate-governance.js`        | pass                            |
| Secret scan (46 changed files)                       | no secrets found                |
| `sdrive verify`                                      | **FAIL — tool limitation**      |
| Runtime login                                        | **blocked — Redis unavailable** |

## Deferred to `/sdrive:test`

No test-writing or test-running tasks existed in `tasks.json`, so nothing was deferred. Test
authoring for the 40 acceptance criteria belongs to `/sdrive:test`.

## Dependency skills

| Dependency        | Action | Outcome                                                                                                                       |
| ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `redis` (service) | add    | **No skill available** — infrastructure service, not a code library. `ioredis` was already a dependency and is used directly. |

## Known issues to resolve

1. **Redis must be running** for login. `docker compose up -d redis` (or a native install).
2. **`sdrive verify` cannot see NestJS or Prisma.** Either patch `verify.js` (a framework file,
   outside this feature's scope) or accept manual verification for NestJS projects.
3. **`User.role` is now nullable** and marked `@deprecated`. It is retained so existing rows keep
   their values; `RolesGuard` and `JwtStrategy` read the membership role instead. A follow-up
   should drop the column once nothing reads it.
4. **`failedLoginCount` / `failedLoginWindowStart` / `lockedUntil`** remain on `User` but are no
   longer read — lockout state is in Redis. Same follow-up applies.
5. **TypeORM entity files are dead code** (`user.entity.ts`, `refresh-token.entity.ts`,
   `password-reset-token.entity.ts`, `data-source.ts`, the TypeORM migration). No `TypeOrmModule`
   is wired; runtime uses Prisma. Removing them is out of this feature's scope.
6. **`AC-038` (unversioned paths)** was honoured: all existing `/api/auth/*` paths still work.

---

## P7 — Registration entry points and owner onboarding (2026-10-29)

Added by `/sdrive:update-propose`, then implemented by `/sdrive:apply`.

| Task | Outcome                                                                                                                                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T7.1 | `POST /auth/signup` now always responds `410 Gone` with `SIGNUP_RETIRED`; the route stays registered (FR-026) and writes nothing (FR-038, AC-045).                                                                                                    |
| T7.2 | Removed `AuthService.signup`, `UsersService.createSignup` and `auth/dto/signup.dto.ts` — no public path can create an inactive identity any more (FR-036, AC-043).                                                                                    |
| T7.3 | Already satisfied: the wizard establishes the owner session by reusing `AuthContext.login` and then navigates to `/`, so the creator lands in the new workspace authenticated (AC-041). No code change required; confirmed by reading `RegisterPage`. |
| T7.4 | `/signup` redirects to `/register`; `SignupPage.tsx` and its RTK mutation were deleted (FR-037, AC-044).                                                                                                                                              |
| T7.5 | New `lib/firstRun.ts` plus a first-run card on the workspace overview naming the next actions; the wizard marks the session (AC-041, AC-042).                                                                                                         |
| T7.6 | New `firstRun.*` strings in EN, AR and FR (NFR-012, AC-033).                                                                                                                                                                                          |

### Checks run

| Check                                                      | Result                                                                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit` (server)                                | pass                                                                                                                                                                                   |
| `npx eslint "src/**/*.ts" --max-warnings=0` (server)       | pass                                                                                                                                                                                   |
| `tsc --noEmit -p tsconfig.app.json` (backoffice)           | pass                                                                                                                                                                                   |
| `eslint "src/**/*.{ts,tsx}" --max-warnings=0` (backoffice) | pass                                                                                                                                                                                   |
| `node .sdrive/scripts/validate-governance.js`              | pass                                                                                                                                                                                   |
| Secret scan (search patterns)                              | No production secrets. One test-fixture password (`RiayaAdmin123!`) in `auth.e2e.spec.ts`, matching the documented local dev seed.                                                     |
| `node .sdrive/scripts/verify.js <feature>`                 | **FAIL — tool limitation** (Matched 0 / Missing 97 / Renamed 8). The verifier has no NestJS-decorator or `.prisma` support, so decorator routes and Prisma models are invisible to it. |

### Status

T7.1–T7.6 are implemented. The feature is **NOT** marked complete: the `review` gate stays `pending` and `sdrive verify` fails for the documented tool limitation. No tests were written, edited or run — that belongs to `/sdrive:test`.

### Deferred to `/sdrive:test`

No test-related tasks exist in P7. Acceptance tests for AC-041 through AC-045 belong to `/sdrive:test`.
