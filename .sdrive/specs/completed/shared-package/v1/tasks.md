# Tasks — Shared Package (BP-045) v1

> **Plan:** `.sdrive/specs/backlog/shared-package/v1/plan.md`
> **Branch:** `feature/bp-045` → `main`
>
> Tests are **not** tasks in this list. They are authored by `/sdrive:test` against AC-001…AC-008
> and attached through `traceability.json` `testIds`; implementation tasks end at the verify step.

## Phase 1 — Workspace plumbing

**P1 gives the package a home and proves the workspace link, before any schema exists.**

- [x] **T1.1 — Add the private shared package manifest**
  - `packages/shared/package.json`: name `@riaya/shared`, `private: true`, `version 0.1.0`,
    `main` and `types` both `src/index.ts`, `zod` dependency at the `pnpm-workspace.yaml` override
    range (`^4.6.7`), `typescript` dev dependency at the apps' major (`^5.8.3`). No scripts that
    build or emit.
  - Requirements: FR-001, FR-004, FR-006 · Acceptance: AC-001, AC-003, AC-006

- [x] **T1.2 — Register the package as a workspace member**
  - Add `- packages/*` to `pnpm-workspace.yaml` packages, leaving `overrides` and every existing
    entry untouched. Update the lockfile through the workspace install; do not hand-edit it.
  - Requirements: FR-001, FR-007 · Acceptance: AC-001

- [x] **T1.3 — Add the package tsconfig**
  - `packages/shared/tsconfig.json`: `strict`, `noEmit`, `target ES2022`, `module`/`moduleResolution`
    compatible with both consumers, `include: ["src/**/*"]`.
  - Requirements: FR-006 · Acceptance: AC-006

- [x] **T1.4 — Create the single entry point and prove resolution**
  - `packages/shared/src/index.ts` with one placeholder export; add `@riaya/shared: workspace:*` to
    `server/package.json` and `backoffice/package.json`; install with the workspace's package manager;
    import the placeholder from both apps and typecheck each. Only the trivial import is temporary:
    it is replaced by the real re-exports in T2.4.
  - Requirements: FR-003, FR-005, FR-007 · Acceptance: AC-002, AC-003, AC-004

## Phase 2 — Schemas and types

**Depends on P1.**

- [x] **T2.1 — Add the auth input schemas** (skill: zod)
  - `src/schemas/auth.ts`: `loginSchema`, `registerSchema`, `switchWorkspaceSchema`,
    `changePasswordSchema`, each a `z.object` whose rules mirror the corresponding
    `server/src/auth/dto` and `server/src/tenancy/dto/register.dto.ts` (email format, password length,
    uuid clinic id, optional preferred locale).
  - Requirements: FR-002, FR-003 · Acceptance: AC-007, AC-008

- [x] **T2.2 — Add the tenancy schemas**
  - `src/schemas/tenancy.ts`: `invitationSchema` and accept-invitation payload mirroring
    `server/src/tenancy/dto/invitation.dto.ts`, including the role enum values the API accepts.
  - Requirements: FR-002 · Acceptance: AC-008

- [x] **T2.3 — Add the membership view schema**
  - `src/schemas/membership.ts`: `membershipViewSchema` mirroring `MembershipView` in
    `server/src/tenancy/tenancy.service.ts`, and `registerResponseSchema` only if the response type is
    consumed outside the app.
  - Requirements: FR-002, FR-003 · Acceptance: AC-008

- [x] **T2.4 — Replace the placeholder with the real exports**
  - `src/index.ts` re-exports every schema and every inferred type (`z.infer`); each type is derived,
    never re-declared. Typecheck the package and both consumers.
  - Requirements: FR-003, NFR-005 · Acceptance: AC-002, AC-004, AC-006

## Phase 3 — Consumer wiring

**Depends on P2.**

- [x] **T3.1 — Use the shared login schema in the back office**
  - `backoffice/src/pages/LoginPage.tsx`: remove the local `z.object({ email, password })` and import
    the shared schema plus its inferred type. The page keeps its own i18n error messages and its
    submit handling unchanged.
  - Requirements: FR-005, FR-008 · Acceptance: AC-004

- [x] **T3.2 — Use the shared schema on the reset-password page**
  - `backoffice/src/pages/ResetPasswordPage.tsx`: same swap where a local object duplicates
    `change-password.dto.ts` or `reset-password.dto.ts`; local messages are preserved.
  - Requirements: FR-005, FR-008 · Acceptance: AC-004

- [x] **T3.3 — Make sure no local duplicate remains**
  - Search `backoffice/src` and `web/src` for any other `z.object` that restates an API DTO. Move
    only the ones that match a shared schema; report the rest rather than inventing new schemas.
  - Requirements: FR-005 · Acceptance: AC-004

## Phase 4 — Verification

**Depends on P3.**

- [x] **T4.1 — Confirm one resolved zod major**
  - Inspect the installed dependency tree for `zod`: a single version, matching the override range;
    no second major anywhere.
  - Requirements: FR-004 · Acceptance: AC-003

- [x] **T4.2 — Check the package's boundary**
  - Read the whole `packages/shared` tree: no `process.env`, no network client, no React, no
    message strings, no import reaching outside `src`. Record the file list that proves AC-005.
  - Requirements: FR-006, NFR-003, NFR-004 · Acceptance: AC-005

- [x] **T4.3 — Run the apps' checks that cover the change**
  - `server`: typecheck plus the existing auth/tenancy unit suites (unchanged behaviour is the point);
    `backoffice`: typecheck and lint. Report any check that cannot run as a limitation.
  - Requirements: FR-007, NFR-001 · Acceptance: AC-006, AC-007, AC-008

- [x] **T4.4 — Confirm the API still validates through class-validator**
  - Verify no guard, pipe or interceptor now depends on the package, and that a malformed login still
    fails with the API's existing 400 shape (CON-515, RISK-004).
  - Requirements: NFR-002, NFR-003 · Acceptance: AC-007
