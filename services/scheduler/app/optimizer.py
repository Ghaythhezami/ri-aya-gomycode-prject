"""Schedule optimiser. Faithful port of `server/src/scheduling/optimizer.ts` (ADR 0003).

Pure and deterministic. Greedy local search: up to MAX_PASSES passes, each movable appointment
(ordered by start, then code) moves to the single best strictly-improving candidate; conflicting
movable appointments are repaired first. Input and output are plain dicts with the camelCase keys
of the TypeScript types (epoch milliseconds), so the HTTP layer only validates and serialises.

Known, accepted differences: strings are compared by Unicode code point (JavaScript compares
UTF-16 units), which only matters for ids outside the BMP.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Any

from .metrics import (
    MINUTE_MS,
    compute_day_metrics,
    doctor_metrics,
    js_round,
    seq_sum,
    waits_for_doctor,
)

MAX_PASSES = 3
IMPROVEMENT_EPSILON = 0.01
IDLE_DOCTOR_FREE_MINUTES = 60
MOVABLE_STATUSES = ("SCHEDULED", "CONFIRMED")

Appt = dict[str, Any]
Doctor = dict[str, Any]
Candidate = dict[str, Any]


def is_movable(a: Appt, now: float) -> bool:
    return (
        a["status"] in MOVABLE_STATUSES
        and a["type"] != "EMERGENCY"
        and not a["locked"]
        and a["start"] > now
    )


def _overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> bool:
    return a_start < b_end and b_start < a_end


def inside_availability(start: float, end: float, available: Sequence[dict[str, Any]]) -> bool:
    return any(start >= i["start"] and end <= i["end"] for i in available)


def _intervals(doctor: Doctor) -> list[tuple[float, float]]:
    return [(i["start"], i["end"]) for i in doctor["available"]]


def _se(items: Sequence[Any]) -> list[tuple[float, float]]:
    return [(x["start"], x["end"]) if isinstance(x, dict) else x for x in items]


def _doctor_value(objective: str, doctor: Doctor, items: Sequence[Any]) -> float:
    """Per-doctor contribution to the objective (lower is better; utilisation is a percentage)."""
    lst = _se(items)
    if objective == "MIN_WAIT":
        return seq_sum(waits_for_doctor(lst))
    d = doctor_metrics(doctor["id"], _intervals(doctor), lst)
    if objective == "REDUCE_GAPS":
        return d["idleGapMinutes"]
    if d["availableMinutes"] > 0:
        return (d["bookedMinutes"] / d["availableMinutes"]) * 100
    return math.nan


def _combine(objective: str, doctors: Sequence[Doctor], value: Callable[[str], float]) -> float:
    if objective != "MAX_UTILISATION":
        total: float = 0
        for d in doctors:
            total = total + value(d["id"])
        return total
    by_specialty: dict[str, list[float]] = {}
    for d in doctors:
        v = value(d["id"])
        if math.isnan(v):
            continue
        by_specialty.setdefault(d["specialty"], []).append(v)
    total = 0
    for values in by_specialty.values():
        mean = seq_sum(values) / len(values)
        total = total + seq_sum((v - mean) ** 2 for v in values) / len(values)
    return total


def _group_by_doctor(appointments: Sequence[Appt]) -> dict[str, list[Appt]]:
    grouped: dict[str, list[Appt]] = {}
    for a in appointments:
        grouped.setdefault(a["doctorId"], []).append(a)
    return grouped


def objective_value(
    objective: str, doctors: Sequence[Doctor], appointments: Sequence[Appt]
) -> float:
    grouped = _group_by_doctor(appointments)
    values = {d["id"]: _doctor_value(objective, d, grouped.get(d["id"], [])) for d in doctors}
    return _combine(objective, doctors, lambda i: values.get(i, 0))


def _better(a: Candidate, b: Candidate) -> bool:
    """True when `a` beats `b`: score, then smaller shift, same doctor, doctor id, earlier start."""
    if abs(a["score"] - b["score"]) > 1e-9:
        return a["score"] < b["score"]
    if a["shift"] != b["shift"]:
        return a["shift"] < b["shift"]
    if a["sameDoctor"] != b["sameDoctor"]:
        return a["sameDoctor"]
    if a["doctorId"] != b["doctorId"]:
        return a["doctorId"] < b["doctorId"]
    return a["start"] < b["start"]


def _is_conflicting(a: Appt, doctor: Doctor | None, siblings: Sequence[Appt]) -> bool:
    if doctor is None:
        return False
    if not inside_availability(a["start"], a["end"], doctor["available"]):
        return True
    return any(
        s["id"] != a["id"] and _overlap(a["start"], a["end"], s["start"], s["end"])
        for s in siblings
    )


def _start_code(a: Appt) -> tuple[float, str]:
    return (a["start"], a["code"])


def optimize(payload: dict[str, Any]) -> dict[str, Any]:
    objective: str = payload["objective"]
    now = payload["now"]
    day_start = payload["dayStart"]
    day_end = payload["dayEnd"]
    shift_minutes = payload.get("maxShiftMinutes")
    max_shift = (120 if shift_minutes is None else shift_minutes) * MINUTE_MS
    slot = payload["slotMinutes"] * MINUTE_MS
    doctors: list[Doctor] = sorted(payload["doctors"], key=lambda d: d["id"])
    doctor_by_id = {d["id"]: d for d in doctors}
    state: list[Appt] = [
        {
            "id": a["id"],
            "code": a["code"],
            "doctorId": a["doctorId"],
            "start": a["start"],
            "end": a["end"],
            "status": a["status"],
            "type": a["type"],
            "locked": a["locked"],
        }
        for a in payload["appointments"]
        if a["doctorId"] in doctor_by_id
    ]
    original = {a["id"]: (a["doctorId"], a["start"]) for a in state}
    doctor_specs = [(d["id"], _intervals(d)) for d in doctors]

    def to_metric(items: Sequence[Appt]) -> list[tuple[str, float, float]]:
        return [(a["doctorId"], a["start"], a["end"]) for a in items]

    before = compute_day_metrics("", doctor_specs, to_metric(state))["totals"]

    def find_best(a: Appt, require_improvement: bool) -> Candidate | None:
        """Best candidate for `a`; without `require_improvement` any valid target qualifies."""
        source = doctor_by_id[a["doctorId"]]
        duration = a["end"] - a["start"]
        grouped = _group_by_doctor(state)
        base = {d["id"]: _doctor_value(objective, d, grouped.get(d["id"], [])) for d in doctors}
        base_score = _combine(objective, doctors, lambda i: base[i])
        origin_start = original[a["id"]][1]
        source_rest = [o for o in grouped.get(source["id"], []) if o["id"] != a["id"]]
        best: Candidate | None = None
        for target in doctors:
            if target["specialty"] != source["specialty"]:
                continue
            others = [o for o in grouped.get(target["id"], []) if o["id"] != a["id"]]
            for interval in target["available"]:
                start = interval["start"]
                while start + duration <= interval["end"]:
                    cur = start
                    start += slot
                    end = cur + duration
                    if cur < now or cur < day_start or end > day_end:
                        continue
                    if abs(cur - origin_start) > max_shift:
                        continue
                    if target["id"] == a["doctorId"] and cur == a["start"]:
                        continue
                    if any(_overlap(cur, end, o["start"], o["end"]) for o in others):
                        continue
                    moved = (cur, end)
                    overrides: dict[str, float] = {}
                    if target["id"] == source["id"]:
                        overrides[target["id"]] = _doctor_value(
                            objective, target, [*_se(source_rest), moved]
                        )
                    else:
                        overrides[source["id"]] = _doctor_value(objective, source, source_rest)
                        overrides[target["id"]] = _doctor_value(
                            objective, target, [*_se(others), moved]
                        )
                    score = _combine(
                        objective,
                        doctors,
                        lambda i, overrides=overrides: overrides[i] if i in overrides else base[i],
                    )
                    if require_improvement and base_score - score <= IMPROVEMENT_EPSILON:
                        continue
                    candidate: Candidate = {
                        "doctorId": target["id"],
                        "start": cur,
                        "score": score,
                        "shift": abs(cur - a["start"]),
                        "sameDoctor": target["id"] == a["doctorId"],
                    }
                    if best is None or _better(candidate, best):
                        best = candidate
        return best

    def apply(a: Appt, c: Candidate) -> None:
        duration = a["end"] - a["start"]
        a["doctorId"] = c["doctorId"]
        a["start"] = c["start"]
        a["end"] = c["start"] + duration

    def movable_ordered() -> list[Appt]:
        return sorted((s for s in state if is_movable(s, now)), key=_start_code)

    # 1. Repair the conflicts that can be repaired.
    for a in movable_ordered():
        siblings = [s for s in state if s["doctorId"] == a["doctorId"]]
        if not _is_conflicting(a, doctor_by_id.get(a["doctorId"]), siblings):
            continue
        best = find_best(a, False)
        if best:
            apply(a, best)

    # 2. Greedy improvement passes.
    for _ in range(MAX_PASSES):
        changed = False
        for a in movable_ordered():
            best = find_best(a, True)
            if best:
                apply(a, best)
                changed = True
        if not changed:
            break

    moves: list[dict[str, Any]] = []
    for a in sorted(state, key=_start_code):
        from_doctor, from_start = original[a["id"]]
        if from_doctor == a["doctorId"] and from_start == a["start"]:
            continue
        moves.append(
            {
                "appointmentId": a["id"],
                "code": a["code"],
                "fromDoctorId": from_doctor,
                "toDoctorId": a["doctorId"],
                "fromStart": from_start,
                "toStart": a["start"],
                "durationMinutes": js_round((a["end"] - a["start"]) / MINUTE_MS),
                "reasonKey": f"scheduling.reasons.{objective}",
            }
        )
    moves.sort(key=lambda m: (m["fromStart"], m["code"]))

    grouped = _group_by_doctor(state)
    unresolved = [
        {"appointmentId": a["id"], "code": a["code"], "reasonKey": "scheduling.reasons.noSlot"}
        for a in sorted(state, key=_start_code)
        if _is_conflicting(a, doctor_by_id.get(a["doctorId"]), grouped.get(a["doctorId"], []))
    ]

    after = compute_day_metrics("", doctor_specs, to_metric(state))
    idle = [
        {"doctorId": d["doctorId"], "freeMinutes": d["freeMinutes"]}
        for d in after["perDoctor"]
        if d["freeMinutes"] >= IDLE_DOCTOR_FREE_MINUTES
    ]
    return {
        "moves": moves,
        "before": before,
        "after": after["totals"],
        "unresolved": unresolved,
        "idleDoctors": idle,
        "status": "IMPROVED" if moves else "NO_IMPROVEMENT",
        "appointments": state,
    }
