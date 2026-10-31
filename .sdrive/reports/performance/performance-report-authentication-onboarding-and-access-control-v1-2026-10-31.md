---
feature: authentication-onboarding-and-access-control
version: v1
nfr: NFR-010
status: not_verified
commit: 99c103670e107448bcad452d3a98771444b7c035
branch: feature/auth-onboarding
recordedAt: 2026-10-31T04:15:00.000Z
recordedBy: specdrive-performance-agent
artefacts:
  raw: .sdrive/reports/performance/nfr-010-login-benchmark-2026-10-31-load.json
  harness: .sdrive/reports/performance/harness/nfr-010-login-benchmark.ts
---

# NFR-010 — Login latency (p95 ≤ 400 ms)

## 1. Verdict

**NOT VERIFIED.** The requirement is _not_ demonstrated on this host, and it is _not_ refuted
either — the measurement is dominated by host resource starvation, not by the application.

Recording this as a pass would be a false record, so it is not recorded as one.

## 2. Requirement

> **NFR-010:** A login request MUST complete within 400 ms p95 under normal load, excluding
> deliberate lockout waits.

## 3. What was measured

The real login request path, over a real HTTP socket, through the same middleware `src/main.ts`
wires up (global `api` prefix, helmet, cookieParser, ValidationPipe, exception filter):

`POST /api/auth/login` → argon2.verify → Redis/memory lockout read → Prisma user read →
`lastLoginAt` write → JWT sign → refresh-token insert.

Fixture: one dedicated identity (`nfr010.bench.<uuid>@riaya.local`) with an `ACTIVE`
`SUPER_ADMIN` membership, created and deleted by the harness — the database was left as found.

| Setting         | Value                                                 |
| --------------- | ----------------------------------------------------- |
| Mode            | `NODE_ENV=test` (repo test configuration)             |
| Cache backend   | process-local strict store (`cacheBackend: "memory"`) |
| Login throttle  | 1000/min (test override; production is 10/min/IP)     |
| Warm-up         | 10 requests, discarded                                |
| Samples         | 50 @ c=1 · 100 @ c=5 · 200 @ c=20                     |
| Errors          | 0 — every request returned `201`                      |
| Node / platform | v24.2.0 / win32 x64                                   |

## 4. Results

| Concurrency | Requests | p50       | p90       | **p95**       | p99       | max       | Throughput |
| ----------- | -------- | --------- | --------- | ------------- | --------- | --------- | ---------- |
| 1           | 50       | 240.2 ms  | 624.4 ms  | **940.5 ms**  | 1308.6 ms | 1308.6 ms | 2.8 req/s  |
| 5           | 100      | 833.2 ms  | 1518.0 ms | **1634.3 ms** | 2092.5 ms | 2552.7 ms | 5.1 req/s  |
| 20          | 200      | 2413.7 ms | 6072.1 ms | **6889.8 ms** | 7719.4 ms | 7875.1 ms | 6.1 req/s  |

No sample at any concurrency met the 400 ms p95 target.

## 5. Attribution — the host is the bottleneck

The latency was attributed _before_ concluding anything about the code. Argon2 verification was
measured on its own, with no HTTP, no Prisma and no NestJS in the path:

| argon2.verify, 25 samples | min      | p50      | **p95**       | max       |
| ------------------------- | -------- | -------- | ------------- | --------- |
|                           | 127.5 ms | 207.3 ms | **1025.4 ms** | 2291.6 ms |

The memory-hard hash alone breaches the 400 ms p95 target, so **any** implementation using it on
this host fails NFR-010 regardless of application design. The web layer is therefore not what the
numbers are measuring.

Host state during the run:

| Resource       | Value                                                                              |
| -------------- | ---------------------------------------------------------------------------------- |
| CPU            | Intel i7-1165G7, 4 cores / 8 threads, 2.80 GHz                                     |
| RAM            | 15.8 GB total — **0.8 GB free at run time, 0.42 GB free minutes later**            |
| Competing load | 6 × VS Code processes (≈1 GB working set each), Spotify, Editor instrumenting node |

`argon2` allocates ~64 MiB per verify. With under 1 GB free the OS pages aggressively, which
produces exactly the multi-second tail seen above. This is a measurement-environment defect, not
evidence about the login path.

## 6. What this does NOT establish

- It does **not** show that login is fast. No sample supports a pass.
- It does **not** show that login is slow in production. The dominant term is host memory pressure.
- It does **not** exercise the Redis path: under `NODE_ENV=test` the strict store is process-local.
  Redis-backed lockout is covered separately by the AC-009 integration evidence
  (`.sdrive/reports/tests/raw/lockout-integration-ac-009-2026-10-30.log`).

## 7. How to obtain a certifiable number

Free the host first — the measurement needs several GB available, not 0.4 GB. Then:

```bash
docker compose up -d redis        # login fails closed without Redis
cd server
NODE_ENV=test pnpm exec ts-node -r tsconfig-paths/register \
  ../../.sdrive/reports/performance/harness/nfr-010-login-benchmark.ts load
```

The production-path companion run (real Redis, production throttle) is:

```bash
NODE_ENV=production pnpm exec ts-node -r tsconfig-paths/register \
  ../../.sdrive/reports/performance/harness/nfr-010-login-benchmark.ts prod
```

Note: in `prod` mode the login throttle is 10/min/IP, so the harness's 10-request warm-up must be
reduced to 0 before that run, otherwise warm-up itself returns `429`.

A pass requires `p95 ≤ 400` at the concurrency that represents normal load. If it still fails on a
healthy host, the cause is the argon2 cost parameters (`timeCost 3`, `memoryCost 64 MiB`,
`parallelism 4`) — a product/security decision, not a bug.
