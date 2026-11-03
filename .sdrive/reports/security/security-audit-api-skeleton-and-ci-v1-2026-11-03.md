# Security Audit Report: api-skeleton-and-ci (v1)

## 1. Executive Summary

- **Date:** 2026-11-03
- **Auditor:** AI Security Agent (`/sdrive:secure`)
- **Feature Version:** v1
- **Branch:** `feature/bp-002-bp-003-bp-006-bp-031`
- **Overall Risk Level:** High (was Critical before remediation)
- **Total Vulnerabilities Found:** 26 dependency advisories (Critical: 1, High: 15, Med: 9, Low: 1)

This run was scoped to the one thing review had already recorded as `fail`: the
dependency audit that gates CI. Per the `/sdrive:review` relationship rule, findings
review already recorded were not re-audited from scratch — the analysis was confirmed
to still reproduce, and the work went into remediation.

**Outcome:** the Critical and the entire 12-advisory `tar` chain are cleared. The
audit still exits 1 with 13 advisories (0 Critical, 7 High, 5 Moderate, 0 Low), so the
CI audit step remains red. This is recorded as an open finding, not a pass.

## 2. Threat Model Summary

- **Key Assets:** staff and patient identity data, JWT access/refresh tokens, password
  hashes (argon2), Prisma/Postgres connection credentials.
- **Trust Boundaries:** browser → NestJS API (CORS allow-list, cookies), API → Postgres,
  monorepo build/CI → published dependency artefacts.
- **Relevant surface for this run:** the third-party dependency tree resolved for
  production, which is what `pnpm audit --prod` gates on in CI.

## 3. Vulnerability Details

### VULN-001: `tar` 6.2.1 reached through an unused optional database driver

- **CVSS Score:** 7.5 (Critical per advisory GHSA-23hp-3jrh-7fpw; 11 further High/Moderate advisories on the same node)
- **Location:** `server>typeorm>sqlite3>tar` (12 advisories: GHSA-23hp-3jrh-7fpw, GHSA-34x7-hfp2-rc4v, GHSA-8qq5-rm4j-mr97, GHSA-83g-92jg-28cx, GHSA-qffp-2rhf-9h96, GHSA-9ppj-qmqm-q256, GHSA-r6q2-hw4h-h46w, GHSA-8x88-c5mf-7j5w, GHSA-r292-9mhp-454m, GHSA-vmf3-w455-68vh, GHSA-w8wr-v893-vjvp, GHSA-gvwx-54wh-qm9j)
- **Description:** `typeorm@0.3.31` declares `sqlite3` and `better-sqlite3` as **optional**
  peer dependencies. pnpm's default `autoInstallPeers: true` installs optional peers
  anyway, so `sqlite3` was materialised into the tree even though this application only
  ever connects to Postgres (`type: 'postgres'`).
- **Impact:** not reachable at runtime. `tar` is `sqlite3`'s native-build tooling and the
  production request path never loads it. The residual risk was supply-chain and audit
  hygiene: an unused native dependency shipping a patched-later archiver.
- **Remediation:** set `auto-install-peers=false` in `.npmrc` so optional peers are not
  auto-installed, removed the now-unnecessary `sqlite3` and `better-sqlite3`
  devDependencies, and declared `pnpm.peerDependencyRules.ignoreMissing` for both at the
  workspace root so pnpm no longer reports them as missing. The lockfile was
  regenerated from scratch, which is required — an incremental install reuses the
  previous resolution key.
- **Note:** `tar@6.2.1` is the newest 6.x release, so an `overrides` pin could not have
  fixed this. Removing the node was the only route.
- **Status:** Fixed

### VULN-002: Production-reachable high advisories (remaining, open)

- **Severity:** High
- **Location:** `backoffice>axios>follow-redirects` (GHSA-mrwp-f3q8-3g9p, CVSS 5.9),
  `backoffice>zod` (GHSA-mrhx-c7xc-m3w5, CVSS 7.5),
  `server>@nestjs/platform-express>express>body-parser` (GHSA-27r3-jxmh-p828, CVSS 7.5),
  `server>@nestjs/platform-express>multer` (GHSA-q7qp-rjg7-q26m, CVSS 7.5),
  `server>@prisma/client>prisma>@prisma/config>deepmerge-ts` (GHSA-ggr8-5vv4-36mx)
- **Description:** Five high-severity advisories in packages that _are_ on a real request
  or build path, unlike VULN-001.
- **Impact:** genuinely reachable and not excuseable as tooling-only.
- **Status:** **Open.** Deliberately deferred — the approved scope for this run was
  VULN-001 only, so that any test failure could be attributed to a single change.
  These need a second remediation pass with a re-test.

### VULN-003: Moderate advisories (remaining, open)

- **Severity:** Moderate
- **Location:** `web>next>postcss` (4 advisories), `server>@nestjs/swagger>js-yaml`,
  `server>typeorm>glob`, `server>typeorm>glob>minimatch`
- **Status:** **Open.** Same deferral as VULN-002.

## 4. Security Regression Verification

- [x] Dependency audit re-run after the fix. Advisory count went 26 → 13; Critical 1 → 0;
      the whole `tar` node and its `node-gyp`/`@tootallnate/once` tail are gone.
      **The audit still exits 1** because of VULN-002 and VULN-003.
- [x] Functional tests run after the dependency change: server 13 suites / 72 tests
      passed (1 skipped), web and backoffice passed. `pnpm typecheck` and `pnpm lint`
      both exit 0 (one pre-existing `<img>` warning in `web/src/components/BrandLogo.tsx`).
- [ ] Secret scan **not run in this pass.** Review recorded `secrets: not_verified`;
      no `gitleaks`/`trufflehog` result is claimed here.
- **Limitations:**
  - CVE details were taken from the advisory metadata returned by the audit itself, not
    cross-checked against NVD records this run.
  - The CI job has not been re-run since this change, so the CI audit step is unproven.
  - `sdrive verify` and `validate-governance` were not re-run for this change.

## 5. Security Baseline (CON-51x)

Carried forward from review; only CON-515 was examined again this run.

| ID      | Control              | Status   | Note                                                                                                                                                                                              |
| ------- | -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-511 | Authentication       | PASS     | JWT 15 min + rotating refresh, argon2.                                                                                                                                                            |
| CON-512 | Authorization        | PASS     | `RolesGuard` + `@Roles()`.                                                                                                                                                                        |
| CON-513 | Security Headers     | PASS     | `app.use(helmet())` in `main.ts`.                                                                                                                                                                 |
| CON-514 | Rate Limiting        | PASS     | Global `ThrottlerGuard`.                                                                                                                                                                          |
| CON-515 | Input Validation     | **FAIL** | Global `ValidationPipe` is correct, but `logging.config.ts` hand-validates `process.env` instead of a class-validator DTO. **Not fixed** — explicitly out of scope for this run by user decision. |
| CON-516 | Injection Protection | PASS     | Prisma parameterises; the raw-SQL caller is check-only.                                                                                                                                           |
| CON-517 | XSS Protection       | PASS     | Helmet + React escaping.                                                                                                                                                                          |
| CON-518 | CSRF Protection      | PASS     | HttpOnly `SameSite=Lax` cookie, explicit CORS allow-list.                                                                                                                                         |
| CON-519 | Environment Security | PASS     | `.env` ignored; only `.env.example` tracked.                                                                                                                                                      |
| CON-520 | HTTPS / HSTS         | PASS     | Helmet HSTS; `COOKIE_SECURE`.                                                                                                                                                                     |

CON-515 stays a `FAIL` in the governance record. It is a style/correctness finding, not a
live exploit, and fixing it here would have mixed concerns into the security commit.

## 6. Recommendations

1. Run a second remediation pass for VULN-002 and VULN-003 — a single coordinated bump of
   `zod`, `axios`/`follow-redirects`, `body-parser`, `multer`, `postcss`, then the full
   suite, so CI's audit step can go green and T3.2 can close.
2. Consider `minimumReleaseAge` in `.npmrc` so newly published, possibly compromised
   versions are not adopted immediately — relevant given how VULN-001 arrived.
3. Keel `auto-install-peers=false` as a deliberate decision. It is why the tree is now
   honest; a future contributor flipping it back silently reintroduces a native
   dependency nobody uses.
4. Close CON-515 in its own change so the baseline table is clean before review round 2.
