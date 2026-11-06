"""Day metrics and the waiting model. Port of `server/src/scheduling/metrics.ts` (pure).

Parity notes: JavaScript `Math.round` rounds halves up (towards +inf), Python `round` rounds to
even, so `js_round` is used everywhere. Python 3.12 `sum()` of floats is compensated, JavaScript
`reduce` is not, so sums go through `seq_sum` (plain left-to-right addition from 0).

Intervals and appointments are `(start, end)` tuples of epoch milliseconds.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from typing import Any

MINUTE_MS = 60_000
OVERRUN_FACTOR = 1.15

Interval = tuple[float, float]


def js_round(value: float) -> float:
    """`Math.round`: nearest integer, halves towards +infinity."""
    if not math.isfinite(value):
        return value
    floor = math.floor(value)
    return floor + 1 if value - floor >= 0.5 else floor


def round1(value: float) -> float:
    return js_round(value * 10) / 10


def seq_sum(values: Iterable[float]) -> float:
    total: float = 0
    for v in values:
        total = total + v
    return total


def merge_intervals(intervals: Iterable[Interval]) -> list[Interval]:
    ordered = sorted((i for i in intervals if i[1] > i[0]), key=lambda i: i[0])
    out: list[Interval] = []
    for start, end in ordered:
        if out and start <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], end))
        else:
            out.append((start, end))
    return out


def total_minutes(intervals: Iterable[Interval]) -> float:
    return seq_sum((end - start) / MINUTE_MS for start, end in merge_intervals(intervals))


def waits_for_doctor(appointments: Sequence[Interval]) -> list[float]:
    """Wait of every appointment (minutes), in start order."""
    ordered = sorted(appointments, key=lambda a: (a[0], a[1]))
    waits: list[float] = []
    previous_finish = -math.inf
    for start, end in ordered:
        wait = max(0, previous_finish - start) / MINUTE_MS if math.isfinite(previous_finish) else 0
        waits.append(wait)
        service = (end - start) * OVERRUN_FACTOR
        previous_finish = max(start, previous_finish) + service
    return waits


def sum_waits(appointments: Sequence[Interval]) -> float:
    return seq_sum(waits_for_doctor(appointments))


def _clipped_booked(available: Sequence[Interval], appointments: Sequence[Interval]):
    clipped: list[Interval] = []
    for slot_start, slot_end in available:
        for a_start, a_end in appointments:
            start = max(slot_start, a_start)
            end = min(slot_end, a_end)
            if end > start:
                clipped.append((start, end))
    return merge_intervals(clipped)


def _idle_gaps(available: Sequence[Interval], booked: Sequence[Interval]) -> float:
    gaps: float = 0
    for slot_start, slot_end in available:
        inside = [b for b in booked if b[0] >= slot_start and b[1] <= slot_end]
        for i in range(1, len(inside)):
            gaps = gaps + (inside[i][0] - inside[i - 1][1]) / MINUTE_MS
    return gaps


def doctor_metrics(
    doctor_id: str, available: Sequence[Interval], appointments: Sequence[Interval]
) -> dict[str, Any]:
    available_minutes = total_minutes(available)
    booked = _clipped_booked(available, appointments)
    booked_minutes = total_minutes(booked)
    waits = waits_for_doctor(appointments)
    average = seq_sum(waits) / len(waits) if waits else 0
    return {
        "doctorId": doctor_id,
        "bookedMinutes": round1(booked_minutes),
        "availableMinutes": round1(available_minutes),
        "freeMinutes": round1(max(0, available_minutes - booked_minutes)),
        "idleGapMinutes": round1(_idle_gaps(available, booked)),
        "utilisation": (
            js_round(booked_minutes / available_minutes * 100) if available_minutes > 0 else 0
        ),
        "estimatedWaitMinutes": round1(average),
    }


def compute_day_metrics(
    date: str,
    doctors: Sequence[tuple[str, Sequence[Interval]]],
    appointments: Sequence[tuple[str, float, float]],
) -> dict[str, Any]:
    """`doctors` are `(id, available)`, `appointments` are `(doctorId, start, end)`."""
    per_doctor = [
        doctor_metrics(doctor_id, available, [(s, e) for d, s, e in appointments if d == doctor_id])
        for doctor_id, available in doctors
    ]
    known = {doctor_id for doctor_id, _ in doctors}
    counted = [a for a in appointments if a[0] in known]
    available = seq_sum(d["availableMinutes"] for d in per_doctor)
    booked = seq_sum(d["bookedMinutes"] for d in per_doctor)
    wait_sum = seq_sum(
        sum_waits([(s, e) for d, s, e in counted if d == doctor_id]) for doctor_id, _ in doctors
    )
    totals = {
        "appointments": len(counted),
        "bookedMinutes": round1(booked),
        "availableMinutes": round1(available),
        "utilisation": js_round(booked / available * 100) if available > 0 else 0,
        "availability": (js_round((available - booked) / available * 100) if available > 0 else 0),
        "idleGapMinutes": round1(seq_sum(d["idleGapMinutes"] for d in per_doctor)),
        "estimatedWaitMinutes": round1(wait_sum / len(counted)) if counted else 0,
    }
    return {"date": date, "perDoctor": per_doctor, "totals": totals}
