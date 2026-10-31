# Security Review: Authentication, Onboarding & Access Control (v1)

- **Date:** 2026-10-31
- **Feature / version:** `authentication-onboarding-and-access-control` / v1
- **Branch / commit:** `feature/auth-onboarding` @ `2b7279c`
- **Reviewer:** `specdrive-review-agent` via `/sdrive:secure`
- **Scope:** authentication, tenancy, invitation and refresh-token handling in `server/src`,
  plus the auth screens in `backoffice/src`. Out of scope: patient/appointment modules
  (not implemented), infrastructure beyond `docker-compose.yml`.

## 1. Method and its limits

| Activity | Performed | Note |
| -------- | --------- | ---- |
| Manual code review of the auth/tenancy surface | ✅ | files listed in §2 |
| Credential-pattern scan of the working tree | ✅ | `AKIA`, `BEGIN … PRIVATE KEY`, `sk_live_`, `password = "…"`; only documented dev fixtures matched |
| Automated secret scanning (`gitleaks`, `trufflehog`) | ❌ | not installed in this environment |
| Dependency CVE lookup (`pnpm audit`, OSV, `exa`) | ❌ | not run — **status unknown**, see R-1 |
| Live penetration test / fuzzing | ❌ | out of scope for this review |
| Unit / integration test evidence | ✅ | `test-evidence.json`: exit 0, 0 failed, 51 tests |

This report must therefore be read as a **code-level audit**. The absence of a finding is not
proof of absence of a vulnerability, and R-1 records that gap explicitly.

## 2. Controls verified

| # | Control | Implementation | Evidence |
| - | ------- | -------------- | -------- |
| 1 | Password storage | argon2 hash/verify, no plaintext or reversible form | `auth/auth.service.ts:84,196,252`; `tenancy/onboarding.service.ts:76,242`; `users/users.service.ts:52` |
| 2 | Refresh-token storage | only a SHA-256 digest is persisted; the raw token never touches the store | `auth/auth.service.ts:42` |
| 3 | Invitation-token storage | same digest-at-rest pattern; single use | `tenancy/onboarding.service.ts:42`; `AC-016`, `AC-017` tests |
| 4 | Refresh cookie | `HttpOnly`, `SameSite=Lax`, `path=/api/auth`, `Secure` when `COOKIE_SECURE=true` or `NODE_ENV=production` | `auth/auth.service.ts:268-286` |
| 5 | Access-token lifetime | 15 min, returned in the body and held only in memory by the backoffice | `README.md` auth notes; `jwt.strategy.ts` |
| 6 | Token-family revocation | reusing a rotated token revokes the whole family | `AC-005`, `AC-007` tests |
| 7 | Tenant isolation | scope resolved **only** from the access token (`org_id`, `clinic_id`, `role`), never from body/query | `FR-004`; `AC-024`, `AC-025`; `switch-workspace.e2e.spec.ts:119` |
| 8 | Privilege model | role is per membership, not per identity; suspension revokes live tokens and protects the last `SUPER_ADMIN` | `AC-022`, `AC-023`; `suspension.e2e.spec.ts` |
| 9 | Brute force | global throttle 60/min, stricter per-endpoint limits on auth routes; lockout after 5 failures in 10 min for 15 min | `app.module.ts:19-23`; `auth/auth.controller.ts:15-23`; `AC-008` |
| 10 | Fail-closed security state | lockout/blacklist reads use strict Redis access and return `503 SECURITY_STATE_UNAVAILABLE` rather than degrading to an in-memory map | `cache/redis-cache.service.ts:75-80`; `AC-031` |
| 11 | Error-message hygiene | login failures return a generic message that never names the field or reveals account existence; reset requests behave identically for unknown accounts | `AC-006`, `AC-028` tests |
| 12 | Input validation | global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` | `main.ts:31-33`; `AC-003` |
| 13 | Security headers | `helmet()` on every response | `main.ts:15` |
| 14 | Audit trail | append-only rows written in the same transaction as the mutation | `AC-019`, `AC-020`; `audit-trail.e2e.spec.ts` |
| 15 | Registration abuse | public `/register` creates an organization, so it carries its own stricter throttle; `/signup` is retired (410, writes nothing) | `auth/auth.controller.ts`; `AC-043`, `AC-045` |
| 16 | Secrets in config | JWT secret and cookie flags come from environment; `.env` is gitignored, `.env.example` carries placeholders only | `.gitignore`, `server/.env.example` |

## 3. Findings

No **critical** or **high** severity vulnerability was found in the reviewed surface. The items
below are gaps in assurance and hardening, not confirmed exploits.

| # | Severity | Finding | Recommendation |
| - | -------- | ------- | -------------- |
| R-1 | **Medium** | Dependency vulnerability status is **unknown**: no `pnpm audit` / OSV lookup was performed, and the report cannot certify the lockfile. | Add `pnpm audit --prod` (or OSV-Scanner) to CI and fail on high/critical. |
| R-2 | **Medium** | No automated secret scanning in the pipeline. Detection here was a manual pattern grep. | Add `gitleaks` (or equivalent) as a pre-commit and CI step. |
| R-3 | Medium | No CI run exists for this branch, so the security-relevant suites have never run in a clean, automated environment — only locally. | Push to the remote that owns `.github/workflows/ci.yml` and require the run (review criterion C16). |
| R-4 | Low | Invitation and password-reset delivery is stubbed in development; tokens are handed to a mail service that writes them where a developer can read them. | Ensure the production mail transport never logs the token, and keep the dev stub out of production config. |
| R-5 | Low | Rate limits are relaxed when `NODE_ENV=test` (`limit: 1000`). Acceptable, but a mis-set environment would silently disable throttling. | Fail the boot when `NODE_ENV` is missing rather than defaulting to a relaxed profile. |
| R-6 | Low | Access tokens are long-lived enough (15 min) that a stolen token is usable until expiry; there is no per-request revocation check on the access token itself. | Acceptable for the stated 15-minute window; document it as a deliberate trade-off. |

## 4. Threat review (auth/tenancy specific)

| Threat | Control in place | Verdict |
| ------ | ---------------- | ------- |
| Credential stuffing | global + per-endpoint throttles, lockout after 5 failures | mitigated |
| User enumeration | generic login errors; identical reset responses; duplicate-email conflict only on registration where the visitor supplied the address | mitigated |
| Cross-tenant data access | tenant scope from the signed token only; memberships checked on switch | mitigated (tests `AC-024`, `AC-025`) |
| Stolen refresh token reuse | rotation + family revocation + Redis blacklist with TTL | mitigated (`AC-005`, `AC-040`) |
| Invitation replay | single-use, hashed at rest, revoked when superseded | mitigated (`AC-016`, `AC-017`) |
| Redis outage disabling lockout | strict reads fail closed with `503` | mitigated (`AC-031`) |
| Suspended staff retaining access | live tokens revoked, fresh login yields no scope | mitigated (`AC-022`, `AC-023`) |
| Privilege escalation by removing the last admin | suspension refuses when it would leave zero `SUPER_ADMIN` | mitigated (`FR-029`) |
| Token forgery | HS256 with a 32+ character secret from env; strategy validates signature and claims | mitigated (no key rotation, see R-6) |

## 5. Verdict

- **Code-level posture:** acceptable for release of this feature. All sixteen reviewed controls
  are implemented and covered by tests; the auth error surface leaks nothing, tenant scope cannot
  be widened from the request body, and security state fails closed when Redis is gone.
- **Assurance gaps:** R-1 and R-2 mean this is not a substitute for an automated pipeline scan,
  and R-3 means the suites have never run in CI for this branch.

Signed-off-by: `specdrive-review-agent` (automated review; a human owner must still accept the
residual risks in §3 before release).

