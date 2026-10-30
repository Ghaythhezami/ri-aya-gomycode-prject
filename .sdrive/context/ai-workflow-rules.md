# AI Workflow Rules Context

<!-- source: repository discovery, 2026-10-27 -->

## Observed Project Facts

### Version control and commit conventions

- Git hooks are managed by **husky** (`.husky/`), installed via root `prepare: husky`.
- `.husky/pre-commit` contains exactly one line: `pnpm exec lint-staged`.
- `.husky/commit-msg` exists (commit-message validation hook).
- `commitlint.config.cjs` extends `['@commitlint/config-conventional']` → **Conventional Commits are enforced**: `<type>(<scope>): <subject>` with allowed types such as `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Root `lint-staged` config: `"*.{js,jsx,ts,tsx,json,md,css,yml,yaml}": "prettier --write"` — staged files are auto-formatted before commit.

### SpecDrive governance

- SpecDrive is installed (`.sdrive/`, `framework-manifest.json` reports `cliVersion: 0.1.46`).
- Command registry: `.sdrive/commands/manifest.json`, prefix `/sdrive:`.
- `AGENTS.md` mandates: read `.sdrive/commands/manifest.json` → find the matching command → read `agentFile` → follow it exactly → run validators → **stop at human approval gates**.
- `.sdrive/config.json` governance settings:
  - `requireTestEvidence: true`
  - `allowStaleEvidence: false`
  - `requireStructuredReview: true`
- Validators available in `.sdrive/scripts/`: `validate-governance.js`, `validate-config.js`, `verify.js`, `pre-commit.js`, `check-syntax.js`, `check-encoding.js`, `check-docs.js`, `audit-log.js`, `diff-spec.js`, `diff-version.js`, `run-tests.js`, `version-new.js`, `worktree.js`.
- Feature lifecycle directories: `.sdrive/specs/{backlog,ongoing,completed}` — all currently empty.

### Identity and provenance in this repository

- SpecDrive mandates human approval gates before writing governed artifacts and before merging.
- No repository-owned branching policy document exists (no `CONTRIBUTING.md`); the only workflow documentation is `README.md` + `AGENTS.md` + SpecDrive's own agents.

### Environment/runtime conventions observed operationally

- Node runtime on the development machine deviated from `.nvmrc` (`20`): Node v24.20.0 was active.
- Local database was served by a native PostgreSQL 17 service rather than the `docker-compose.yml` container; Docker Desktop was not running.
- Redis was not running; the server degraded to in-memory caching by design.

## Standard Best Practices (from MCP/skills)

- **Context7:** no workflow standards fetched (NestJS documentation only).
- **ux-ui-library MCP:** unavailable.
- **stackwise MCP:** unavailable.
- `@commitlint/config-conventional` is itself the authoritative source for allowed commit types and format (declared in `commitlint.config.cjs`).

### Continuous integration

- `.github/workflows/ci.yml` exists and runs on `push` to `main`/`master` and on every `pull_request`.
- Job `verify` on `ubuntu-latest` executes, in order:
  `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build`.
- Toolchain pinned in CI: `pnpm/action-setup@v4` with `version: 10`, `actions/setup-node@v4` with `node-version: 20` and `cache: pnpm`.
- Consequence: a change that breaks lint, typecheck, tests, or build **cannot merge**. CI enforces exactly the same gates as the local scripts.

> Correction: an earlier revision of this file stated that no CI configuration existed. That was incorrect — `.github/workflows/ci.yml` is present and was detected by the onboarding scan on 2026-10-27.

## Open Items

- Branch naming convention is **[to be confirmed]** — not documented in the repository. The SpecDrive agent templates define `feature/<feature-name>`, which the constitution adopts.
- Merge strategy (squash vs merge commit) is **[to be confirmed]**.
- Required-reviewer count and branch-protection settings are **[to be confirmed]** — configured in GitHub, not in the repository.

## Assumptions

- `main` is the default branch. `[assumption — must be resolved dynamically, never assumed, per SpecDrive]`
- Conventional Commits are mandatory for all commits because commitlint + husky are wired. `[assumption — strongly evidenced by .husky/commit-msg + commitlint.config.cjs]`
