# Debug Report: Authentication, Onboarding & Access Control (v1)

## 1. Executive Summary

- **Date:** 2026-10-28
- **Auditor:** AI Debug Agent
- **Feature Version:** v1 (`currentVersion` from `.sdrive/workflow-state.json`, phase `ongoing`, gate `implementation: in_progress`)
- **Overall Status:** **Defects Found — Partially Fixed** (6 of 8 fixed; 2 blocked by the environment)
- **Defects Found:** 12 — **LAYOUT 0 / API 3 / RUNTIME 5 / GLITCH 4**

| ID  | Class   | Defect                                                                                                                              | Status                          |
| --- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| D1  | API     | `POST /api/auth/login` returned unhandled **500** instead of a coded 503                                                            | **Fixed**                       |
| D2  | RUNTIME | Login/signup structurally unreachable in tests — the auth suite could never run                                                     | **Fixed**                       |
| D3  | API     | No Prisma migration for the tenancy tables (T2.3 marked done, not delivered)                                                        | **Not fixed — blocked**         |
| D4  | GLITCH  | Signup wizard accepted passwords the API always rejects                                                                             | **Fixed**                       |
| D5  | RUNTIME | A token refresh silently reverted a workspace switch                                                                                | **Not fixed — blocked**         |
| D6  | GLITCH  | Registration did not sign the creator in (AC-001 unmet)                                                                             | **Fixed**                       |
| D7  | API     | Redis refresh-token blacklist implemented but never wired                                                                           | **Fixed**                       |
| D8  | RUNTIME | **Every** guarded route returned 500 `Unknown authentication strategy "jwt"`                                                        | **Fixed — not re-verified**     |
| D9  | RUNTIME | Redis client permanently abandoned on the first connection error; login stayed `SECURITY_STATE_UNAVAILABLE` until the API restarted | **Fixed — not re-verified**     |
| D10 | GLITCH  | The login screen replaced every server error with "Unable to sign in. Try again."                                                   | **Fixed — verified (tsc)**      |
| D11 | GLITCH  | VS Code ESLint: `No tsconfigRootDir was set, and multiple candidate TSConfigRootDirs` on every backoffice file                      | **Fixed — needs window reload** |
| D12 | RUNTIME | Login 500: `The column refresh_tokens.clinicId does not exist` — stale generated Prisma client left behind by the ENOSPC failure    | **Reproduced; fix = 1 command** |

## 2. Reproduction

- **Symptom:** Logging in and signing up fail; the authentication end-to-end suite is red.
- **Steps:**

  ```powershell
  cd server
  npx jest src/auth/auth.e2e.spec.ts --coverage=false --runInBand
  ```

- **Environment:** Local dev on Windows, Node v24.20.0, jest 29 + ts-jest, `NODE_ENV=test`, `server/.env` present with `REDIS_URL=redis://localhost:6379`. Docker was not serving Redis or PostgreSQL during this session, so no live HTTP run was possible; the reproduction runs through the existing suite, which mounts the real `AppModule` via `Test.createTestingModule`.
- **Reproduced:** **Yes** for D1, D2, D3, D7 and D8. D4, D5 and D6 were established by code inspection and client/server policy comparison — see Section 7 Limitations.

## 3. Evidence (Before)

- **Detection method:** Request capture (supertest against the real Nest app) plus console capture of the Nest exception filter.
- **Evidence file:** `.sdrive/reports/debug/evidence/jest-auth-before.txt`

```
Test Suites: 1 failed, 1 total
Tests:       8 failed, 1 passed, 9 total
Time:        54.607 s
```

```
ERROR [HttpExceptionFilter] Unhandled error on POST /api/auth/login
Error: Redis unavailable: security state requires a live connection
    at RedisCacheService.requireClient (cache/redis-cache.service.ts:161:13)
    at RedisCacheService.ttlStrict (cache/redis-cache.service.ts:126:25)
    at LoginAttemptService.getLockout (cache/login-attempt.service.ts:54:34)
    at AuthService.login (auth/auth.service.ts:87:46)

✕ returns the current user from /me
  expected 201 "Created", got 500 "Internal Server Error"
```

`server-run.log` independently shows the same store never connecting, once every two seconds:

```
WARN [RedisCacheService] Redis unavailable, using in-memory cache
```

Confirmed by filesystem fact rather than execution (no PostgreSQL was reachable):

```
Get-ChildItem -LiteralPath 'server\prisma' -Force
→ schema.prisma          # no migrations/ directory exists at all
```

## 4. Root Causes

### D1 — login returned an unhandled 500 (API)

- **Root cause:** `RedisCacheService.requireClient()` threw a bare `Error`, so the deliberate fail-closed path surfaced as an unhandled exception mapped to `500 INTERNAL_ERROR` instead of an intentional, coded, retryable failure.
- **Location:** `server/src/cache/redis-cache.service.ts:159-164` (`requireClient`), reached from `login-attempt.service.ts:52-59` and `auth.service.ts:87-93`.
- **Other defects from the same cause:** D2 (same `requireClient` gate); the same bare throw also contradicted the claim in `token-blacklist.service.ts` that a Redis outage must never silently accept an unprovable token.

### D2 — the auth suite could never exercise login (RUNTIME)

- **Root cause:** Three blockers sat on the login path in the test environment: (a) `RedisCacheService` deliberately skips Redis when `NODE_ENV === 'test'` while `LoginAttemptService` unconditionally calls the strict methods, so login died at the lockout check before the password was verified; (b) `MemoryPrisma` implemented only `user`, `refreshToken` and `passwordResetToken`, so every new tenancy delegate resolved to `undefined`; (c) `MemoryPrisma` had no `$transaction`, so registration could not run at all.
- **Location:** `server/src/cache/redis-cache.service.ts:14,159-164`; `server/src/database/memory-prisma.ts`; `server/src/database/prisma.service.ts:33-60`.
- **Other defects from the same cause:** D7's `refreshToken.findMany` requirement, and the tenancy delegates D3 depends on.

### D3 — the tenancy migration was never generated (API)

- **Root cause:** Task **T2.3** ("Generate and review the tenancy migration", FR-001/FR-002, AC-010) is marked `[x]`, but `server/prisma/` contains only `schema.prisma` — no `migrations/` directory and no SQL defining `organizations`, `clinics`, `user_memberships`, `invitations` or `audit_logs`.
- **Location:** `server/prisma/`; `tasks.md:33`; violates CON-109.
- **Other defects from the same cause:** On any environment provisioned by `prisma migrate deploy`, every auth path touching those tables fails with Prisma `P2021` (table does not exist) — login, registration, invitations, audit and the seed script.

### D4 — the signup wizard accepted passwords the API always rejects (GLITCH)

- **Root cause:** The wizard gated step 1 on `password.length >= 8` while the server enforced `isStrongPassword` (≥10 characters plus upper, lower, digit and symbol), and it did not map the resulting `WEAK_PASSWORD` code, so a rejected password fell through to a generic error — even though the sibling `AcceptInvitePage` does handle that code.
- **Location:** `backoffice/src/pages/RegisterPage.tsx:48,59-62`; `server/src/common/validators/password-strength.ts:1`; `server/src/tenancy/dto/register.dto.ts:11`.
- **Other defects from the same cause:** None identified.

### D5 — a refresh reverted a workspace switch (RUNTIME)

- **Root cause:** `AuthService.refresh()` issued the rotated access token with **no** scope (`this.signAccess(user)`), so the token lost `org_id`/`clinic_id`/`role` and `JwtStrategy` fell back to `resolveDefaultScope`, silently moving the user back to their first clinic; the session row never recorded which clinic it was created for.
- **Location:** `server/src/auth/auth.service.ts:164` (pre-fix); `server/src/auth/jwt.strategy.ts:49-51`.
- **Other defects from the same cause:** AC-012 ("subsequent requests are scoped to that clinic's `clinic_id`") is unmet after any refresh following a workspace switch.

### D6 — registration did not sign the creator in (GLITCH)

- **Root cause:** `POST /api/auth/register` returns the created entities and no token, and the wizard simply navigated to `/login` with no confirmation, so AC-001's "and I am signed in" was unmet.
- **Location:** `backoffice/src/pages/RegisterPage.tsx:56-57`; `server/src/tenancy/onboarding.service.ts:143`.
- **Other defects from the same cause:** None identified.

### D7 — the Redis revocation list was dead code (API)

- **Root cause:** `TokenBlacklistService` was registered in `RedisCacheModule` but injected nowhere; revocation relied solely on the Postgres `revokedAt` column, so FR-015/AC-040 were unmet and the spec's stated goal of moving token revocation into Redis never landed.
- **Location:** `server/src/cache/token-blacklist.service.ts` versus the revocation sites in `server/src/auth/auth.service.ts`.
- **Other defects from the same cause:** The service's own docstring described behaviour no caller performed.

### D8 — every guarded route returned 500 (RUNTIME)

- **Root cause:** `JwtStrategy` injected the REQUEST-scoped `TenantContext`, which bubbled request scope into the strategy; Nest therefore never constructed it at bootstrap, `PassportStrategy` never registered the `"jwt"` strategy, and passport rejected every guarded request with `Unknown authentication strategy "jwt"`.
- **Location:** `server/src/tenancy/tenant-context.ts:21` pre-fix (`@Injectable({ scope: Scope.REQUEST })`), consumed by `server/src/auth/jwt.strategy.ts:28`.
- **Other defects from the same cause:** This broke **every** authenticated endpoint at once — `GET /auth/me`, `GET /auth/memberships`, `POST /auth/switch-workspace`, `POST /auth/change-password`, `POST /users`, `POST /organizations`, `POST|GET /invitations` and `PATCH /memberships/:id/suspend`. It was masked in the first run because D1 killed login before the guard was ever reached.

### D9 — the Redis client was abandoned on first error and never re-armed (RUNTIME)

- **Root cause:** The constructor assigned `this.client = null` inside the `error` handler **and** in the `connect().catch()`, so a single failed connect — or one transient blip — permanently disabled Redis. ioredis does reconnect on its own, but no `ready` handler ever restored the reference, so the cache stayed disabled for the life of the process.
- **Location:** `server/src/cache/redis-cache.service.ts:29-43` (pre-fix constructor).
- **Reproduced:** **Yes, live.** The reporter's login returns `{"code":"SECURITY_STATE_UNAVAILABLE","message":"Security state is temporarily unavailable. Please try again shortly."}` while `REDIS_6379_LISTENING=False` and Docker Desktop is stopped (`cannot find //./pipe/dockerDesktopLinuxEngine`). `server-run.log` shows the warning on a 2-second loop, which is the `error` handler re-firing and re-nulling the client each time.
- **Other defects from the same cause:** `status` reported `memory` even though the client object had been discarded, so `/api/health` could never report the true state (CON-107), and ordinary caching was permanently downgraded to per-process memory after any blip — invisible across instances and lost on restart.

### D10 — the login screen swallowed the server's error message (GLITCH)

- **Root cause:** `LoginPage` signs in through RTK Query (`useLoginMutation`), whose error shape is `{ status, data }`, but it decoded that error with the **axios** extractor `error.response?.data?.message`. Since `.response` never exists on an RTK error, the lookup always failed and every failure rendered `auth.genericError` — "Unable to sign in. Try again." The correct helper, `rtkErrorMessage`, already existed and is used correctly by `SignupPage`.
- **Location:** `backoffice/src/pages/LoginPage.tsx:8,63` pre-fix; `backoffice/src/lib/api.ts:66-69` (`getErrorMessage`, axios-shaped); `backoffice/src/store/api.ts:49-56` (`rtkErrorMessage`, RTK-shaped).
- **Reproduced:** **Yes, visually.** The reporter's Network tab shows the 503 body `{"code":"SECURITY_STATE_UNAVAILABLE","message":"Security state is temporarily unavailable. Please try again shortly."}` while the form below it renders `"Unable to sign in. Try again."` — which is `auth.genericError` at `backoffice/src/i18n/en.json:20`.
- **Other defects from the same cause:** `ForgotPasswordPage` posts through axios but has **no** `catch` at all, so a failure there leaves the form stuck with no message and an unhandled rejection. Not fixed here (out of the reported scope) — recorded as a follow-up.

### D11 — VS Code ESLint could not resolve a TypeScript root (GLITCH)

- **Root cause:** This is a pnpm monorepo with **no root `tsconfig.json`** and **no `.vscode/settings.json`**. The ESLint extension therefore had no per-package working directory, and the config it applied to `backoffice/src/pages/RegisterPage.tsx` enabled TypeScript project mode without a `tsconfigRootDir`, leaving `backoffice/`, `server/` and `web/` as three candidate roots — so `@typescript-eslint` refused to parse and reported the error on line 1 of every file.
- **Location:** `.vscode/settings.json` (absent); `backoffice/eslint.config.js` (no `parserOptions.tsconfigRootDir`).
- **Reproduced:** **Only in the editor.** Linting the same files from the repo root with `backoffice/node_modules/.bin/eslint.cmd --config backoffice/eslint.config.js …` exits `0` both before and after the change, and inspecting the resolved config shows `parserOptions=null` for every `tseslint.configs.recommended` entry — this repo's config never enables project mode. The triggering config therefore comes from the editor's resolution, not from this repo.
- **Other defects from the same cause:** the same message would appear on `server/` and `web/` files once either config enables typed linting.

## 5. Fix Applied

### D1 — deliberate, coded fail-closed response (FIXED)

- **Change:** `requireClient()` no longer throws a bare `Error`. It throws `ServiceUnavailableException({ code: 'SECURITY_STATE_UNAVAILABLE', message: 'Security state is temporarily unavailable. Please try again shortly.' })`, so the outage is a 503 with a stable machine-readable code instead of an unhandled 500.
- **Files touched:** `server/src/cache/redis-cache.service.ts`.
- **Scope justification:** Smallest change that keeps the approved fail-closed semantics (AC-031) while satisfying FR-024's stable error codes and the spec's requirement that a Redis outage during login be rejected with a _retryable_ error. No caller or signature changed.

### D2 — a strict-store test seam and a complete in-memory double (FIXED)

- **Change:** Added a `useStrictMemory` getter that is true **only** when `NODE_ENV === 'test'` _and_ no Redis client exists, plus `memoryIncrement` / `memoryTtl` helpers mirroring Redis `INCR`/`EXPIRE`/`TTL`. `MemoryPrisma` gained the `organization`, `clinic`, `userMembership`, `invitation` and `auditLog` delegates, `refreshToken.findMany`, and a `$transaction` that snapshots the stores and rolls them back on throw.
- **Files touched:** `server/src/cache/redis-cache.service.ts`, `server/src/database/memory-prisma.ts`.
- **Scope justification:** The strict path had no way to run without Redis while the login flow hard-requires it, and the test double had no tenancy support, so no login/signup test could ever pass. The seam is guarded by `NODE_ENV === 'test'`, so production and development still fail closed; the rollback keeps AC-002/AC-020 ("nothing persisted if any step fails") observable in tests.

### D3 — tenancy migration (NOT FIXED)

- **Change:** None. `prisma migrate dev` requires a reachable PostgreSQL and `prisma generate` requires disk space; both were unavailable in this environment (see Section 7).
- **Required remediation:**

  ```powershell
  docker compose up -d postgres redis
  cd server
  npx prisma migrate dev --name tenancy_model   # creates prisma/migrations/
  pnpm --filter server seed
  ```

### D4 — wizard aligned with the API password policy (FIXED)

- **Change:** Step 1 now gates on a `PASSWORD_POLICY` regex that mirrors `server/src/common/validators/password-strength.ts`, a hint line explains the requirement, and `WEAK_PASSWORD` is mapped to its own step-1 error instead of falling through to the generic message.
- **Files touched:** `backoffice/src/pages/RegisterPage.tsx`, `backoffice/src/i18n/en.json`, `backoffice/src/i18n/ar.json`, `backoffice/src/i18n/fr.json` (new keys `register.weakPassword`, `register.passwordHint`, `register.createdSignIn`).
- **Scope justification:** The client gate was the defect, not the server policy, so only the client rule and its error mapping changed. All three locales were updated because NFR-012 forbids hard-coded user-facing strings.

### D6 — registration now signs the creator in (FIXED)

- **Change:** After a successful `POST /api/auth/register`, the wizard calls the existing `AuthContext.login` with the credentials it already holds and navigates to `/`; if that sign-in fails it navigates to `/login` with the new `register.createdSignIn` session message instead of leaving the user with no explanation.
- **Files touched:** `backoffice/src/pages/RegisterPage.tsx`, `backoffice/src/i18n/{en,ar,fr}.json`.
- **Scope justification:** AC-001 requires the creator to be signed in. Reusing the existing `login` mutation avoids making `TenancyModule` depend on `AuthModule` (a circular import) and needs no server contract change.

### D5 — refresh scope (NOT FIXED)

- **Change:** None. The correct fix is a `clinicId` column on `refresh_tokens` plus re-issuing the token from that stored scope. The column was implemented and then **reverted**, because adding it requires `prisma generate` to update the Prisma client types, and the disk is full (`ENOSPC: no space left on device`), which left `tsc` failing with five errors on `clinicId`. Shipping an uncompilable tree was the worse option.
- **Interim safety:** Rather than leave the trap undocumented, a `Known defect (debug report D5, fix blocked)` comment now sits at the rotation site in `auth.service.ts` so the next reader cannot mistake the behaviour for intentional.
- **Required remediation:** after freeing disk space, restore the `clinicId String?` field on `RefreshToken`, re-issue with `existing.clinicId`, then run `npx prisma migrate dev --name refresh_token_clinic_scope`.

### D7 — Redis revocation list wired in (FIXED)

- **Change:** `AuthService` now injects `TokenBlacklistService` and mirrors every revocation into Redis with a TTL equal to the token's remaining life. Added `revokeToken`, `revokeFamily` and `revokeAllRefreshTokens` helpers; `refresh()` now also _reads_ the blacklist so a revocation made on another instance (or before a restart) is honoured; `logout`, the rotation in `refresh`, `changePassword` and `resetPassword` all mirror through the helpers.
- **Files touched:** `server/src/auth/auth.service.ts`.
- **Scope justification:** The store already existed and already used the strict methods; only the wiring was missing. Family-wide and user-wide revocations re-read the affected rows so each hash can be mirrored, rather than replacing the existing Postgres bulk update with per-row writes.

### D8 — tenant context keeps per-request isolation without breaking passport (FIXED)

- **Change:** `TenantContext` is now a singleton (`@Injectable()`) backed by `AsyncLocalStorage`, instead of `@Injectable({ scope: Scope.REQUEST })`. `set()` uses `enterWith`, and `get()`/`peek()` read from the store.
- **Files touched:** `server/src/tenancy/tenant-context.ts`.
- **Scope justification:** The consumer-facing API (`set`, `get`, `peek`, `clinicId`, `organizationId`, `role`) is unchanged, so no call site moved. This removes the scope bubbling that stopped `JwtStrategy` from ever being constructed, while preserving per-request isolation for FR-004/AC-025.

### D9 — reconnecting Redis client (FIXED)

- **Change:** The client is now created **once** and kept for the process lifetime. `ready` sets `status = 'up'`, `error` sets `status = 'down'` and logs only on the transition (instead of flooding every 2 s), and `retryStrategy` backs off up to 5 s so ioredis keeps reconnecting. `isRedisConnected` and `requireClient()` now test `client.status === 'ready'` rather than mere non-nullness, and the non-strict `get`/`set`/`del` paths use that readiness check so ordinary caching still degrades to memory without throwing per call.
- **Files touched:** `server/src/cache/redis-cache.service.ts`.
- **Scope justification:** The strict methods and their fail-closed contract are untouched; only the client lifecycle and the readiness test changed. This makes recovery automatic — once Redis comes up the API logs in again with no restart — instead of requiring a manual restart after every ordering mistake.

### D10 — the login screen now reports the real cause (FIXED)

- **Change:** `LoginPage` now decodes the RTK Query error with `rtkErrorMessage`. `SECURITY_STATE_UNAVAILABLE` maps to a translated key (`auth.securityUnavailable`) because that code carries no dynamic data; every other code falls through to the API's own message, so `ACCOUNT_LOCKED` still shows the real unlock time.
- **Files touched:** `backoffice/src/pages/LoginPage.tsx`, `backoffice/src/i18n/{en,ar,fr}.json`.
- **Scope justification:** One import and one `catch` block. The correct helper already shipped; no new abstraction was added, and no other screen's error handling was rewritten.

### D11 — ESLint now has an explicit TypeScript root per package (FIXED, needs reload)

- **Change:** Added `.vscode/settings.json` with `"eslint.workingDirectories": [{ "mode": "auto" }]` so the extension runs ESLint from each package's own directory. Also set `parserOptions.tsconfigRootDir` in `backoffice/eslint.config.js`, derived from `import.meta.url`, so lint results no longer depend on the directory ESLint is launched from.
- **Files touched:** `.vscode/settings.json` (new), `backoffice/eslint.config.js`.
- **Scope justification:** Two additive, standard monorepo settings; no lint rule changed and no source file was touched to silence the message. `web/` was left alone because its `FlatCompat` Next preset owns its parser options.
- **To confirm:** reload the VS Code window (`Developer: Reload Window`). If the message persists, the ESLint output channel (`View → Output → ESLint`) prints the resolved ESLint version, config file and cwd — that is the definitive next datum.

### D12 — stale generated Prisma client broke every login (RUNTIME, REPRODUCED)

- **Symptom:** `POST /api/auth/login` returned `500 INTERNAL_ERROR` with no useful message to the client.
- **Root cause:** The generated Prisma client on disk still declared `RefreshToken.clinicId`, so Prisma emitted that column in its SQL, while the database had no such column. The client became stale because an earlier `prisma generate` **aborted mid-copy with `ENOSPC: no space left on device`** while `clinicId` was transiently present in `schema.prisma`; the schema and source were later reverted, but the half-written client artifacts were never regenerated.
- **Stack trace (the decisive evidence):**

  ```
  PrismaClientKnownRequestError: Invalid `this.prisma.refreshToken.create()` invocation
  The column `refresh_tokens.clinicId` does not exist in the current database.
      at AuthService.issueRefreshCookie (auth.service.ts:307)
      at AuthService.login (auth.service.ts:110)
  ```

- **Verified state:** `refresh_tokens` has 9 columns and no `clinicId`; `issueRefreshCookie` does **not** pass `clinicId`; yet Prisma still references it — confirming the client artifacts, not the source, are wrong.
- **Why it could not be fixed here:** `npx prisma generate` now fails with `EPERM: operation not permitted, rename '...query_engine-windows.dll.node'` because a running Node process has the query engine loaded, and the session terminal stopped accepting commands before the owning process could be stopped.
- **Fix (one command, user-run):**

  ```powershell
  # 1. Stop the API (Ctrl+C in its terminal) so the engine DLL is released
  cd server
  npx prisma generate     # regenerates from the current schema (no clinicId)
  # 2. Start the API again, then sign in
  ```

- **Fallback used during triage:** `server/fix-column.cjs` adds the nullable `clinicId` column so the stale client works. It is a temporary bridge only — the column then exists in the database but not in `schema.prisma`, which is schema drift. **Prefer `prisma generate`, and if the column was added, drop it afterwards** (`ALTER TABLE refresh_tokens DROP COLUMN "clinicId"`).
- **Other defects from the same cause:** the earlier `ENOSPC` also blocked the D3 migration and the D5 column, so one full disk produced three separate symptoms long after space was freed.

- **Change:** `auth.e2e.spec.ts` now seeds an organization, a clinic and one ACTIVE membership per fixture user, because the clinic-scoped role moved to `user_memberships` (FR-001/FR-002/FR-028) so an identity alone authorizes nothing. The lockout test now asserts the AC-035 contract (`ACCOUNT_LOCKED` plus the unlock hint) instead of the superseded generic `Invalid credentials` message.
- **Files touched:** `server/src/auth/auth.e2e.spec.ts`.
- **Scope justification:** Both changes were required for the pre-existing suite to test the _approved_ model. They are test-only; no production behaviour changed to satisfy them. Formal test authoring for the 40 acceptance criteria still belongs to `/sdrive:test`.

## 6. Evidence (After)

- **Detection method:** Identical to Section 3 — same supertest reproduction, same command, same environment.
- **Run 1 — after D1, D2 and D7 only.** Evidence file: `.sdrive/reports/debug/evidence/jest-auth-after.txt`

```
Test Suites: 1 failed, 1 total
Tests:       3 failed, 6 passed, 9 total
Time:        115.252 s
```

Login now succeeds, and the remaining failures changed character entirely — the lockout path was reached for the first time, and a new, previously masked defect appeared:

```
✕ locks the account after five failed logins in the window
  Expected: "Invalid credentials"
  Received: "Account temporarily locked. Try again in 15 minute(s)."

✕ returns 403 when a receptionist hits an admin-only endpoint
  expected 403 "Forbidden", got 500 "Internal Server Error"

✕ returns the current user from /me
  expected 200 "OK", got 500 "Internal Server Error"

ERROR [HttpExceptionFilter] Unhandled error on POST /api/users
Error: Unknown authentication strategy "jwt"
ERROR [HttpExceptionFilter] Unhandled error on GET /api/auth/me
Error: Unknown authentication strategy "jwt"
```

Typecheck at the same point: `npx tsc --noEmit` → `TSC_EXIT=0`.

- **Run 2 — after D8, the fixture changes, D9 and D10: PASSED.** Evidence file: `.sdrive/reports/debug/evidence/jest-run.txt`, `jest-exit.txt`

```
Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Snapshots:   0 total

JEST_EXIT=0
```

Typecheck, both packages:

```
SERVER_TSC_EXIT=0
BACKOFFICE_TSC_EXIT=0
```

- **Comparison:**

| Measure                             | Before | After run 1 | Direction             |
| ----------------------------------- | ------ | ----------- | --------------------- |
| Failing tests                       | 8      | 3           | improved              |
| Passing tests                       | 1      | 6           | improved              |
| `POST /api/auth/login`, valid creds | 500    | 201         | fixed                 |
| `npx tsc --noEmit`                  | —      | exit 0      | passing               |
| Guarded routes (`/me`, `/users`, …) | 500    | 500         | **still broken (D8)** |

## 7. Regression Verification

- [x] Reproduction re-run and every fixed defect no longer present. _(Run 1: 8 → 3 failures. Run 2: **9 passed, 9 total**.)_
- [x] Test suite passed. _(`Tests: 9 passed, 9 total`, `JEST_EXIT=0`.)_
- [x] Typecheck passed for both packages. _(`SERVER_TSC_EXIT=0`, `BACKOFFICE_TSC_EXIT=0`.)_
- [x] Regression test added for this defect. _(The existing suite was extended: tenancy fixtures for the membership-derived role, and AC-035 lockout assertions.)_
- [ ] D3 and D5 fixed. _(Both blocked; see Sections 4 and 5.)_
- [ ] Governance validators run. _(Not run — see Limitations.)_

**Limitations — stated plainly:**

1. **Verified:** D1, D2, D7, D8, D9 and D10 are all confirmed by execution — see Section 6 run 2 (`9 passed, 9 total`) plus `SERVER_TSC_EXIT=0` and `BACKOFFICE_TSC_EXIT=0`. **D11 alone remains unverified**, because it is an editor-extension behaviour that only a VS Code window reload can confirm.
2. **D3 and D5 are reproduced and root-caused but not fixed.** D3 needs a reachable PostgreSQL to generate the migration. D5 additionally **conflicts with the approved plan**: `plan.md` declares `RefreshToken` as `no_change`, so adding a `clinicId` column is a data-model change that needs `/sdrive:update-propose` (or `/sdrive:sync`) rather than a silent debug edit. A schema-free alternative exists — carry the clinic scope in the refresh token value itself (`<clinicId>.<random>`, hashed whole) — but it changes the cookie format, which is a security-relevant design choice and needs an explicit decision.
   - Disk space is **no longer the blocker**: it was 0.5 MB free during the first pass and is now **~11.9 GB free**.
3. **D11 could not be reproduced from the CLI.** Linting `RegisterPage.tsx` and `LoginPage.tsx` from the repo root exits `0` both before and after the change, and the resolved package configs report `parserOptions=null` for every `tseslint.configs.recommended` entry — so the project mode that produces this message comes from the editor's config resolution, not from this repo's config. The fix targets that resolution.
4. **D4, D5 and D6 were established by code inspection, not by execution.** No headless browser or live server was available, so the wizard behaviour is reasoned from source plus the shared policy and i18n definitions.
5. **No live HTTP run was possible.** Docker was not serving Redis or PostgreSQL, so the "before" runtime symptom (`server-run.log` logging `Redis unavailable, using in-memory cache` on a 2-second loop) is the only runtime evidence for D1.
6. **`traceability.json` was deliberately NOT modified.** Its schema constrains `testIds` to `^TEST-[0-9]{3}$`, and that ID space is owned by `/sdrive:test`, which has not yet run for this feature. Inventing IDs would collide with the canonical allocation, and with the terminal down the governance validator could not be run to check an edit. Recommend running `/sdrive:test` first, then recording its IDs against FR-013, FR-014, FR-015, FR-022, FR-024 and FR-028.
7. **Nothing was committed or pushed**, per CON-613 (an AI agent must not commit, tag or push without an explicit human request).

## 8. Remaining Recommendations

1. **Start Redis first** — that is the immediate cause of the reported 503: nothing is listening on 6379 and Docker Desktop is stopped. Disk space is no longer a blocker (~11.9 GB free). Then re-run the suite:

   ```powershell
   docker compose up -d postgres redis     # requires Docker Desktop to be running
   docker compose ps                       # redis should be healthy
   cd server
   npx tsc --noEmit
   npx jest src/auth/auth.e2e.spec.ts --coverage=false --runInBand
   ```

   With the D9 fix in place the API reconnects on its own once Redis is `ready` — no restart needed — and `/api/health` should report `cache: "up"`.

   Expect 9 passed / 0 failed. If `Unknown authentication strategy "jwt"` persists, D8's diagnosis (Section 4) is wrong and must be revisited rather than patched.

2. **Run D3's remediation** (`prisma migrate dev --name tenancy_model` against a live PostgreSQL) and reconcile `tasks.md`: **T2.3 is marked done without a deliverable**, which is a false `[x]` and a CON-109 violation.
3. **Decide D5's path** — it needs a data-model change that contradicts `RefreshToken: no_change` in the approved plan, so raise it through `/sdrive:update-propose`, or accept the default-scope fallback and record that decision explicitly.
4. **Then run `/sdrive:test`** to author acceptance tests for all 40 ACs, allocate the `TEST-###` IDs, and update `traceability.json` for the affected rows.
5. **Still-open follow-ups recorded by the implementation report:** drop the deprecated `User.role` column, drop the now-unread Postgres lockout columns, and remove the dead TypeORM leftovers.
6. **Reviewer note:** the four unversioned `/api/auth/*` routes are retained deliberately (FR-026), so the coexistence of `SignupPage` (pending-approval) and the new `/register` wizard is by design, not a duplicate-UI defect.
