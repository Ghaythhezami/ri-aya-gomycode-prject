# Technical Plan — Shared Package (BP-045) v1

> **Spec:** `.sdrive/specs/backlog/shared-package/v1/spec.md`
> **Branch / base:** `feature/bp-045` / `main`

## 1. Approach

Add one new workspace package and touch three existing manifests. The package,
`packages/shared` (`@riaya/shared`), holds a zod schema per shared contract and infers each type from
it, so a field cannot be declared twice. It exports everything from a single entry point,
`src/index.ts`, and nothing else: no client, no React, no message strings, no environment access.

The package is consumed **without a build step**. Both consumers' TypeScript is `module: commonjs` /
`moduleResolution: node` (server) and `moduleResolution: bundler` (backoffice), so a package whose
`package.json` points `main` at TypeScript source works through the workspace's existing resolution
and needs no bundler, no `dist`, and no publish step (NFR-001). That is why the plan does not add a
build script to the package.

The ordering matters: Phase 1 creates the package and proves the workspace resolves it, Phase 2 adds
schemas, Phase 3 wires the two consumers, Phase 4 removes the duplicate. The duplicate removal is
deliberately last, so the shared schema is proven equivalent before the local copy is deleted
(RISK-001).

## 2. Components

| Component                                    | Action | Description                                                                                                                                               |
| -------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/package.json`               | create | `@riaya/shared`, `private`, `main`/`types` at `src/index.ts`, `zod` dependency at the workspace's `^4.6.7` range (FR-001, FR-004).                        |
| `packages/shared/tsconfig.json`              | create | `strict`, `noEmit`, same `typescript` major as the apps; no `rootDir` emission (AC-006).                                                                  |
| `packages/shared/src/index.ts`               | create | The single entry point; re-exports every schema and inferred type (FR-003).                                                                               |
| `packages/shared/src/schemas/*.ts`           | create | One module per contract: auth (login, register, switch-workspace, change-password) and tenancy (invitation, accept-invitation, membership view) (FR-002). |
| `pnpm-workspace.yaml`                        | modify | Add `- packages/*` so the new package is a workspace member (FR-001, AC-001).                                                                             |
| `server/package.json`                        | modify | Add `@riaya/shared: workspace:*` (FR-005). Nothing else changes; `server` keeps class-validator.                                                          |
| `backoffice/package.json`                    | modify | Add `@riaya/shared: workspace:*` (FR-005). `zod` stays as the existing `^4.6.7`.                                                                          |
| `backoffice/src/pages/LoginPage.tsx`         | modify | Replace the locally declared `z.object({ email, password })` with the shared login schema; keep the page's own i18n messages (FR-005, EC-003).            |
| `server/src/auth/dto/login.dto.ts`           | reuse  | Read as the comparison source for AC-007. Not edited: the DTO stays authoritative for the `ValidationPipe` (RISK-004).                                    |
| `server/src/tenancy/dto/register.dto.ts`     | reuse  | Read as the comparison source for AC-008. Not edited.                                                                                                     |
| `server/src/tenancy/dto/invitation.dto.ts`   | reuse  | Read as the shape source for the invitation and accept-invitation schemas. Not edited.                                                                    |
| `backoffice/src/pages/ResetPasswordPage.tsx` | modify | Same local-duplicate treatment as `LoginPage.tsx`: use the shared change-password/reset schema and keep local messages.                                   |
| `.sdrive/skills/`                            | create | Install an approved zod skill directory before any schema code is written (plan `dependencies` names it), per the Discovery procedure.                    |

### Anti-redundancy decisions

- **Reuse, don't recreate:** the eight `class-validator` DTOs under `server/src/**/dto/*.ts` and the
  local zod objects in `backoffice/src/pages/*.tsx` are the existing definitions. This plan does not
  create a second validation layer for the API; it adds a shared description and then removes the
  front-end duplicate.
- **No new package for types:** `server` already exposes response shapes as interfaces
  (`tenancy.service.ts` `MembershipView`, `onboarding.service.ts` `RegisterResponse`). Those become
  schema-derived types in the package rather than a parallel `types` package.
- **`zod` is not re-added:** it already exists in `backoffice` at `^4.6.7` and is pinned by the
  workspace override. The package declares the same range; the consumers do not re-declare it.
- **No `eslint`/`prettier` config in the package:** root `.prettierignore` and the per-app ESLint
  configs already cover the tree; adding a config would be a second source of truth.

## 3. Data model

No database entity is created, updated or removed. The package describes HTTP payload shapes only.

| Entity                 | Action    | Fields                                                                                                                          |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `LoginInput`           | create    | `email: string` (add), `password: string` (add) — mirrors `login.dto.ts`.                                                       |
| `RegisterInput`        | create    | `email`, `password`, `firstName`, `lastName`, `organizationName`, `clinicName`, `preferredLocale?` — mirrors `register.dto.ts`. |
| `SwitchWorkspaceInput` | create    | `clinicId: string` (uuid) — mirrors `switch-workspace.dto.ts`.                                                                  |
| `ChangePasswordInput`  | create    | `currentPassword`, `newPassword` — mirrors `change-password.dto.ts`.                                                            |
| `InvitationInput`      | create    | `email`, `clinicId`, `role` — mirrors `invitation.dto.ts` `InviteDto`.                                                          |
| `MembershipView`       | create    | `id`, `userId`, `clinicId`, `role`, `status` — derived from `MembershipView` in `tenancy.service.ts`.                           |
| Prisma models          | no_change | `User`, `Organization`, `Clinic`, `UserMembership`, `Invitation`, … are untouched.                                              |

Flow: a consumer imports a schema and its inferred type from `@riaya/shared`, validates with
`schema.parse` where it owns the input, and uses the type for the payload it sends or receives. No
data leaves the process differently than before.

## 4. API contracts

No endpoint is added, modified or removed. This feature has no `apiContracts` entries because it
changes no route; that is a deliberate empty list, not an omission.

## 5. Security considerations

| Requirement | Consideration                                                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-002     | The package must not drag a UI dependency into `server`: `packages/shared` declares only `zod`, so `server`'s dependency graph gains one library and no React.                               |
| NFR-003     | No import may reach outside `packages/shared/src`; a lint/typecheck pass over the package is the check, and AC-005 confirms the tree by inspection.                                          |
| NFR-004     | No `process.env`, no `dotenv`, no connection string. The schemas are pure data rules; AC-005 is checked by reading the source. (CON-519)                                                     |
| CON-515     | The API keeps validating through `class-validator` and its `ValidationPipe` settings. The shared schema is **not** substituted into a guard, pipe or interceptor in this version (RISK-004). |
| CON-505     | No token, credential or password literal is added to the schemas or to any fixture; the schemas describe password _rules_, never a value.                                                    |

## 6. Performance considerations

| Requirement | Strategy                                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-001     | No build step and no runtime bundling: consumers resolve TypeScript source through the workspace link, so there is no compile step to keep in sync and no `dist` to rebuild. |
| —           | Package source is typecheck-only (`noEmit`), so it adds no artefact to the server image or the front-end bundles beyond the code that is actually imported.                  |

## 7. Dependencies

| Name            | Type     | Action    | Notes                                                                                                                                                    |
| --------------- | -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| zod             | library  | add       | New dependency of `@riaya/shared` at the workspace override range `^4.6.7`. Skill: zod — provisioned in `.sdrive/skills/` before schema code is written. |
| typescript      | library  | no_change | Already `^5.8.3` in all three apps; the package uses the same major.                                                                                     |
| pnpm workspaces | internal | no_change | `pnpm-workspace.yaml` gains one glob entry; no new tooling.                                                                                              |

## 8. Risks

| Risk                                                                        | Mitigation                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The package reads `main: src/index.ts` and a consumer's tooling refuses it. | Phase 1 ends with a workspace install plus a typecheck of both consumers importing a trivial export, before any schema exists. |
| The shared schema and a `class-validator` DTO disagree after an API change. | FR-007 makes the comparison explicit; AC-007/AC-008 are the checks, and the DTO stays the API's source of truth.               |
| Removing the local login schema breaks a form's message handling.           | EC-003: the consumer keeps its own i18n messages; only the structure moves, and the page is typechecked after the swap.        |
| The package becomes a home for client code or UI strings.                   | FR-006/NFR-003 constrain it, the component table lists exactly what may exist, and AC-005 inspects the tree.                   |
| A second `zod` major enters the workspace through the new dependency.       | FR-004/EC-004 require the override's range; the install is inspected for a single resolved `zod` version.                      |
