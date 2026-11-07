# CLAUDE.md — RI'AYA

@AGENTS.md

The rules, repository map, definition of done and deployment notes are in `AGENTS.md` (imported
above). This file adds how to work efficiently in this repository with Claude Code.

## Orient before reading code

- Start from the contract: `docs/API-CONTRACT.md` and `packages/shared/src/schemas/clinic.ts`.
- Architecture decisions: `docs/adr/`. Security: `docs/THREAT-MODEL.md`. Optimiser and wait
  model: `docs/scheduling-metrics.md`. Technical documentation for the team: `docs/RIAYA-Technical-Documentation.pdf`.
- Backend module per domain under `server/src/<domain>/` (controller → service → Prisma), pure
  logic in small tested files (`core/availability.ts`, `scheduling/optimizer.ts`,
  `queue/queue-order.ts`, `appointments/alternatives.ts`, `doctors/utilisation.ts`).
- Frontend feature per folder under `backoffice/src/features/<feature>/` with its own `api.ts`
  (`clinicApi.injectEndpoints`), pure logic files with co-located `*.test.ts`, and an i18n catalogue
  in `backoffice/src/i18n/features/<feature>/`.
- Search narrowly (Grep with a `path` and `glob`); read a range, not whole files; never open
  `pnpm-lock.yaml`, `.next/`, `dist/` or `node_modules/`.

## Commands that matter

```bash
pnpm --filter server exec jest <path>                       # backend unit tests (in-memory Prisma fake for e2e suites)
pnpm --filter server exec prisma migrate deploy             # apply migrations to DATABASE_URL
pnpm --filter server seed                                   # idempotent fictional dataset, dates relative to today
pnpm --filter backoffice exec jest src/features/<x>   # frontend tests
pnpm --filter backoffice exec tsc --noEmit -p tsconfig.app.json
node backoffice/scripts/check-locale-parity.mjs              # translation keys en/ar/fr
npx ts-node --transpile-only server/scripts/concurrency-check.ts   # 50 parallel bookings → 1×201, 49×409 (API running)
```

Windows / Git Bash: prefix `MSYS_NO_PATHCONV=1` when passing `/app/`-style values in env vars
(`VITE_BASE=/app/`), otherwise Git Bash rewrites them into Windows paths.

## Working style

- Prefer extending the existing pattern over adding a new one; one primitive system
  (`backoffice/src/common`, `backoffice/src/features/shared`).
- New endpoint: DTO with class-validator (whitelist is strict), `@Roles`, tenant-scoped query,
  audit in the transaction, domain event after commit, shared type, contract doc row, test.
- New screen: PageHeader + loading skeleton + empty + no-results + error states, RTL check,
  375 px check, translations in all three locales.
- Multi-file work: split by disjoint file ownership if you delegate to subagents; subagents never
  commit, push or deploy.
- Verify in a browser before claiming a UI change works (Playwright MCP or the in-app browser).
- Report honestly: what was verified, what was not.

## Demo accounts (fictional, local and hosted demo)

| Role                       | Email                    | Password           |
| -------------------------- | ------------------------ | ------------------ |
| Super admin                | admin@riaya.local        | RiayaAdmin123!     |
| Super admin (Omar Farouk)  | clinic.admin@riaya.local | RiayaClinic123!    |
| Doctor                     | doctor@riaya.local       | RiayaDoctor123!    |
| Receptionist               | receptionist@riaya.local | RiayaReception123! |
| Patient (portal `/portal`) | patient@riaya.local      | RiayaPatient123!   |
