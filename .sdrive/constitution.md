# Project Constitution

> **Version:** 1.0.0
> **Last Updated:** 2026-10-27
> **Status:** Active

This document is the single source of truth for all project standards, rules, and constraints. All AI agents and developers MUST adhere to these rules.

**Project:** RI'AYA (رعاية) — multilingual clinic and appointment management platform.
**Repository:** pnpm monorepo with three applications: `web`, `server`, `backoffice`.

**Unavailable knowledge sources (recorded for transparency):** the `ux-ui-library` and `stackwise` MCP servers were disabled in this environment, so no external UI/UX or backend-architecture standards were fetched from them. Context7 (`/nestjs/docs.nestjs.com`) was available and is cited where used. Every rule below is traceable to a repository file, to Context7, or is explicitly labelled a Universal Security Default.

---

## 1. Tech Stack & Architecture (CON-1xx)

- **CON-101:** The repository MUST remain a **pnpm workspace** with exactly these packages: `web`, `server`, `backoffice`. Package manager is pinned to `pnpm@10.11.0`; commit `pnpm-lock.yaml` and never introduce a second lockfile or npm/yarn artifacts. <!-- source: .sdrive/context/project-overview.md §Workspace definitions -->
- **CON-102:** The supported Node.js runtime is **Node 20 LTS** (`.nvmrc` = `20`, `engines.node` = `>=20`). Running or targeting a different major requires explicit human confirmation and must be recorded. <!-- source: .sdrive/context/project-overview.md §Identity -->
- **CON-103:** `server` MUST use **Prisma** as its only ORM/data-access layer. `@nestjs/typeorm` and `typeorm` are legacy leftovers with no usages in `src/` and MUST NOT be used for new code; they SHOULD be removed. <!-- source: .sdrive/context/architecture-context.md §Server; resolved conflict C1 -->
- **CON-104:** The API MUST be served under the global prefix **`api`** on `PORT` (default `4000`). OpenAPI documentation MUST be published at `/api/docs`. <!-- source: server/src/main.ts -->
- **CON-105:** Server code MUST follow the established NestJS module layout: one feature folder under `server/src/` per feature, with `dto/` for request/response shapes and cross-cutting primitives in `common/{decorators,filters,guards,validators}`. <!-- source: .sdrive/context/architecture-context.md §Server -->
- **CON-106:** The three applications MUST NOT import from one another's source trees. They integrate exclusively over HTTP using the documented API surface and each app's `.env`-provided base URL. <!-- source: .sdrive/context/architecture-context.md §Repository shape -->
- **CON-107:** Redis is an **optional** dependency. If `REDIS_URL` is unreachable, the server MUST degrade to an in-memory cache and continue serving requests rather than failing startup. <!-- source: server/src/cache/redis-cache.service.ts behaviour; architecture-context.md -->
- **CON-108:** A PostgreSQL connection failure is **fatal by design**: `PrismaService` connects in `onModuleInit`, so the process MUST NOT report itself healthy when the database is unreachable. <!-- source: server/src/database/prisma.service.ts; architecture-context.md -->
- **CON-109:** Schema changes MUST be delivered as **Prisma migrations** for every non-local environment. Schema push (`prisma db push` / `DB_SYNC=true`) is permitted for **local development only** and MUST NOT be the mechanism used to deploy schema changes. <!-- source: resolved conflict C2; server/package.json scripts -->
- **CON-110:** `DATABASE_URL` MUST be the single source of the database connection string consumed by Prisma; the discrete `DB_*` variables MUST NOT be treated as an alternative connection path. <!-- source: server/prisma/schema.prisma; server/.env.example -->
- **CON-111:** Configuration MUST be loaded through `ConfigModule.forRoot({ isGlobal: true })` reading `.env`, and `../.env` as a fallback. Secrets MUST NOT be hard-coded in source, tests, or committed configuration. <!-- source: server/src/app.module.ts; .sdrive/context/code-standards.md §Secrets handling -->

## 2. Coding Standards (CON-2xx)

- **CON-201:** All TypeScript/JavaScript/Markdown/CSS/JSON/YAML MUST be formatted with Prettier using the committed `.prettierrc`: `semi: true`, `singleQuote: true`, `trailingComma: all`, `printWidth: 100`, `arrowParens: always`. <!-- source: .prettierrc -->
- **CON-202:** Files MUST obey `.editorconfig`: UTF-8, LF line endings, 2-space indentation, final newline, no trailing whitespace (Markdown exempt from the trailing-whitespace rule). <!-- source: .editorconfig -->
- **CON-203:** `server` TypeScript MUST compile under `strict: true` with `strictNullChecks` and `noImplicitAny` enabled. Disabling strictness requires explicit human approval. <!-- source: server/tsconfig.json -->
- **CON-204:** Server-internal imports SHOULD use the `@/*` path alias mapped to `src/*`, matching `tsconfig` `paths` and Jest `moduleNameMapper`. <!-- source: server/tsconfig.json, server/jest.config.cjs -->
- **CON-205:** Linting MUST pass with zero warnings: `server` and `backoffice` run ESLint with `--max-warnings=0`. `pnpm lint` MUST succeed before a change is considered complete. <!-- source: server/package.json, backoffice/package.json, root package.json -->
- **CON-206:** `pnpm typecheck` MUST pass for every package before a change is considered complete. <!-- source: root package.json scripts -->
- **CON-207:** Server files MUST use the project's NestJS suffixes: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.guard.ts`, `*.decorator.ts`, `*.filter.ts`, `*.dto.ts`, `*.enum.ts`, `*.spec.ts`. <!-- source: .sdrive/context/code-standards.md §Naming -->
- **CON-208:** `@typescript-eslint/no-explicit-any` is intentionally **off**; `@typescript-eslint/no-unused-vars` is an **error** with `argsIgnorePattern: ^_` — unused parameters MUST be prefixed with `_`. <!-- source: server/eslint.config.mjs -->
- **CON-209:** React components MUST be `PascalCase.tsx` files. The `backoffice` package is ESM (`"type": "module"`); `server` is CommonJS. New files MUST match their package's module system. <!-- source: .sdrive/context/code-standards.md §Naming -->
- **CON-210:** Every commit message MUST follow **Conventional Commits**, enforced by commitlint (`@commitlint/config-conventional`) via Husky. <!-- source: commitlint.config.cjs, .husky/commit-msg -->
- **CON-211:** Staged files MUST be auto-formatted by lint-staged (`prettier --write`) — i.e. code MUST NOT be committed unformatted. Bypassing hooks with `--no-verify` is forbidden. <!-- source: .husky/pre-commit, root package.json lint-staged -->
- **CON-212:** Server build configuration MUST keep `incremental: false` in `tsconfig.build.json`. `nest build` deletes `dist/` each run, so an incremental build state causes silent emission of partial output. <!-- source: server/tsconfig.build.json -->

## 3. UI/UX Standards (CON-3xx)

- **CON-301:** Styling MUST use **Tailwind CSS 4** utility classes — `@tailwindcss/postcss` for `web`, `@tailwindcss/vite` for `backoffice`. Introducing a CSS-in-JS or alternative utility framework requires explicit approval. <!-- source: .sdrive/context/ui-context.md §Applications and styling stack -->
- **CON-302:** Reusable backoffice UI primitives MUST live in `backoffice/src/common/` and MUST be demonstrated on the `/design-system` page (`DesignSystemPage.tsx`). New primitives MUST be added to that page. <!-- source: README.md §Design system; ui-context.md -->
- **CON-303:** The marketing site (`web`) MUST NOT reuse backoffice primitives; the two surfaces have separate component sources by design. <!-- source: README.md §Design system -->
- **CON-304:** Every user-facing string MUST be localised. All three locales — `en`, `ar`, `fr` — MUST stay in parity; a key added to one catalogue MUST be added to all three. <!-- source: .sdrive/context/ui-context.md §Localisation -->
- **CON-305:** Arabic MUST render right-to-left. Layouts MUST be direction-aware; hard-coded physical-direction utilities (`ml-*`, `mr-*`, `left-*`, `right-*`) SHOULD be replaced by logical equivalents (`ms-*`, `me-*`, `start-*`, `end-*`). <!-- source: ui-context.md §Localisation; RTL requirement in README.md -->
- **CON-306:** The backoffice MUST use `react-hook-form` with `@hookform/resolvers` and **Zod** schemas for form validation; ad-hoc validation logic is forbidden. <!-- source: .sdrive/context/ui-context.md §Forms -->
- **CON-307:** Icons MUST come from `lucide-react`; charts in the backoffice MUST use `recharts`. <!-- source: .sdrive/context/ui-context.md §Applications and styling stack -->
- **CON-308:** Adding an icon set, component library, or charting library requires explicit approval and a constitution amendment. <!-- source: ui-context.md; no library beyond the above is declared -->
- **CON-309:** Accessibility conformance targets (e.g. WCAG level), contrast ratios, focus-visibility rules and RTL acceptance criteria are **[to be confirmed]** and MUST be confirmed with the project owner before an accessibility requirement is treated as binding. No accessibility standard may be assumed. <!-- source: ui-context.md §Open Items; resolved conflict C5 -->

## 4. Testing & Quality (CON-4xx)

- **CON-401:** The server test framework is **Jest** (`ts-jest`, `testEnvironment: node`, `testTimeout: 30000`). <!-- source: server/jest.config.cjs -->
- **CON-402:** Server tests MUST be run with `pnpm --filter server test` (equivalently `jest --coverage`). <!-- source: server/package.json -->
- **CON-403:** Server tests MUST be **colocated with the code they test**, named `*.spec.ts`, inside `server/src/` (Jest `rootDir: 'src'`, `testRegex: '.*\\.spec\\.ts$'`). A separate test tree MUST NOT be introduced without approval. <!-- source: server/jest.config.cjs; confirmed at Gate 0 -->
- **CON-404:** Every acceptance criterion MUST have at least one test. <!-- source: SpecDrive -->
- **CON-405:** Test names MUST include the acceptance criterion ID they verify (e.g. `AC-001`). <!-- source: SpecDrive -->
- **CON-406:** Test files MUST follow `server/src/<feature>/<subfeature>.spec.ts`, where `<feature>` matches the SpecDrive feature folder name in kebab-case. This records the project's existing colocated layout rather than a central test folder. <!-- source: SpecDrive; server/jest.config.cjs; Gate 0 decision -->
- **CON-407:** Server coverage MUST meet the configured global thresholds: **lines 80%, statements 80%, functions 70%, branches 50%**. Lowering a threshold requires explicit approval. <!-- source: server/jest.config.cjs -->
- **CON-408:** `backoffice` tests use **Vitest** (`vitest run`). New frontend logic that warrants a test SHOULD add one rather than relying on `--passWithNoTests`. <!-- source: backoffice/package.json -->
- **CON-409:** The `test:e2e` script currently references a non-existent `server/test/jest-e2e.json`. This is a **known defect**: either the config MUST be created or the script removed. It MUST NOT be documented as working. <!-- source: resolved conflict C3 -->
- **CON-410:** `pnpm test` at the repository root MUST pass before a change is considered complete. <!-- source: root package.json -->
- **CON-411:** Tests MUST NOT depend on a live Redis instance; Redis-related tests MUST exercise the degraded in-memory path. <!-- source: server/src/cache/redis-cache.service.spec.ts; CON-107 -->

## 5. Security & Compliance (CON-5xx)

- **CON-501:** AI agents MUST NOT read, modify, or commit files containing secrets or private information. <!-- source: Universal Security Default -->
- **CON-502:** AI agents MUST treat the following file patterns as OFF-LIMITS: `.env`, `.env.*`, `*.pem`, `*.key`, `credentials.json`, `config/secrets/*`, `.git/config`. <!-- source: Universal Security Default -->
- **CON-503:** AI agents MUST respect `.gitignore` patterns and treat ignored files as private and off-limits. <!-- source: Universal Security Default -->
- **CON-504:** If a task requires environment configuration, AI agents MUST create or update `.env.example` only, NEVER `.env` or `.env.local`. <!-- source: Universal Security Default -->
- **CON-505:** AI agents MUST NEVER commit actual secrets, API keys, passwords, or tokens to the repository, even in test files or comments. <!-- source: Universal Security Default -->
- **CON-506:** Development seed credentials (`@riaya.local` accounts) are **local-only** and MUST NOT be reused in any deployed environment. <!-- source: README.md §Development accounts; server/src/database/seeds/seed.ts -->
- **CON-507:** Error responses MUST NOT leak stack traces, ORM errors, or connection strings; all unhandled errors MUST pass through the global `HttpExceptionFilter`. <!-- source: server/src/common/filters/http-exception.filter.ts; server/src/main.ts -->

### Security Baseline (CON-51x)

Every feature that touches authentication, user input, or an HTTP surface MUST address each control below. `/sdrive:propose` expands the REQUIRED controls into concrete tasks; `/sdrive:apply` builds them; `/sdrive:secure` verifies them.

| ID      | Control                      | Status   | Rationale                                                                                                                                       |
| ------- | ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-511 | Authentication               | REQUIRED | JWT access tokens (15 min) + rotating refresh tokens with family revocation, argon2 hashing, and account lockout are implemented.               |
| CON-512 | Authorization                | REQUIRED | `RolesGuard` + `@Roles()` enforce four staff roles (SUPER_ADMIN, CLINIC_ADMIN, DOCTOR, RECEPTIONIST).                                           |
| CON-513 | Security Headers (Helmet)    | REQUIRED | `app.use(helmet())` is applied globally in `main.ts`.                                                                                           |
| CON-514 | Rate Limiting                | REQUIRED | Global `ThrottlerGuard` limits to 60 requests per 60s (1000 in test).                                                                           |
| CON-515 | Input Validation             | REQUIRED | Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`; DTOs use class-validator.                                        |
| CON-516 | NoSQL / Injection Protection | REQUIRED | Prisma parameterises SQL. Raw SQL (`$queryRawUnsafe`) is forbidden unless explicitly reviewed.                                                  |
| CON-517 | XSS Protection               | REQUIRED | Helmet headers plus React/Next.js automatic escaping; `dangerouslySetInnerHTML` requires review.                                                |
| CON-518 | CSRF Protection              | REQUIRED | Refresh token is an HttpOnly `SameSite=Lax` cookie and CORS is an explicit allow-list with `credentials: true`; state-changing routes are POST. |
| CON-519 | Environment Security         | REQUIRED | `.env` files are git-ignored while `.env.example` documents required keys.                                                                      |
| CON-520 | HTTPS / HSTS                 | REQUIRED | Helmet enables HSTS; `COOKIE_SECURE` MUST be `true` outside local development.                                                                  |

<!-- source: SpecDrive Security Baseline; server/src/main.ts; server/src/app.module.ts; server/src/common/guards/*; server/prisma/schema.prisma; README.md §Auth notes -->

## 6. Git Workflow & Process (CON-6xx)

- **CON-601:** All work MUST follow SpecDrive governance: read `.sdrive/commands/manifest.json`, then the referenced agent file, then run the listed validators, and **stop at every human approval gate**. <!-- source: AGENTS.md; .sdrive/commands/manifest.json -->
- **CON-602:** No feature may be marked complete unless `sdrive verify <feature>` returns `pass` or `warn`. <!-- source: SpecDrive -->
- **CON-603:** Every feature MUST have a version folder (`v1`, `v2`, ...) before implementation begins. <!-- source: SpecDrive -->
- **CON-604:** New versions MUST only be created for structural changes (new workflow, new user story, behavior change). Minor edits stay in the current version. <!-- source: SpecDrive -->
- **CON-605:** All agents MUST operate within the feature's `currentVersion` folder only. Older versions MUST NOT be modified. <!-- source: SpecDrive -->
- **CON-606:** ONE BRANCH PER FEATURE (non-negotiable). Each feature MUST be implemented on its own dedicated branch. Two features MUST NEVER share a branch, and a feature MUST NEVER be implemented on another feature's branch. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-607:** The feature branch MUST be named `feature/<feature-name>` using the SpecDrive feature folder name (kebab-case), e.g. `feature/user-login`. If that name is taken, append `-v2`, `-v3`, ... The resolved branch name MUST be reported to the user. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-608:** Agents MUST NEVER implement directly on the repository's default or protected branch. The default branch MUST be resolved dynamically and NEVER assumed to be `main`. Implementing on a protected branch is a blocking violation. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-609:** A feature branch MUST be created from an approved base branch, and the working tree MUST be clean (`git status --porcelain` empty) before any branch switch or creation. A dirty tree MUST block the operation. Creation happens in `/sdrive:propose`, before any spec file is written; `/sdrive:apply` only resumes the recorded branch and MUST NOT create one. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-610:** The feature branch MUST be deleted after its merge is confirmed — locally (`git branch -d`) and on the remote (`git push origin --delete`) — unless the user explicitly declines. The merge target branch MUST NEVER be deleted. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-611:** A branch MUST be merged as a single review unit. `/sdrive:archive` MUST refuse to merge a branch that contains commits belonging to other in-flight features. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-612:** A feature branch MUST be based on the branch it will eventually merge into, so that `git log <target-branch>..<base-branch>` is empty at creation. The base is chosen from the list of available branches and recorded in `/sdrive:propose`, before the spec exists. `/sdrive:apply` and `/sdrive:review` MUST read that recorded base and MUST NOT ask for it again; `/sdrive:archive` merges into it. Basing a feature branch on another in-flight feature's branch stacks the two and makes this feature unarchivable until the other one is merged; that must be reported with its consequences and explicitly confirmed, never done silently. Dependent work MUST become a new version of the same feature (`sdrive version:new`), not a stacked feature. <!-- source: SpecDrive Enterprise Branching Policy -->
- **CON-613:** Commits MUST use Conventional Commits (see CON-210) and MUST NOT bypass Husky hooks. AI agents MUST NOT commit, tag, or push unless the human explicitly requests that specific action. <!-- source: commitlint.config.cjs; .husky/; project owner preference -->

## 7. AI Agent Rules (CON-7xx)

- **CON-701:** AI agents MUST read `.sdrive/commands/manifest.json` before acting on any `/sdrive:*` command and MUST NOT hardcode the command list. <!-- source: AGENTS.md; .sdrive/context/ai-workflow-rules.md -->
- **CON-702:** AI agents MUST stop at every human approval gate defined by the active SpecDrive agent and MUST NOT write governed artifacts before Gate approval. <!-- source: AGENTS.md; ai-workflow-rules.md -->
- **CON-703:** AI agents MUST NOT invent project facts or standards. Unverifiable items MUST be marked `[to be confirmed]` or raised with the user. <!-- source: .sdrive/agents/01-constitution.md rules -->
- **CON-704:** Every generated rule MUST carry a source reference comment (repository path, MCP source, SpecDrive, or Universal Security Default). <!-- source: .sdrive/agents/01-constitution.md rules -->
- **CON-705:** Inferred behaviour MUST be explicitly labelled `assumption` rather than stated as a project fact. <!-- source: .sdrive/agents/01-constitution.md rules -->
- **CON-706:** AI agents MUST consult the knowledge sources available in the environment (`ux-ui-library`, `stackwise`, `context7`) before asserting an external standard, and MUST state which source was unavailable instead of substituting invented standards. <!-- source: .sdrive/agents/01-constitution.md rules -->
- **CON-707:** AI agents MUST NOT edit `.env`, `pg_hba.conf`, generated directories (`dist/`, `.next/`, `node_modules/`), or auto-generated Prisma client output. Environment or infrastructure remediation MUST be delivered as a reviewable script or documented steps instead. <!-- source: project owner instruction; Universal Security Default -->
- **CON-708:** When two rules conflict, or a repository fact contradicts documentation, the agent MUST surface the conflict to the human rather than resolving it silently. <!-- source: .sdrive/agents/01-constitution.md rules -->

---

## Changelog

| Version | Date       | Change Summary                                                                                                                                                             | Source                                      |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1.0.0   | 2026-10-27 | Initial merge — context files created from repository discovery; 74 rules across CON-1xx…CON-7xx; Security Baseline declared; conflicts C1–C5 resolved with owner approval | `.sdrive/context/*.md`, Context7, SpecDrive |
