"""Benchmark the insights aggregator on synthetic rows: rows/s and peak memory.

uv run python scripts/bench_insights.py [rows] [chunk_size]
"""

from __future__ import annotations

import sys
import time
import tracemalloc
from datetime import date
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.insights import Chunk, InsightsAggregator  # noqa: E402

ROWS = int(sys.argv[1]) if len(sys.argv) > 1 else 2_000_000
CHUNK = int(sys.argv[2]) if len(sys.argv) > 2 else 10_000
FROM, TO = date(2024, 1, 1), date(2025, 12, 30)  # 730 days
START = 1_704_067_200  # 2024-01-01T00:00:00Z
SPAN = 730 * 86400

STATUSES = np.array(["COMPLETED", "NO_SHOW", "CANCELLED", "CONFIRMED", "SCHEDULED"])
STATUS_P = [0.70, 0.10, 0.12, 0.05, 0.03]
TYPES = np.array(["CONSULTATION", "FOLLOW_UP", "EMERGENCY"])
DOCTORS = np.array([f"doctor-{i:03d}" for i in range(40)])


def make_chunk(rng: np.random.Generator, n: int) -> Chunk:
    starts = START + rng.integers(0, SPAN // 900, n) * 900
    return Chunk(
        starts=starts,
        ends=starts + rng.choice([900, 1800, 2700], n),
        created=starts - rng.integers(0, 60 * 86400, n),
        status=rng.choice(STATUSES, n, p=STATUS_P),
        type=rng.choice(TYPES, n, p=[0.6, 0.3, 0.1]),
        doctor_id=rng.choice(DOCTORS, n),
    )


def main() -> None:
    rng = np.random.default_rng(42)
    agg = InsightsAggregator(FROM, TO, "Africa/Tunis")
    generation = 0.0
    tracemalloc.start()
    t0 = time.perf_counter()
    done = 0
    while done < ROWS:
        n = min(CHUNK, ROWS - done)
        g0 = time.perf_counter()
        chunk = make_chunk(rng, n)
        generation += time.perf_counter() - g0
        agg.add_chunk(chunk)
        done += n
    result = agg.result()
    elapsed = time.perf_counter() - t0
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    aggregate = elapsed - generation
    print(f"rows            : {done:,} in {agg.chunks} chunks of {CHUNK:,}")
    print(f"total time      : {elapsed:.2f} s (row generation {generation:.2f} s)")
    print(f"rows/s (total)  : {done / elapsed:,.0f}")
    print(f"rows/s (aggreg.): {done / aggregate:,.0f}")
    print(f"peak traced mem : {peak / 1024 / 1024:.1f} MiB (tracemalloc)")
    print(
        f"totals          : {result['totals']}, recommendations: "
        f"{[r['kind'] for r in result['recommendations']]}"
    )


if __name__ == "__main__":
    main()
