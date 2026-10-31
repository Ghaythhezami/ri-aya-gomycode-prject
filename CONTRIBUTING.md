# Contributing to RI'AYA

> Derived from the repository's actual tooling on 2026-10-27. Where a convention is not
> enforced by tooling, it is marked **[to be confirmed]** rather than stated as a rule.

## Prerequisites

- **Node.js 20 LTS** — pinned in `.nvmrc` (`20`) and in CI (`setup-node` `node-version: 20`).
  Matching `engines.node: ">=20"` in the root `package.json`.
- **pnpm 10** — `packageManager: "pnpm@10.11.0"`; CI uses `pnpm/action-setup@v4` with `version: 10`.
  Install via `corepack enable` or `npm i -g pnpm@10`.
- **PostgreSQL** — required by `server`. See [Local development](#local-development).

## Repository layout

| Path          | Package      | Description                                                   |
| ------------- | ------------ | ------------------------------------------------------------- |
| `web/`        | `web`        | Next.js 15 marketing site + locale routing (`en`, `ar`, `fr`) |
| `server/`     | `server`     | NestJS 11 API (`/api`), Prisma + PostgreSQL, Redis cache      |
| `backoffice/` | `backoffice` | React 19 + Vite staff application                             |

The three packages never import each other's source; they communicate over HTTP.

## Setup

```bash
pnpm install
```

Environment files are **not** committed. Copy the examples and fill in your own values:

```bash
cp server/.env.example server/.env
cp web/.env.example web/.env
cp backoffice/.env.example backoffice/.env
```

Never commit `.env`. Only `.env.example` belongs in version control.

### Local development

```bash
pnpm dev          # all three apps (web :3000, server :4000, backoffice :5173)
pnpm dev:web
pnpm dev:server
pnpm dev:backoffice
```

Database:

```bash
pnpm --filter server prisma:push   # local only — sync schema
pnpm --filter server seed          # create local dev users
```

Non-local environments use migrations, not `db push`:

```bash
pnpm --filter server migration:generate   # prisma migrate dev
pnpm --filter server migration:run        # prisma migrate deploy
```

## Quality gates

These are the same commands CI runs. Run them before opening a pull request:

```bash
pnpm lint         # ESLint, --max-warnings=0 for server and backoffice
pnpm typecheck    # tsc --noEmit in every package
pnpm test         # Jest for server, Vitest for backoffice
pnpm build        # every package
pnpm format:check # Prettier verification
```

A pull request cannot merge while any of these fail.

## Commit messages

**Conventional Commits are enforced.** `commitlint` extends
`@commitlint/config-conventional` and runs through the Husky `commit-msg` hook.

```
<type>(<optional scope>): <subject>
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`, `revert`. Example: `feat(auth): add refresh token rotation`.

Hooks also run `lint-staged` on commit, which formats staged files with Prettier. Do not
bypass hooks with `--no-verify`.

## Code conventions

- **Formatting** — Prettier: single quotes, semicolons, trailing commas, 100-char lines.
- **Editor** — UTF-8, LF, 2 spaces, final newline, no trailing whitespace (Markdown exempt).
- **TypeScript** — `strict: true` in `server`; no implicit `any`; null checks on.
- **Imports** — `@/*` alias maps to `server/src/*`, mirrored in the Jest `moduleNameMapper`.
- **Naming** — NestJS suffixes (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.guard.ts`,
  `*.dto.ts`, `*.spec.ts`); React components are `PascalCase.tsx`.
- **Module systems** — `server` is CommonJS, `backoffice` is ESM (`"type": "module"`).

## Tests

- Server tests are **colocated** with the code: `server/src/<feature>/<file>.spec.ts`.
- Run with `pnpm --filter server test` (Jest, `--coverage`).
- Coverage thresholds: lines 80%, statements 80%, functions 70%, branches 50%.
- Backoffice uses Vitest. `web` currently has no unit tests.

> **Known defect:** `server/package.json` defines `test:e2e` pointing at
> `server/test/jest-e2e.json`, which does not exist. Use `pnpm --filter server test`
> until that is fixed or the script is removed.

## Database and secrets

- `server/.env` and all `.env*` files are git-ignored and off-limits to automated tooling.
- `docker-compose.yml` provides a local Postgres (`riaya`/`riaya`, db `riaya`, port 5432)
  with non-secret development defaults only.
- Seed accounts (`*@riaya.local`) are **local-only** and must never be reused elsewhere.
- Redis is optional: without it the API degrades to an in-memory cache.

## Branching and review

- Feature work uses SpecDrive (`/sdrive:*` commands); see `AGENTS.md`.
- One branch per feature — `feature/<feature-name>` (kebab-case).
- Never commit directly to the default branch.
- Base branch: choose the branch the feature will merge into, and record it before
  implementation starts.
- **Merge strategy: [to be confirmed]** — not documented in the repository.
- **Required reviewers / branch protection: [to be confirmed]** — configured in GitHub
  settings, not in the repository.

## Spec-driven development

This project uses **SpecDrive**. Before starting a feature:

1. Read `.sdrive/constitution.md` — it is the single source of truth for standards.
2. Use `/sdrive:propose` to create the specification, plan, and tasks.
3. Use `/sdrive:apply` to implement approved tasks.
4. Use `/sdrive:review` before merging.

Stop at every human approval gate the SpecDrive agents define.

### Local SpecDrive customisations

`/sdrive:archive` (and `sdrive sync`) re-installs the framework and **overwrites any file
whose hash no longer matches `.sdrive/framework-manifest.json`**. Two files here are
deliberately modified, so after any CLI upgrade:

1. Re-apply or verify the customisation.
2. Write its current hash into `framework-manifest.json` under `files` — otherwise the next
   sync treats it as stale and restores the stock version.

| File                                  | Why it is customised                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.sdrive/scripts/verify.js`           | Adds NestJS decorator detection, `.prisma` and the `backoffice`/`web` roots. Stock scans `server` only, which drops verification to 4 matched / 101 missing.                                                                                                                               |
| `.sdrive/commands/gates.js`           | `commitStillDescribesHead()` compares the recorded commit's **tree** with HEAD, ignoring `.sdrive/`. Stock compares `commit === HEAD`, which makes `review.json` impossible to commit (a file cannot contain its own hash) and leaves archiving only satisfiable with an uncommitted tree. |
| `.sdrive/scripts/lib/product-plan.js` | Treats a dependency cell with no letter or digit as "no dependency". Stock matches only `[-—–]`, so the double-encoded em-dash this backlog actually contains (`â€”`) was read as an outside blocker — making BP-001 ineligible and blocking the whole `start` wave.                       |

Changing either stops the gate from doing what it was patched to do:

```bash
node --test .sdrive/test/gates-binding.test.js      # 7 tests: governance-only commit is valid,
                                                    # source/test change is stale, bad input fails closed
node --test .sdrive/test/product-plan-deps.test.js  # 7 tests: dash placeholders (incl. mojibake)
                                                    # never block an item; ids, ranges, blockers intact
sdrive verify authentication-onboarding-and-access-control   # expect 105 matched, 0 missing
```

`test-evidence.json` is git-ignored on purpose: committing it would move HEAD and make the
evidence it records stale by definition.
