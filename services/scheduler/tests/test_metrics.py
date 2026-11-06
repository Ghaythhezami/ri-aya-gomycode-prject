from __future__ import annotations

import math

from app.metrics import (
    MINUTE_MS,
    compute_day_metrics,
    doctor_metrics,
    js_round,
    merge_intervals,
    round1,
    seq_sum,
    total_minutes,
    waits_for_doctor,
)

M = MINUTE_MS


def test_js_round_halves_go_up() -> None:
    assert js_round(0.5) == 1
    assert js_round(1.5) == 2
    assert js_round(2.5) == 3  # Python round() would give 2
    assert js_round(-0.5) == 0  # Math.round(-0.5) is -0
    assert js_round(-1.5) == -1
    assert js_round(0.49999999999999994) == 0


def test_round1() -> None:
    assert round1(1.25) == 1.3
    assert round1(1.24) == 1.2
    assert round1(0) == 0


def test_seq_sum_is_plain_left_to_right() -> None:
    values = [0.1] * 10
    total = 0.0
    for v in values:
        total += v
    assert seq_sum(values) == total


def test_merge_intervals() -> None:
    assert merge_intervals([(5, 10), (0, 5), (20, 30), (7, 7)]) == [(0, 10), (20, 30)]


def test_total_minutes_merges_overlap() -> None:
    assert total_minutes([(0, 30 * M), (15 * M, 60 * M)]) == 60


def test_waits_follow_overrun_model() -> None:
    # 30 min appointments back to back: service 34.5 min, so each waits 4.5 min more than the last.
    waits = waits_for_doctor([(0, 30 * M), (30 * M, 60 * M), (60 * M, 90 * M)])
    assert waits[0] == 0
    assert math.isclose(waits[1], 4.5)
    assert math.isclose(waits[2], 9.0)


def test_doctor_metrics_idle_gap_and_utilisation() -> None:
    result = doctor_metrics("d", [(0, 120 * M)], [(0, 30 * M), (60 * M, 90 * M)])
    assert result["bookedMinutes"] == 60
    assert result["availableMinutes"] == 120
    assert result["freeMinutes"] == 60
    assert result["idleGapMinutes"] == 30
    assert result["utilisation"] == 50


def test_compute_day_metrics_totals_ignore_unknown_doctors() -> None:
    day = compute_day_metrics(
        "",
        [("a", [(0, 60 * M)])],
        [("a", 0, 30 * M), ("ghost", 0, 30 * M)],
    )
    assert day["totals"]["appointments"] == 1
    assert day["totals"]["utilisation"] == 50
    assert day["totals"]["availability"] == 50


def test_empty_day() -> None:
    day = compute_day_metrics("", [("a", [])], [])
    assert day["totals"]["utilisation"] == 0
    assert day["totals"]["estimatedWaitMinutes"] == 0
