# AGENTS.md — working on RI'AYA

Guidance for any coding agent (and human) changing this repository. Read this before editing.
`CLAUDE.md` holds the same rules plus Claude-specific workflow notes.

## Product in one paragraph

RI'AYA (رعاية) is a multilingual (EN, AR with full RTL, FR), multi-tenant clinic operations SaaS:
appointments with conflict-safe booking, doctors and availability, patients, a live waiting-room
queue with QR self check-in, deterministic smart scheduling, analytics, notifications, settings,
audit trail and staff chat. All data is fictional. Source briefs: `project-overview/` (MediFlow
brief, Ri-aya feature document, Figma screenshots).

## Repository map

| Path                  | What                                                                                  | Run                                                               |
| --------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `server/`             | NestJS 11 API, Prisma 6, PostgreSQL, Redis (optional)                                 | `pnpm --filter server start:dev` (port 4000, Swagger `/api/docs`) |
| `backoffice/`         | React 19 + Vite staff workspace, RTK Query, i18next                                   | `pnpm --filter backoffice dev` (port 5174, proxies `/api`)        |
| `web/`                | Next.js 15 landing site only (SEO); the workspace deploys separately                  | `pnpm --filter web dev` (port 3000)                               |
| `realtime/`           | NestJS Socket.IO relay (MongoDB, Redis adapter)                                       | `pnpm dev:realtime` (port 4001)                                   |
| `services/scheduler/` | Python FastAPI: optimiser (parity with the TS one) and numpy insights over PostgreSQL | `pnpm dev:scheduler` (port 4100)                                  |
| `services/comms/`     | Python FastAPI: notifications and staff chat on MongoDB                               | `pnpm dev:comms` (port 4200)                                      |
| `packages/shared/`    | Contracts (`schemas/clinic.ts`), capability matrix, localised errors                  | `pnpm --filter @riaya/shared build`                               |
| `docs/`               | API contract, ADRs, threat model, scheduling metrics, technical documentation         | –                                                                 |

Local services: `docker compose up -d` (PostgreSQL 16, Redis 7, MongoDB 7).
First run: `pnpm install` → `pnpm run setup` (not `pnpm setup`, which is a pnpm built-in) →
`docker compose up -d` → `pnpm --filter server exec prisma migrate deploy` → `pnpm --filter server seed` → `pnpm dev`.

## Non-negotiable rules

1. **Tenant isolation.** Every clinic-scoped query filters by `clinicId` taken from
   `TenantContext.get()` (the verified JWT), never from a body, query or header. Cross-clinic ids
   return 404. Add a test when you add a query path.
2. **Contract first.** Response and input types live in `packages/shared/src/schemas/clinic.ts`;
   routes in `docs/API-CONTRACT.md`. Change both sides in the same change. Errors are
   `{ code, message, details? }` with codes from `CLINIC_ERROR_CODES`; add the code's message in
   `packages/shared/src/i18n.ts` for en, ar and fr.
3. **Roles.** Use `@Roles(...CAPABILITY_ROLES.<capability>)` on the API and `can(role, capability)`
   in the UI — one matrix in `packages/shared/src/permissions.ts`. Unknown means deny.
4. **Booking safety.** Never bypass the SERIALIZABLE transaction, the slot lock, or the
   `appointments_no_overlap` exclusion constraint. Status changes go through the state machine
   (`APPOINTMENT_TRANSITIONS`).
5. **Audit.** Create/update/delete on clinical entities writes an audit row in the same
   transaction (`AuditService.record(tx, …)`). `audit_logs` is append-only (DB trigger).
6. **Domain events.** Emit after commit through `DomainEventsService`; consumers (notifications,
   reminders, caches, queue sync, realtime relay) subscribe. Producers never import consumers.
7. **Time.** Store UTC. Working hours are minutes after local midnight in the clinic time zone;
   convert only with `server/src/core/clinic-time.ts`. UI formats with `useClinicFormat()`.
8. **Frontend tokens and RTL.** Colours, radii and shadows come from `backoffice/src/index.css`
   tokens. Use logical utilities (`ms/me/ps/pe/start/end/text-start`), never `ml/mr/left/right`.
   Mirror directional icons with `rtl:-scale-x-100`. Status is never conveyed by colour alone.
9. **No hard-coded strings.** Backoffice text lives in `backoffice/src/i18n/features/<feature>/{en,ar,fr}.json`
   (same keys in all three) or the root catalogues. The build fails on a missing key.
10. **Privacy.** Fictional data only. No personal data in logs, URLs or analytics. The public
    display and self check-in expose queue numbers and rooms only.
11. **Secrets.** Never commit `.env` files, connection strings or tokens. Production secrets live in
    Vercel project environment variables.
12. **Python services (ADR 0003).** The NestJS API stays the only public entry point. Services trust
    only the signed service token (`clinic_id`, `sub`); never add a clinic id to a service request body.
    A change to `server/src/scheduling/optimizer.ts` must be mirrored in
    `services/scheduler/app/optimizer.py` and the parity fixtures regenerated
    (`server/scripts/export-optimizer-fixtures.ts`). Python checks: `pnpm lint:py`, `pnpm test:py`.

## Definition of done

From the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter backoffice build   # also runs token, RTL and locale-parity checks
```

Plus, for UI changes: check the screen at 375, 768 and 1440 px in EN and AR (RTL), keyboard-only,
and the loading / empty / no-results / error states. For API changes: Swagger updated, a migration
committed when the schema changes (`server/prisma/migrations`, additive SQL; verify
`prisma migrate diff` is empty), and an integration or unit test for the new path.

## Deployment

Two Vercel projects (see `docs/adr/0001-hosting-and-data-stores.md`): `riaya` (root `web/`,
serves `/app` and rewrites `/api` to the API) and `riaya-api` (root `server/`, Nest compiled by
`nest build`, wrapped by `server/api/index.js`). Database: Neon PostgreSQL. Deploy the API first,
then the web project (`API_ORIGIN` is read at build time). The demo re-seeds daily via Vercel Cron
(`DEMO_MODE=true`, `CRON_SECRET`).

## Commit style

Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), enforced by commitlint; Husky
runs Prettier on staged files. Do not skip hooks.

## SpecDrive Commands

This project uses SpecDrive for spec-driven development.

When the user types a /sdrive:* command, follow these steps:

1. Read .sdrive/commands/manifest.json
2. Find the matching command
3. Read the agent file listed in agentFile
4. Follow that agent's instructions exactly
5. Run validators after writing files
6. Stop at human approval gates

Always read the manifest first. Never hardcode the command list.
