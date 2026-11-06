# ADR 0001 — Hosting topology and data-store choices

- Status: accepted
- Date: 2026-11-06

## Context

The brief asks for a NestJS API on PostgreSQL + Redis + MongoDB, a realtime service, a React
backoffice and a deployed demo reachable by URL. The team's own feature document (Ri-aya.pdf)
already moves chat and notifications to PostgreSQL. The demo is hosted on Vercel, which runs
request-scoped functions: no long-lived processes, no WebSocket server, no local Redis or MongoDB.

## Decision

1. **Two Vercel projects, one origin for users.**
   - `riaya` (root `web/`): the Next.js marketing site; the Vite backoffice is built with
     `VITE_BASE=/app/` and copied into `web/public/app`, so the workspace lives at `/app`.
     `/api/*` is rewritten to the API project, which keeps the HttpOnly refresh cookie
     first-party (SameSite=Lax) without third-party-cookie problems.
   - `riaya-api` (root `server/`): the compiled Nest app (`nest build`, which keeps decorator
     metadata) wrapped by `api/index.js` → `src/serverless.ts`. `main.ts` and the function share
     `src/bootstrap.ts`, so security headers, body limits, validation and the error shape match.
2. **PostgreSQL (Neon) is the system of record**, including notifications and chat (per Ri-aya.pdf).
   Overlap safety is enforced by the `appointments_no_overlap` exclusion constraint (btree_gist);
   audit rows are append-only through a trigger.
3. **Redis is optional at runtime.** With `REDIS_URL` set (Docker Compose locally) it backs lockout
   counters, revoked refresh tokens, slot locks, caches and the `riaya:events` channel for the
   realtime service. Without it (hosted demo) the same services fall back to per-instance memory,
   which is acceptable for a demo and documented as such. Security state (lockout counters,
   revoked-token list) still fails closed without Redis unless `SECURITY_STATE_MEMORY=true` is
   set explicitly, as on the hosted demo; refresh rotation and family revocation remain enforced
   in PostgreSQL either way. Adding Upstash Redis (`REDIS_URL`) removes the per-instance caveat.
4. **Realtime degrades to polling.** The Socket.IO realtime service (`realtime/`, MongoDB-backed)
   runs under Docker Compose. The hosted backoffice polls live screens (queue 5 s, notifications
   20 s, dashboard 30 s) when `VITE_REALTIME_URL` is not configured.
5. **Demo freshness.** `DEMO_MODE=true` + `CRON_SECRET` enable `GET /api/demo/reset`, called daily
   by Vercel Cron, which re-runs the idempotent seed so "today" always has a live schedule. It is
   disabled (404) everywhere else.

## Consequences

- One `docker compose up` still gives the full brief stack locally (PostgreSQL, Redis, MongoDB,
  realtime). The hosted demo trades shared Redis state and push updates for zero ops.
- The marketing site and the API deploy independently; `API_ORIGIN` (build-time) ties them.
- Moving to a container host later needs no code change: `pnpm --filter server start:prod`.
