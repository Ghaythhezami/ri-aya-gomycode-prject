# Code Standards Context

<!-- source: repository discovery, 2026-10-27 -->

## Observed Project Facts

### Formatting — Prettier (`.prettierrc`)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

`.prettierignore` exists at repository root.

### Editor defaults (`.editorconfig`)

- `charset = utf-8`
- `end_of_line = lf`
- `indent_style = space`, `indent_size = 2`
- `insert_final_newline = true`
- `trim_trailing_whitespace = true`
- Markdown exception: `trim_trailing_whitespace = false`

### TypeScript — `server/tsconfig.json`

- `strict: true`, `strictNullChecks: true`, `noImplicitAny: true` — strict mode is enforced.
- `target: ES2022`, `module: commonjs`, `outDir: ./dist`, `rootDir: ./src`.
- `experimentalDecorators: true`, `emitDecoratorMetadata: true` — required by NestJS DI.
- `forceConsistentCasingInFileNames: true`.
- Path alias `@/*` → `src/*` (`baseUrl: ./`).
- `skipLibCheck: true`, `incremental: true`.

`server/tsconfig.build.json` extends the above and sets `incremental: false`, excluding `node_modules`, `dist`, `test`, `**/*spec.ts`. The file contains an explicit comment explaining why: `nest build` deletes `dist/` each run, so a stale incremental state causes TypeScript to report "0 errors" while emitting only changed files, leaving `dist/main.js` missing.

### Linting

- `server/eslint.config.mjs` — flat config: `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier`, globals `node` + `jest`. Rules: `@typescript-eslint/no-explicit-any: off`, `@typescript-eslint/no-unused-vars: error` with `argsIgnorePattern: ^_`.
- `backoffice/eslint.config.js` — `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`.
- `web/eslint.config.mjs` — `eslint-config-next`.
- Lint scripts are strict: `server` and `backoffice` run with `--max-warnings=0`.

### Testing — `server/jest.config.cjs`

- `rootDir: 'src'`, `testRegex: '.*\\.spec\\.ts$'` → **tests are colocated with source**, named `*.spec.ts`.
- Transform: `ts-jest`. Environment: `node`. `setupFiles: ['<rootDir>/test-setup.ts']`.
- `moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' }` — mirrors the TS path alias.
- `testTimeout: 30_000`.
- Coverage: `collectCoverageFrom` targets `auth/**`, `cache/**`, `common/validators/**` (excluding `*.spec.ts`, `auth/dto/**`, `auth/entities/**`), output `../coverage`.
- Coverage thresholds (global): **lines 80, statements 80, functions 70, branches 50**.
- `server/package.json`: `test` = `jest --coverage`; `test:e2e` = `jest --config ./test/jest-e2e.json --runInBand`.

**Note:** `server/test/jest-e2e.json` does **not exist**, and `server/test/` is empty — yet `server/src/auth/auth.e2e.spec.ts` exists and is picked up by the default `testRegex`. So `test:e2e` is currently **broken** while `test` covers that file.

### Testing — other apps

- `backoffice`: `vitest run --passWithNoTests`; no test files exist yet.
- `web`: `test` prints `web: no unit tests`.

### Testing — existing specs

- `server/src/auth/auth.e2e.spec.ts`
- `server/src/cache/redis-cache.service.spec.ts`
- `server/src/common/validators/password-strength.spec.ts`

### Naming and structure conventions observed

- NestJS file suffixes: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.guard.ts`, `*.decorator.ts`, `*.filter.ts`, `*.dto.ts`, `*.enum.ts`, `*.spec.ts`.
- One feature per folder under `server/src/`; `dto/` subfolder for request/response shapes.
- React components in `PascalCase.tsx` (e.g. `LoginPage.tsx`, `DesignSystemPage.tsx`).
- Cross-app TypeScript: `backoffice` uses `"type": "module"` (ESM); `server` is CommonJS.

### Scripts (authoritative command list)

| Scope        | Command                                             | Effect                                                             |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------ |
| root         | `pnpm dev`                                          | all three apps via `concurrently`                                  |
| root         | `pnpm build`                                        | `pnpm -r --if-present run build`                                   |
| root         | `pnpm lint`                                         | `pnpm -r --if-present run lint`                                    |
| root         | `pnpm test`                                         | `pnpm -r --if-present run test`                                    |
| root         | `pnpm typecheck`                                    | `pnpm -r --if-present run typecheck`                               |
| root         | `pnpm format` / `format:check`                      | Prettier write / check                                             |
| `server`     | `start:dev`                                         | `nest start --watch`                                               |
| `server`     | `build`                                             | `nest build`                                                       |
| `server`     | `typecheck`                                         | `tsc --noEmit`                                                     |
| `server`     | `test`                                              | `jest --coverage`                                                  |
| `server`     | `seed`                                              | `ts-node -r tsconfig-paths/register src/database/seeds/seed.ts`    |
| `server`     | `prisma:push` / `prisma:generate` / `prisma:studio` | Prisma operations                                                  |
| `server`     | `migration:generate` / `migration:run`              | `prisma migrate dev` / `prisma migrate deploy`                     |
| `web`        | `dev` / `build` / `start`                           | Next.js on port 3000                                               |
| `backoffice` | `dev` / `build`                                     | Vite; build runs `tsc --noEmit -p tsconfig.app.json && vite build` |

### Secrets handling observed

- `.env.example` files exist for all three apps; `.env` is present locally and git-ignored.
- `docker-compose.yml` contains non-secret local defaults (`riaya`/`riaya`).
- Seed script contains dev-only credentials for local users; `README.md` documents them openly as local-only.

## Standard Best Practices (from MCP/skills)

- **Context7 (`/nestjs/docs.nestjs.com`):** DTO validation via `ValidationPipe` and guard-based authorization are the framework-standard approach; the project already applies both globally/locally.
- **ux-ui-library MCP:** unavailable.
- **stackwise MCP:** unavailable.

## Assumptions

- `@/*` path aliases are the preferred import style inside `server/src`. `[assumption]`
- New server code follows the existing `*.spec.ts` colocated convention rather than a separate test tree (confirmed by the user at Gate 0). `[assumption — user-confirmed]`
