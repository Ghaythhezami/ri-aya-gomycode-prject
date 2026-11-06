"""PostgreSQL access for insights: read-only, server-side cursor, chunks of 10 000 rows.

The clinic id always comes from the verified token. Prisma stores `DateTime` as
`timestamp(3) without time zone` holding UTC, so the bounds are naive UTC datetimes and the
session time zone is pinned to UTC.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date

import numpy as np
import psycopg

from .insights import Chunk, InsightsAggregator, day_bounds_utc

CHUNK_SIZE = 10_000
CONNECT_TIMEOUT_SECONDS = 3
STATEMENT_TIMEOUT = "30s"

SQL = """
SELECT
  EXTRACT(EPOCH FROM "startsAt")::bigint,
  EXTRACT(EPOCH FROM "endsAt")::bigint,
  EXTRACT(EPOCH FROM "createdAt")::bigint,
  "status"::text,
  "type"::text,
  "doctorId"
FROM "appointments"
WHERE "clinicId" = %(clinic_id)s
  AND "startsAt" >= %(lo)s
  AND "startsAt" < %(hi)s
"""


def connect(database_url: str) -> psycopg.Connection:
    return psycopg.connect(database_url, connect_timeout=CONNECT_TIMEOUT_SECONDS)


def ping(database_url: str) -> bool:
    try:
        with connect(database_url) as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
            return cur.fetchone() == (1,)
    except psycopg.Error:
        return False


def rows_to_chunk(rows: list[tuple]) -> Chunk:
    starts, ends, created, status, kind, doctor = zip(*rows, strict=True)
    return Chunk(
        starts=np.array(starts, dtype=np.int64),
        ends=np.array(ends, dtype=np.int64),
        created=np.array(created, dtype=np.int64),
        status=np.array(status),
        type=np.array(kind),
        doctor_id=np.array(doctor),
    )


def iter_chunks(
    database_url: str, clinic_id: str, from_: date, to: date, time_zone: str
) -> Iterator[Chunk]:
    lo, hi = day_bounds_utc(from_, to, time_zone)
    with connect(database_url) as conn:
        with conn.cursor() as setup:
            setup.execute("SET TRANSACTION READ ONLY")
            setup.execute("SET LOCAL TIME ZONE 'UTC'")
            setup.execute(f"SET LOCAL statement_timeout = '{STATEMENT_TIMEOUT}'")
        with conn.cursor(name="riaya_insights") as cur:
            cur.itersize = CHUNK_SIZE
            cur.execute(SQL, {"clinic_id": clinic_id, "lo": lo, "hi": hi})
            while True:
                rows = cur.fetchmany(CHUNK_SIZE)
                if not rows:
                    break
                yield rows_to_chunk(rows)
        conn.rollback()


def run_insights(database_url: str, clinic_id: str, from_: date, to: date, time_zone: str) -> dict:
    agg = InsightsAggregator(from_, to, time_zone)
    for chunk in iter_chunks(database_url, clinic_id, from_, to, time_zone):
        agg.add_chunk(chunk)
    return agg.result()
