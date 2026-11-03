---
title: Shared package
status: backlog
created: 2026-11-03
updated: 2026-11-03
---

# Specification — Shared Package (BP-045)

> **Product item:** `BP-045` · Priority P2 · Brief task FND-4 (proposed)
> **Branch / base:** `feature/bp-045` / `main`
> **Promotion:** the backlog row moved `deferred` → `backlog` in this change. `deferred` recorded a
> planning-time preference ("offered as FND-4 during planning and not adopted"), not missing access.

## 1. Overview

### Problem statement

The request and response contract of the API is written four separate times today:

- `server/` declares eight DTOs with `class-validator` decorators (`auth/dto/*.ts`,
  `tenancy/dto/invitation.dto.ts`, `tenancy/dto/register.dto.ts`, `users/dto/create-user.dto.ts`);
- the API answers with hand-built object literals (`tenancy.service.ts` `MembershipView`,
  `onboarding.service.ts` `RegisterResponse`);
- `web/` reaches for those answers through `fetch` with no shared type;
- `backoffice/` re-declares the shape of the same forms locally — `LoginPage.tsx` builds a local
  `z.object({ email, password })` with its own messages, which is the same contract as
  `server/src/auth/dto/login.dto.ts` written a second time.

The consequences are already visible rather than hypothetical: the client-side rule in `LoginPage.tsx`
and the server-side rule in `login.dto.ts` can drift apart with nothing to notice, and a field renamed
on the API surfaces as a runtime surprise in a page instead of a compile error. BP-008's identity and
tenancy DTOs are now in use by both ends, which is the moment the backlog said to revisit this item.

### Proposed solution

1. Add a workspace package `packages/shared` (`@riaya/shared`) whose `src/` holds one zod schema per
   shared contract, with the TypeScript type inferred from each schema so the schema is the single
   definition and the type cannot drift from it.
2. Keep the package to **schemas and inferred types only**. No API client, no React, no transport
   code, no UI strings.
3. Publish the schemas from the package root so a consumer imports
   `{ loginSchema, type LoginInput }` from one place.
4. Register `packages/shared` as a pnpm workspace package and consume it from `server/` and
   `backoffice/`, the two places that already have `zod` available.

### Target audience

- The API author, who gets one definition to validate against instead of a decorator list to keep in
  sync with a form.
- The front-end author, who gets a compile error when the contract moves instead of a runtime one.
- Reviewers, who can read a contract in one file rather than diff three.

### Assumptions

- **The shared contract covers DTOs, not entities.** The package describes what crosses the HTTP
  boundary. Prisma models and database columns stay in `server/`.
- **`server/` keeps its class-validator DTOs in this version.** Nest's `ValidationPipe` with
  `whitelist` and `forbidNonWhitelisted` (CON-515) is built around classes and decorators, so the
  package does not replace them here. The schema is added alongside, and making the API validate
  through zod is a decision for a later version, not this one.
- **`web/` is not a consumer in this version.** `web/package.json` has no `zod`, and adding a
  dependency to a second front end is scope the item does not ask for. The package is built so `web/`
  can adopt it without changing it.
- **The first schemas are the ones both ends already share:** login, register, switch-workspace,
  change-password, and the invitation/membership views. Anything used by one consumer only stays
  where it is.
- **UI-facing validation messages are not shared.** Each front end keeps its own i18n keys (BP-005,
  BP-013 own message text); schemas carry structural rules, and a consumer supplies its own messages
  where a message is needed.
- The repository is a pnpm workspace listing `web`, `server`, `backoffice` (`pnpm-workspace.yaml`),
  and the root `package.json` has no `bin` or build step for packages.

### Out of scope

- API client functions, fetch wrappers, hooks or stores.
- Replacing `class-validator` DTOs, or changing any controller signature.
- Adding `zod` to `web/` or changing its dependency set.
- Sharing database entity types or Prisma-generated types.
- Response envelope design, error-code taxonomy, or OpenAPI generation from the schemas.
- Publishing the package to a registry; it is a workspace package only (CON-509-adjacent: no release
  pipeline is added).

## 2. User stories and acceptance criteria

### US-001 — One definition of the shared contract

**As a** developer, **I want** the DTOs both ends use defined once, **so that** a contract change is a
compile error rather than a runtime surprise.

| AC     | Criterion                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-001 | Given the repository, when I add `packages/shared` to `pnpm-workspace.yaml` and run the install, then pnpm recognises `@riaya/shared` as a workspace package and the existing three apps still install. |
| AC-002 | Given the package, when I import a shared schema in `server/` and in `backoffice/`, then both resolve to the same declaration and neither app keeps a second hand-written copy of that contract.        |

### US-002 — Types inferred, never duplicated

**As a** developer, **I want** the type to come out of the schema, **so that** the two cannot disagree.

| AC     | Criterion                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-003 | Given a schema in the package, when I inspect its exported type, then that type is inferred from the schema (`z.infer`) and no field is declared a second time by hand alongside it. |
| AC-004 | Given a field is removed from a schema, when the affected app is typechecked, then the typecheck fails at the code that used that field.                                             |

### US-003 — A package with no hidden surface

**As a** reviewer, **I want** the package to be schemas and types only, **so that** it cannot grow a second transport or UI layer.

| AC     | Criterion                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-005 | Given `packages/shared/src`, when I inspect it, then it contains schema and type modules only — no HTTP client, no React import, no message strings, no environment or secret access. |
| AC-006 | Given the package is built and typechecked, when I run the workspace typecheck, then it passes with the same `typescript` major version the apps use.                                 |

### US-004 — The shared rules still agree with the API

**As a** maintainer, **I want** the shared schema to match what the API actually accepts, **so that** the package describes reality.

| AC     | Criterion                                                                                                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-007 | Given the login DTO in `server/src/auth/dto/login.dto.ts`, when I compare it with the shared login schema, then every field, optionality and structural constraint matches.             |
| AC-008 | Given the register DTO in `server/src/tenancy/dto/register.dto.ts`, when I compare it with the shared register schema, then every field, optionality and structural constraint matches. |

## 3. Functional requirements

- **FR-001:** The repository MUST contain a workspace package `packages/shared` named `@riaya/shared`, listed in `pnpm-workspace.yaml` alongside the existing apps. (AC-001)
- **FR-002:** The package MUST export one zod schema per shared contract, and MUST export each contract's TypeScript type inferred from that schema with `z.infer`. (AC-003)
- **FR-003:** The package MUST export its schemas and types from a single package entry point, so a consumer imports both from `@riaya/shared`. (AC-002)
- **FR-004:** `packages/shared` MUST declare `zod` as its own dependency at the version the workspace already resolves, and MUST NOT introduce a second `zod` major version into the workspace. (AC-001)
- **FR-005:** `server/` and `backoffice/` MUST each be able to consume `@riaya/shared`, and `backoffice/` MUST use the shared schema in place of the locally declared login form schema. (AC-002, AC-007)
- **FR-006:** The package MUST contain only schema and type modules: no HTTP client, no UI-framework import, no user-facing message strings, and no environment or secret access. (AC-005)
- **FR-007:** The shared login and register schemas MUST match the corresponding `class-validator` DTOs field for field, including optionality. (AC-007, AC-008)

## 4. Non-functional requirements

- **NFR-001:** The package MUST NOT require a standalone runtime, bundler or publishing step: consumers MUST be able to use it through the workspace's existing TypeScript path resolution. (AC-001)
- **NFR-002:** Adding the package MUST NOT change the dependency set of `web/` or `server/` beyond `@riaya/shared` itself, and MUST NOT add a UI dependency to `server/`. (AC-005)
- **NFR-003:** The package MUST expose no compile-time or runtime dependency on a specific app, so no import may reach outside `packages/shared/src`. (AC-005)
- **NFR-004:** No environment variable, credential or connection string may be read by the package (CON-519). (AC-005)

## 5. Edge cases

| ID     | Case                                                                   | Expected behaviour                                                                                                                      |
| ------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| EC-001 | `web/` has no `zod` dependency                                         | The package is consumable without adding `zod` to `web/` in this version; `web/` stays unchanged and adopts it later.                   |
| EC-002 | A schema and its `class-validator` DTO disagree after an API change    | The comparison is the API's source of truth in FR-007; a divergence is a bug in the shared schema, and AC-007/AC-008 are what catch it. |
| EC-003 | A front end needs a translated validation message                      | The schema carries the rule only; the consumer supplies its own i18n message, so no user-facing string enters the package (FR-006).     |
| EC-004 | `zod` is overridden workspace-wide (`pnpm-workspace.yaml` `overrides`) | The package declares the override's range rather than pinning a different major, so a single `zod` version is installed (FR-004).       |
| EC-005 | A consumer imports a file path inside the package instead of its root  | Disallowed by NFR-003; the single entry point in FR-003 is the only supported import.                                                   |

## 6. Security Baseline

Read from `.sdrive/constitution.md` §Security Baseline (CON-51x). This feature adds a workspace
package of schemas and types. It adds no route, no authentication path and no persistence.

| Control                           | Status         | Rationale for this feature                                                                                                                                                                                                                                                                                        |
| --------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-511 Authentication            | NOT APPLICABLE | No credential, token or session logic is added. Login and register schemas describe a shape; authentication stays in `server/src/auth`.                                                                                                                                                                           |
| CON-512 Authorization             | NOT APPLICABLE | No guard or role check is added or moved.                                                                                                                                                                                                                                                                         |
| CON-513 Security Headers (Helmet) | NOT APPLICABLE | No response path changes.                                                                                                                                                                                                                                                                                         |
| CON-514 Rate Limiting             | NOT APPLICABLE | No endpoint is added.                                                                                                                                                                                                                                                                                             |
| CON-515 Input Validation          | **REQUIRED**   | The schemas in this package carry structural rules, so they must not weaken the API's existing validation. FR-007 binds them to the `class-validator` DTOs and NFR-002 keeps the existing `ValidationPipe` config unchanged. The API MUST NOT start trusting a shared schema in place of the DTO in this version. |
| CON-516 NoSQL / Injection         | NOT APPLICABLE | No data access and no query is added; the package holds no SQL and no Prisma client.                                                                                                                                                                                                                              |
| CON-517 XSS                       | NOT APPLICABLE | No UI is rendered and no string is marked as HTML. Message strings are deliberately excluded (FR-006).                                                                                                                                                                                                            |
| CON-518 CSRF                      | NOT APPLICABLE | No state-changing route is added and no cookie handling changes.                                                                                                                                                                                                                                                  |
| CON-519 Environment Security      | **REQUIRED**   | The package MUST NOT read any environment variable, credential or connection string (NFR-004). It ships no `.env` access and is development-consumed only.                                                                                                                                                        |
| CON-520 HTTPS / HSTS              | NOT APPLICABLE | No transport configuration changes.                                                                                                                                                                                                                                                                               |

Additionally **CON-505:** no secret, token or credential value may appear in the schemas or in the
package's tests.

## 7. Dependencies

| Name           | Type     | Notes                                                                                                                                                            |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| zod            | library  | New for the package. Workspace override already resolves `zod: ^4.6.7`; the package MUST declare that range, not a different major (FR-004, EC-004). Skill: zod. |
| pnpm workspace | internal | `packages/shared` is added to `pnpm-workspace.yaml`; no new tooling is introduced.                                                                               |
| typescript     | library  | Already present in all three apps (`^5.8.3`); the package uses the same major (AC-006). No install.                                                              |

## 8. Risks

| ID       | Risk                                                                                       | Mitigation                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| RISK-001 | The package duplicates the DTOs instead of replacing them, leaving four definitions again. | FR-007 binds each shared schema to its DTO by an explicit comparison, and FR-005 makes `backoffice/` drop its local copy.     |
| RISK-002 | A second `zod` major is installed through the new package.                                 | FR-004 requires the override's range, and EC-004 names the failure.                                                           |
| RISK-003 | The package quietly grows a client or UI layer and `server/` starts importing it.          | FR-006 and NFR-003 constrain the surface, and AC-005 checks it by inspection.                                                 |
| RISK-004 | The shared schema is trusted for API validation and weakens the `ValidationPipe` rules.    | CON-515 row keeps the class-validator DTOs authoritative in this version; replacing them is explicitly out of scope.          |
| RISK-005 | The package is adopted by one consumer and drifts for the other.                           | FR-005 requires both `server/` and `backoffice/` to consume it, so the workspace typecheck covers both sides of the contract. |

## 9. Research note

No external research was required. The workspace layout, the DTO contents and the dependency versions
come from this repository (`pnpm-workspace.yaml`, `server/src/**/dto/*.ts`, `backoffice/package.json`,
`backoffice/src/pages/LoginPage.tsx`). The one external detail — that `z.infer` produces a type from a
schema — is documented behaviour of zod 4 and is verified at implementation time by typechecking a
consumer that imports the inferred type.
