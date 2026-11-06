# ADR 0001 — Hosting topology and data-store choices

- Status: accepted
- Date: 2026-11-06

## Context

The brief asks for a NestJS API on PostgreSQL + Redis + MongoDB, a realtime service, a React
backoffice and a deployed demo reachable by URL. The team's own feature document (Ri-aya.pdf)
already moves chat and notifications to PostgreSQL. The demo is hosted on Vercel, which runs
request-scoped functions: no long-lived processes, no WebSocket server, no local Redis or MongoDB.

## Decision

1. **Three Vercel projects; Next.js only for the public landing.**
   - `riaya` (root `web/`): the Next.js 15 landing site (SSR/SSG for SEO, EN/AR/FR). It does not
     bundle or serve the workspace; `/app/*` is a permanent redirect to `NEXT_PUBLIC_APP_URL`.
   - `riaya-app` (root `backoffice/`): the staff workspace as a pure React SPA, a static Vite
     build (`VITE_BASE=/`, served from the project root; `backoffice/vercel.json`). It has an SPA
     fallback, immutable `/assets/*` caching, strict security headers/CSP and is `noindex`
     (meta, `X-Robots-Tag`, `robots.txt`). `/api/*` is rewritten to the API project, so the
     HttpOnly refresh cookie stays first-party (SameSite=Lax) on the workspace origin. The CSP
     `connect-src` is `'self'`: when `VITE_REALTIME_URL` is set, add the realtime host
     (`https://` and `wss://`) to `connect-src` in `backoffice/vercel.json`.
   - `riaya-api` (root `server/`): the compiled Nest app (`nest build`, which keeps decorator
     metadata) wrapped by `api/index.js` -> `src/serverless.ts`. `main.ts` and the function share
     `src/bootstrap.ts`, so security headers, body limits, validation and the error shape match.
   - Python services: see ADR 0003/0004.
2. **PostgreSQL (Neon) is the system of record**, including notifications and chat (per Ri-aya.pdf).
   Overlap safety is enforced by the `appointments_no_overlap` exclusion constraint (btree_gist);
   audit rows are append-only through a trigger.
3. **Redis is optional at runtime.** With `REDIS_URL` set (Docker Compose locally) it backs lockout
   counters, revoked refresh tokens, slot locks, caches and the `riaya:events` channel for the
   realtime service. Without it, caches fall back to per-instance memory, but **security state
   (lockout counters, revoked-token list) moves to the PostgreSQL table `security_state`**, which
   every instance shares, so lockout and revocation hold across serverless instances. Production
   uses Upstash Redis (free tier, `REDIS_URL`); the Postgres store is the automatic fallback.
   `SECURITY_STATE_MEMORY=true` (per-instance memory) remains only as an explicit escape hatch.
4. **Realtime degrades to polling.** The Socket.IO realtime service (`realtime/`, MongoDB-backed)
   runs under Docker Compose. The hosted backoffice polls live screens (queue 5 s, notifications
   20 s, dashboard 30 s) when `VITE_REALTIME_URL` is not configured.
5. **Demo freshness.** `DEMO_MODE=true` + `CRON_SECRET` enable `GET /api/demo/reset`, called daily
   by Vercel Cron, which re-runs the idempotent seed so "today" always has a live schedule. It is
   disabled (404) everywhere else.

## Consequences

- One `docker compose up` still gives the full brief stack locally (PostgreSQL, Redis, MongoDB,
  realtime). The hosted demo trades shared Redis state and push updates for zero ops.
- The landing, workspace and API deploy independently. The landing links to the workspace via
  `NEXT_PUBLIC_APP_URL`; the workspace proxies `/api` to `https://riaya-api.vercel.app` in its
  `vercel.json`.
- Moving to a container host later needs no code change: `pnpm --filter server start:prod`.
