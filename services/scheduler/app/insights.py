"""Insights aggregator (ADR 0003). Pure numpy, DB-agnostic: it consumes chunks of rows.

Memory is bounded by the chunk size plus fixed-size accumulators (7x24 matrices, per-day counts,
per-doctor totals), whatever the history length.

Definitions
- Local time: epoch seconds are shifted by the zone's UTC offset (DST correct: the offset
  changes are found once per aggregator and looked up with searchsorted), then weekday
  (0 = Monday) and hour are read from the shifted value.
- Demand counts non-cancelled bookings (a cancelled slot is free again, so it is not demand).
  `totals.appointments` counts every row in the range, cancelled included.
- No-show denominator = appointments that reached a final state (COMPLETED + NO_SHOW).
  Every `count` in the `noShow` section is that denominator for the bucket.
- Smoothed rate = (noShows + PRIOR_WEIGHT * overall) / (final + PRIOR_WEIGHT) where `overall` is
  the clinic's raw no-show rate over the whole range (0 when nothing is final).
- Lead time = startsAt - createdAt in whole days, buckets 0-1d, 2-7d, 8-30d, 31d+.
- Forecast for day D (the 14 days after `to`) = weighted mean of the daily non-cancelled counts on
  the last 8 days up to and including `to` that fall on D's weekday (and inside the range), most
  recent first, with weights 0.5 ** (j / 2) for j = 0..7 (half-life of two weeks).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from datetime import time as dtime
from statistics import median
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np

PRIOR_WEIGHT = 20
HIGH_NO_SHOW_MARGIN = 0.10
HIGH_NO_SHOW_MIN_COUNT = 20
UNDERUSED_RATIO = 0.5
FORECAST_DAYS = 14
FORECAST_LOOKBACK = 8
LEAD_LABELS = ("0-1d", "2-7d", "8-30d", "31d+")
LEAD_EDGES = np.array([2, 8, 31])
BUCKET_SECONDS = 900
EPOCH_ORDINAL = date(1970, 1, 1).toordinal()

COMPLETED = "COMPLETED"
NO_SHOW = "NO_SHOW"
CANCELLED = "CANCELLED"


@dataclass(frozen=True)
class Chunk:
    """One batch of appointment rows. Times are epoch seconds (UTC)."""

    starts: np.ndarray
    ends: np.ndarray
    created: np.ndarray
    status: np.ndarray
    type: np.ndarray
    doctor_id: np.ndarray

    def __len__(self) -> int:
        return len(self.starts)


def day_bounds_utc(from_: date, to: date, time_zone: str) -> tuple[datetime, datetime]:
    """Naive UTC datetimes [start, end) covering the local days from..to inclusive."""
    tz = ZoneInfo(time_zone)
    lo = datetime.combine(from_, dtime.min, tzinfo=tz)
    hi = datetime.combine(to + timedelta(days=1), dtime.min, tzinfo=tz)
    utc = ZoneInfo("UTC")
    return (
        lo.astimezone(utc).replace(tzinfo=None),
        hi.astimezone(utc).replace(tzinfo=None),
    )


def _r(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


class InsightsAggregator:
    def __init__(self, from_: date, to: date, time_zone: str):
        self.from_ = from_
        self.to = to
        self.time_zone = time_zone
        self._tz = ZoneInfo(time_zone)
        self._transitions: tuple[np.ndarray, np.ndarray] | None = None
        self._t0 = time.perf_counter()
        self.rows = 0
        self.chunks = 0
        self._days = (to - from_).days + 1
        self._base_day = from_.toordinal() - EPOCH_ORDINAL
        self.demand = np.zeros(168, dtype=np.int64)
        self.final_cell = np.zeros(168, dtype=np.int64)
        self.noshow_cell = np.zeros(168, dtype=np.int64)
        self.daily = np.zeros(self._days, dtype=np.int64)
        self.total = 0
        self.completed = 0
        self.no_shows = 0
        self.cancelled = 0
        self.lead_final = np.zeros(4, dtype=np.int64)
        self.lead_noshow = np.zeros(4, dtype=np.int64)
        self.types: dict[str, list[int]] = {}  # type -> [final, noShow]
        # doctor -> [non-cancelled, bookedSeconds, final, noShow]
        self.doctors: dict[str, list[float]] = {}

    # -- time ---------------------------------------------------------------------------

    def _offset_at(self, instant: int) -> int:
        offset = datetime.fromtimestamp(instant, tz=self._tz).utcoffset()
        return int(offset.total_seconds()) if offset is not None else 0

    def _build_transitions(self) -> tuple[np.ndarray, np.ndarray]:
        """UTC instants where the zone's offset changes, found by sampling every 6 hours and
        refining each change to 15 minutes; one pass per aggregator, no per-row work."""
        lo = int(datetime(self.from_.year - 1, 1, 1, tzinfo=ZoneInfo("UTC")).timestamp())
        hi = int(datetime(self.to.year + 2, 1, 1, tzinfo=ZoneInfo("UTC")).timestamp())
        step = 6 * 3600
        times = [lo]
        offsets = [self._offset_at(lo)]
        for t in range(lo + step, hi + 1, step):
            off = self._offset_at(t)
            if off != offsets[-1]:
                left, right = t - step, t
                while right - left > BUCKET_SECONDS:
                    mid = (left + right) // 2 // BUCKET_SECONDS * BUCKET_SECONDS
                    if mid <= left:
                        break
                    if self._offset_at(mid) == offsets[-1]:
                        left = mid
                    else:
                        right = mid
                times.append(right)
                offsets.append(off)
        return np.array(times, dtype=np.int64), np.array(offsets, dtype=np.int64)

    def local_seconds(self, starts: np.ndarray) -> np.ndarray:
        if self._transitions is None:
            self._transitions = self._build_transitions()
        times, offsets = self._transitions
        index = np.searchsorted(times, starts, side="right") - 1
        return starts + offsets[np.clip(index, 0, len(offsets) - 1)]

    # -- ingest -------------------------------------------------------------------------

    def add_chunk(self, chunk: Chunk) -> None:
        n = len(chunk)
        self.chunks += 1
        if n == 0:
            return
        self.rows += n
        starts = chunk.starts.astype(np.int64, copy=False)
        local = self.local_seconds(starts)
        days = local // 86400
        weekday = ((days + 3) % 7).astype(np.int64)  # 1970-01-01 was a Thursday (3)
        hour = ((local % 86400) // 3600).astype(np.int64)
        cell = weekday * 24 + hour

        status = chunk.status
        is_completed = status == COMPLETED
        is_noshow = status == NO_SHOW
        is_cancelled = status == CANCELLED
        is_final = is_completed | is_noshow
        live = ~is_cancelled

        self.total += n
        self.completed += int(is_completed.sum())
        self.no_shows += int(is_noshow.sum())
        self.cancelled += int(is_cancelled.sum())

        self.demand += np.bincount(cell[live], minlength=168)
        self.final_cell += np.bincount(cell[is_final], minlength=168)
        self.noshow_cell += np.bincount(cell[is_noshow], minlength=168)

        day_idx = days[live] - self._base_day
        in_range = (day_idx >= 0) & (day_idx < self._days)
        self.daily += np.bincount(day_idx[in_range], minlength=self._days)

        lead_days = (starts - chunk.created.astype(np.int64, copy=False)) // 86400
        lead = np.digitize(lead_days, LEAD_EDGES)
        self.lead_final += np.bincount(lead[is_final], minlength=4)
        self.lead_noshow += np.bincount(lead[is_noshow], minlength=4)

        self._group(chunk.type, is_final, is_noshow, None, None, self._add_type)
        durations = (chunk.ends.astype(np.int64, copy=False) - starts).astype(np.float64)
        self._group(chunk.doctor_id, is_final, is_noshow, live, durations, self._add_doctor)

    @staticmethod
    def _group(keys, is_final, is_noshow, live, durations, sink) -> None:
        unique, inverse = np.unique(keys, return_inverse=True)
        inverse = inverse.reshape(-1)
        size = len(unique)
        final = np.bincount(inverse[is_final], minlength=size)
        noshow = np.bincount(inverse[is_noshow], minlength=size)
        if live is not None:
            count = np.bincount(inverse[live], minlength=size)
            seconds = np.bincount(inverse[live], weights=durations[live], minlength=size)
        else:
            count = seconds = None
        for i, key in enumerate(unique.tolist()):
            sink(
                str(key),
                int(final[i]),
                int(noshow[i]),
                None if count is None else int(count[i]),
                None if seconds is None else float(seconds[i]),
            )

    def _add_type(self, key, final, noshow, _count, _seconds) -> None:
        entry = self.types.setdefault(key, [0, 0])
        entry[0] += final
        entry[1] += noshow

    def _add_doctor(self, key, final, noshow, count, seconds) -> None:
        entry = self.doctors.setdefault(key, [0, 0.0, 0, 0])
        entry[0] += count
        entry[1] += seconds
        entry[2] += final
        entry[3] += noshow

    # -- result -------------------------------------------------------------------------

    @property
    def overall_rate(self) -> float:
        final = self.completed + self.no_shows
        return self.no_shows / final if final else 0.0

    def smooth(self, no_shows: float, final: float) -> float:
        return (no_shows + PRIOR_WEIGHT * self.overall_rate) / (final + PRIOR_WEIGHT)

    def _forecast(self) -> list[dict[str, Any]]:
        out = []
        weights = [0.5 ** (j / 2) for j in range(FORECAST_LOOKBACK)]
        for k in range(1, FORECAST_DAYS + 1):
            target = self.to + timedelta(days=k)
            first_back = 7 * ((k + 6) // 7)  # smallest multiple of 7 that is >= k
            samples = []
            for j in range(FORECAST_LOOKBACK):
                idx = self._days - 1 - (first_back - k) - 7 * j
                if 0 <= idx < self._days:
                    samples.append((weights[j], int(self.daily[idx])))
            total_w = sum(w for w, _ in samples)
            expected = sum(w * c for w, c in samples) / total_w if total_w else 0.0
            out.append({"date": target.isoformat(), "expected": _r(expected, 2)})
        return out

    def result(self) -> dict[str, Any]:
        demand_matrix = self.demand.reshape(7, 24)
        order = sorted(range(168), key=lambda c: (-int(self.demand[c]), c))
        peak = [
            {"weekday": c // 24, "hour": c % 24, "count": int(self.demand[c])}
            for c in order[:3]
            if self.demand[c] > 0
        ]

        wd_final = self.final_cell.reshape(7, 24).sum(axis=1)
        wd_noshow = self.noshow_cell.reshape(7, 24).sum(axis=1)
        hr_final = self.final_cell.reshape(7, 24).sum(axis=0)
        hr_noshow = self.noshow_cell.reshape(7, 24).sum(axis=0)

        def rows(keys, finals, noshows) -> list[dict[str, Any]]:
            return [
                {
                    "key": str(k),
                    "rate": _r(self.smooth(int(ns), int(f))),
                    "count": int(f),
                }
                for k, f, ns in zip(keys, finals, noshows, strict=True)
            ]

        by_type_keys = sorted(self.types)
        doctors = []
        for doc_id in sorted(self.doctors):
            count, seconds, final, noshow = self.doctors[doc_id]
            minutes = seconds / 60
            doctors.append(
                {
                    "doctorId": doc_id,
                    "appointments": int(count),
                    "bookedMinutes": _r(minutes, 1),
                    "noShowRate": _r(self.smooth(noshow, final)),
                    "avgDurationMinutes": _r(minutes / count, 1) if count else 0.0,
                }
            )

        return {
            "range": {
                "from": self.from_.isoformat(),
                "to": self.to.isoformat(),
                "timeZone": self.time_zone,
            },
            "totals": {
                "appointments": self.total,
                "completed": self.completed,
                "noShows": self.no_shows,
                "cancelled": self.cancelled,
                "noShowRate": _r(self.overall_rate),
            },
            "demand": {"matrix": demand_matrix.tolist(), "peak": peak},
            "noShow": {
                "byWeekday": rows(range(7), wd_final, wd_noshow),
                "byHour": rows(range(24), hr_final, hr_noshow),
                "byType": rows(
                    by_type_keys,
                    [self.types[k][0] for k in by_type_keys],
                    [self.types[k][1] for k in by_type_keys],
                ),
                "byLeadTime": rows(LEAD_LABELS, self.lead_final, self.lead_noshow),
            },
            "doctors": doctors,
            "forecast": self._forecast(),
            "recommendations": self._recommendations(peak, doctors),
            "meta": {
                "rowsScanned": self.rows,
                "chunks": self.chunks,
                "durationMs": int((time.perf_counter() - self._t0) * 1000),
                "engine": "numpy",
            },
        }

    def _recommendations(self, peak, doctors) -> list[dict[str, Any]]:
        recs: list[dict[str, Any]] = []
        overall = self.overall_rate
        slots = []
        for c in range(168):
            count = int(self.final_cell[c])
            if count < HIGH_NO_SHOW_MIN_COUNT:
                continue
            rate = self.smooth(int(self.noshow_cell[c]), count)
            if rate >= overall + HIGH_NO_SHOW_MARGIN:
                slots.append((rate, count, c))
        slots.sort(key=lambda s: (-s[0], -s[1], s[2]))
        for rate, count, c in slots[:5]:
            recs.append(
                {
                    "kind": "HIGH_NO_SHOW_SLOT",
                    "params": {
                        "weekday": c // 24,
                        "hour": c % 24,
                        "rate": _r(rate),
                        "count": count,
                    },
                }
            )
        if peak:
            recs.append({"kind": "PEAK_HOURS", "params": {"cells": peak}})
        active = [d for d in doctors if d["appointments"] >= 1]
        if len(active) >= 2:
            med = median(d["bookedMinutes"] for d in active)
            for d in active:
                if d["bookedMinutes"] < UNDERUSED_RATIO * med:
                    recs.append(
                        {
                            "kind": "UNDERUSED_DOCTOR",
                            "params": {
                                "doctorId": d["doctorId"],
                                "bookedMinutes": d["bookedMinutes"],
                                "medianMinutes": _r(med, 1),
                            },
                        }
                    )
        return recs
