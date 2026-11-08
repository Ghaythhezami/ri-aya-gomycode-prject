# Security Audit Report: Authentication, Onboarding & Access Control (v2)

## 1. Executive Summary

- **Date:** 2026-11-08
- **Auditor:** AI Security Agent
- **Feature Version:** v2
- **Overall Risk Level:** Low
- **Total Vulnerabilities Found:** 5 (Critical: 2 fixed, High: 0, Medium: 2 open, Low: 1 open)

The two critical advisories were **dev-only `tinypool`** issues inherited from Vitest 3.2.7. They were remediated by upgrading Vitest to 4.1.12. `pnpm audit` now reports **0 critical and 0 high**; the two remaining moderate advisories (`glob`, `minimatch`) and one low advisory (`deepmerge`) are development-tooling only.

## 2. Threat Model Summary

- **Key Assets:** user identities and sessions, clinic-scoped membership and role data, patients and appointments, invitation tokens, clinic settings.
- **Trust Boundaries:** browser ↔ API, API ↔ PostgreSQL/Redis, API ↔ Mailtrap SMTP, developer/test toolchain ↔ repository.
- **Primary threats:** privilege escalation across clinics, invitation-token tampering, cross-organization data disclosure in the overview, secret leakage, vulnerable dev tooling executing untrusted test options.

## 3. Vulnerability Details

### VULN-001/002: `tinypool` prototype-pollution to RCE (dev-only)

- **CVSS Score:** Critical advisory severity; `pnpm audit` did not publish a numeric CVSS score for these entries.
- **Location:** `tinypool@1.1.1` via `vitest@3.2.7` (dev dependency).
- **Description:** Two advisories cover prototype-pollution gadgets in worker options that can lead to remote code execution when a test runner accepts untrusted worker options.
- **Impact:** A developer or CI process that runs Vitest with attacker-influenced options could execute code in the test environment. The package is not part of the production API or browser bundle.
- **Remediation:** Upgraded `vitest` to `^4.1.12`; the resulting lockfile resolves `tinypool` to a patched version. `pnpm audit` confirms **0 critical / 0 high**.
- **Status:** Fixed.

### VULN-003: `glob` AbortSignal cancellation bypass (dev-only)

- **CVSS Score:** Moderate advisory severity; numeric score not supplied by the audit output.
- **Location:** dev dependency tree.
- **Description:** Post-timeout filesystem traversal after an AbortSignal cancellation.
- **Impact:** Dev tooling only; no production request path uses `glob`.
- **Remediation:** No safe in-range upgrade identified in this pass; recorded as an accepted moderate dev-tool risk.
- **Status:** Deferred (dev-only).

### VULN-004: `minimatch` ReDoS via globparts amplification (dev-only)

- **CVSS Score:** Moderate advisory severity; numeric score not supplied by the audit output.
- **Location:** dev dependency tree.
- **Description:** Denial of service through pathological glob patterns.
- **Impact:** Dev tooling only; no production request path uses `minimatch`.
- **Remediation:** No safe in-range upgrade identified in this pass; recorded as an accepted moderate dev-tool risk.
- **Status:** Deferred (dev-only).

### VULN-005: `deepmerge` prototype poisoning (dev-only)

- **CVSS Score:** Low advisory severity.
- **Location:** dev dependency tree.
- **Description:** `mergeObject()` can mutate the prototype of returned objects.
- **Impact:** Dev tooling only.
- **Remediation:** Deferred; tracked by the dependency audit.
- **Status:** Deferred (dev-only).

## 4. Security Baseline (CON-51x)

| Control | Status | Evidence |
| ------- | ------ | -------- |
| CON-511 Authentication | PASS | JWT access/refresh unchanged; guarded routes. |
| CON-512 Authorization | PASS | RolesGuard/capability checks on settings, roles, invitations and workspace. |
| CON-513 Security Headers | PASS | `helmet()` applied globally in `server/src/main.ts`. |
| CON-514 Rate Limiting | PASS | Global ThrottlerGuard protects auth and mutation routes. |
| CON-515 Input Validation | PASS | Global ValidationPipe with whitelist/forbidNonWhitelisted/transform. |
| CON-516 Injection | PASS | Prisma parameterised queries; no new raw SQL. |
| CON-517 XSS | PASS | React escaping and escaped mail-template interpolation. |
| CON-518 CSRF | PASS | Refresh token is HttpOnly SameSite=Lax; mutations are POST/PATCH. |
| CON-519 Environment Security | PASS | `.env` ignored; `.env.example` documents key names only. |

## 5. Security Regression Verification

- [x] Dependency audit re-run: `pnpm audit` — **0 critical, 0 high**, 2 moderate, 1 low (all dev-tooling).
- [x] Secret scan: manual diff scan for private keys, AWS keys and long token patterns — clean; no `gitleaks`/`trufflehog` installed, so the automated-scan limitation is recorded.
- [x] Typecheck and lint: server and backoffice pass.
- [ ] Functional tests: 122/123 backoffice tests pass; the single failure is the pre-existing shared-package boundary test (`packages/shared/main: dist/index.js` vs the archived test expecting `src/index.ts`), unrelated to v2 or this security change.
- **Limitations:** No numeric CVSS scores were published by `pnpm audit` for the two critical advisories; severity is taken from the advisory metadata. No automated secret scanner or SCA dashboard is installed.

## 6. Recommendations

- Add `gitleaks`/`trufflehog` and an SCA step to CI so dependency and secret findings are continuously visible.
- Schedule the remaining `glob`/`minimatch` dev-tool upgrades with the next Vite/Vitest maintenance window.
- Resolve the separate shared-package boundary test/package contract independently of v2.
