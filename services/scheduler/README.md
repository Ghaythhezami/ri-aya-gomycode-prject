# riaya-scheduler

Python 3.12 FastAPI service of the RI'AYA clinic SaaS (ADR `docs/adr/0003-python-microservices.md`).
Server-to-server only (no CORS): the NestJS API calls it with a short-lived service JWT.

- `POST /v1/optimize` runs the schedule optimiser, a faithful port of
  `server/src/scheduling/optimizer.ts` (same constants, tie-breaking and rounding). Pure, no database.
- `POST /v1/insights` aggregates a clinic's appointments (up to 730 days) with numpy from PostgreSQL,
  read-only, through a server-side cursor in chunks of 10 000 rows.
- `POST /v1/reports/analytics` renders the analytics PDF (`application/pdf`) from aggregates the API
  sends (`locale`, `clinic`, `range`, `scope`, `generatedAt`, `analytics`, optional `insights`).
  reportlab with bundled Noto fonts (OFL, `app/fonts/`); Arabic is shaped with arabic-reshaper and
  python-bidi and the layout is mirrored. No database, no patient data. Samples:
  `python scripts/render_report_samples.py <out-dir>`.
- `GET /health` is open: `{status: "ok"|"degraded", store: "up"|"down"|"none"}`.

## Run

```bash
cd services/scheduler
uv sync --python 3.12 --extra dev
SERVICE_JWT_SECRET=<32+ chars shared with the API> DATABASE_URL=postgresql://... \
  uv run uvicorn app.main:app --port 4100
```

| Variable             | Meaning                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `SERVICE_JWT_SECRET` | Required, 32+ characters (not enforced when `SCHEDULER_ENV=test`)                           |
| `DATABASE_URL`       | Optional. Without it, or when unreachable, `/v1/insights` answers 503 `SERVICE_UNAVAILABLE` |
| `PORT`               | Default 4100 (Docker image)                                                                 |
| `SCHEDULER_ENV`      | `test` relaxes the secret check for the test suite                                          |

Requests carry `Authorization: Bearer <HS256 JWT>` with `iss=riaya-api`, `aud=riaya-scheduler`,
`sub`, `clinic_id`, `exp` (30 s leeway). The tenant is taken from `clinic_id` only. Errors are
`{code, message, details?}`. `X-Request-Id` is echoed and logged; logs are JSON lines with ids and
counts only.

Insights semantics are documented at the top of `app/insights.py` (demand excludes cancelled
bookings, no-show denominator = COMPLETED + NO_SHOW, prior weight 20, 14-day forecast from the last
8 same weekdays with weights 0.5^(j/2)).

Vercel: the root `index.py` exposes `app` and `requirements.txt` lists the runtime dependencies.
Set `SERVICE_JWT_SECRET` and `DATABASE_URL` in the project environment. Docker:
`docker build -t riaya-scheduler . && docker run -p 4100:4100 -e SERVICE_JWT_SECRET=... riaya-scheduler`.

## Test

```bash
uv run ruff check . && uv run ruff format --check .
uv run pytest -q
```

Parity: `tests/fixtures/optimizer-*.json` are generated from the TypeScript optimiser; regenerate
after any change to it with `cd server && npx ts-node --transpile-only scripts/export-optimizer-fixtures.ts`.
The integration test uses `postgresql://riaya:riaya@localhost:5432/riaya` (override with
`RIAYA_TEST_DATABASE_URL`) and is skipped when it is unreachable.

## Benchmark

```bash
uv run python scripts/bench_insights.py [rows=2000000] [chunk=10000]
```

Prints rows per second and the peak memory traced by `tracemalloc` (flat with history size).
