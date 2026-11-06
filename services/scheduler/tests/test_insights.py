from __future__ import annotations

from datetime import date, timedelta

import numpy as np

from app.insights import PRIOR_WEIGHT, InsightsAggregator, day_bounds_utc
from tests.helpers import local_ts, make_chunk

DAY = 86400
TZ = "Europe/Paris"


def row(start: str, status="COMPLETED", kind="CONSULTATION", doctor="d1", minutes=30, lead_days=3):
    s = local_ts(start)
    return (s, s + minutes * 60, s - lead_days * DAY, status, kind, doctor)


def run(rows, from_="2026-01-01", to="2026-12-31", tz=TZ, size=None):
    agg = InsightsAggregator(date.fromisoformat(from_), date.fromisoformat(to), tz)
    size = size or len(rows) or 1
    for i in range(0, len(rows), size):
        agg.add_chunk(make_chunk(rows[i : i + size]))
    return agg.result()


def test_totals_and_cancelled_excluded_from_demand() -> None:
    rows = [
        row("2026-02-02 09:00"),
        row("2026-02-02 09:30", "NO_SHOW"),
        row("2026-02-02 09:45", "CANCELLED"),
        row("2026-02-02 10:00", "CONFIRMED"),
    ]
    out = run(rows)
    assert out["totals"] == {
        "appointments": 4,
        "completed": 1,
        "noShows": 1,
        "cancelled": 1,
        "noShowRate": 0.5,
    }
    # 2026-02-02 is a Monday: demand has 09h x2 and 10h x1, cancelled not counted
    assert out["demand"]["matrix"][0][9] == 2
    assert out["demand"]["matrix"][0][10] == 1
    assert sum(map(sum, out["demand"]["matrix"])) == 3
    assert out["meta"]["rowsScanned"] == 4
    assert out["meta"]["engine"] == "numpy"


def test_chunking_does_not_change_the_result() -> None:
    rows = [row(f"2026-02-{d:02d} {h:02d}:00") for d in range(1, 20) for h in (9, 10, 14)]
    rows += [row("2026-02-03 11:00", "NO_SHOW", doctor="d2")] * 5
    whole = run(rows)
    split = run(rows, size=7)
    for key in ("totals", "demand", "noShow", "doctors", "forecast", "recommendations"):
        assert whole[key] == split[key]
    assert split["meta"]["chunks"] > whole["meta"]["chunks"]


def test_bayesian_smoothing_towards_overall_rate() -> None:
    # Overall: 100 final, 20 no-shows (0.2). Monday 09h has 2 final, both no-show.
    rows = [row("2026-02-03 10:00", "COMPLETED")] * 82  # Tuesday
    rows += [row("2026-02-03 10:00", "NO_SHOW")] * 18
    rows += [row("2026-02-02 09:00", "NO_SHOW")] * 2  # Monday
    out = run(rows)
    overall = 20 / 102
    expected_monday = (2 + PRIOR_WEIGHT * overall) / (2 + PRIOR_WEIGHT)
    monday = out["noShow"]["byWeekday"][0]
    assert monday["key"] == "0" and monday["count"] == 2
    assert monday["rate"] == round(expected_monday, 4)
    assert monday["rate"] < 1.0  # raw rate would be 1.0
    # A bucket with no data falls back to the overall rate.
    wednesday = out["noShow"]["byWeekday"][2]
    assert wednesday["count"] == 0
    assert wednesday["rate"] == round(overall, 4)


def test_no_final_appointments_gives_zero_rates() -> None:
    out = run([row("2026-02-02 09:00", "SCHEDULED")])
    assert out["totals"]["noShowRate"] == 0
    assert all(r["rate"] == 0 for r in out["noShow"]["byHour"])


def test_dst_boundaries_europe_paris() -> None:
    # Spring forward 2026-03-29: 08:00 local is UTC+2 on Sunday, UTC+1 the day before.
    # Autumn back 2026-10-25: 00:30 local (UTC+2) is still Sunday although UTC says Saturday 22:30.
    rows = [
        row("2026-03-28 08:00"),  # Saturday (5)
        row("2026-03-29 08:00"),  # Sunday (6)
        row("2026-10-25 00:30"),  # Sunday (6), hour 0
        row("2026-10-25 23:30"),  # Sunday (6), hour 23 (UTC+1)
    ]
    matrix = run(rows)["demand"]["matrix"]
    assert matrix[5][8] == 1
    assert matrix[6][8] == 1
    assert matrix[6][0] == 1
    assert matrix[6][23] == 1
    assert sum(map(sum, matrix)) == 4


def test_local_time_differs_from_utc_for_other_zones() -> None:
    s = local_ts("2026-02-02 23:30", "Pacific/Auckland")  # Monday 23:30 NZDT = Monday 10:30 UTC
    agg = InsightsAggregator(date(2026, 1, 1), date(2026, 12, 31), "Pacific/Auckland")
    agg.add_chunk(make_chunk([(s, s + 1800, s - DAY, "COMPLETED", "CONSULTATION", "d")]))
    assert agg.result()["demand"]["matrix"][0][23] == 1


def test_lead_time_buckets() -> None:
    rows = [
        row("2026-02-02 09:00", "NO_SHOW", lead_days=0),
        row("2026-02-02 09:00", "COMPLETED", lead_days=1),
        row("2026-02-02 09:00", "COMPLETED", lead_days=2),
        row("2026-02-02 09:00", "NO_SHOW", lead_days=7),
        row("2026-02-02 09:00", "COMPLETED", lead_days=8),
        row("2026-02-02 09:00", "COMPLETED", lead_days=30),
        row("2026-02-02 09:00", "COMPLETED", lead_days=31),
        row("2026-02-02 09:00", "COMPLETED", lead_days=200),
    ]
    by_lead = {r["key"]: r["count"] for r in run(rows)["noShow"]["byLeadTime"]}
    assert by_lead == {"0-1d": 2, "2-7d": 2, "8-30d": 2, "31d+": 2}


def test_by_type_and_doctors() -> None:
    rows = [row("2026-02-02 09:00", kind="FOLLOW_UP", doctor="d2", minutes=45)] * 2
    rows += [row("2026-02-02 10:00", kind="CONSULTATION", doctor="d1", minutes=15)]
    out = run(rows)
    assert {t["key"]: t["count"] for t in out["noShow"]["byType"]} == {
        "CONSULTATION": 1,
        "FOLLOW_UP": 2,
    }
    by_id = {d["doctorId"]: d for d in out["doctors"]}
    assert by_id["d2"]["appointments"] == 2
    assert by_id["d2"]["bookedMinutes"] == 90
    assert by_id["d2"]["avgDurationMinutes"] == 45
    assert by_id["d1"]["avgDurationMinutes"] == 15


def test_forecast_weighted_same_weekday() -> None:
    # 8 Mondays, i+1 bookings on the i-th Monday (oldest first); range ends on Sunday 2026-03-01.
    start = date(2026, 1, 5)
    rows = []
    for i in range(8):
        monday = start + timedelta(days=7 * i)
        rows += [row(f"{monday.isoformat()} 09:00")] * (i + 1)
    out = run(rows, "2026-01-05", "2026-03-01")
    assert len(out["forecast"]) == 14
    assert out["forecast"][0]["date"] == "2026-03-02"  # a Monday
    weights = [0.5 ** (j / 2) for j in range(8)]
    counts_recent_first = [8, 7, 6, 5, 4, 3, 2, 1]
    expected = sum(w * c for w, c in zip(weights, counts_recent_first, strict=True)) / sum(weights)
    assert out["forecast"][0]["expected"] == round(expected, 2)
    assert out["forecast"][1]["expected"] == 0  # Tuesdays had no bookings
    assert out["forecast"][7]["date"] == "2026-03-09"
    assert out["forecast"][7]["expected"] == out["forecast"][0]["expected"]


def test_forecast_uses_available_days_only() -> None:
    out = run([row("2026-02-02 09:00")] * 3, "2026-02-02", "2026-02-08")
    assert out["forecast"][0]["date"] == "2026-02-09"
    assert out["forecast"][0]["expected"] == 3


def test_recommendation_high_no_show_slot() -> None:
    rows = [row("2026-02-03 09:00", "COMPLETED")] * 10  # Tuesday 09h
    rows += [row("2026-02-03 09:00", "NO_SHOW")] * 20
    rows += [row("2026-02-04 14:00", "COMPLETED")] * 200  # Wednesday 14h
    out = run(rows)
    slots = [r for r in out["recommendations"] if r["kind"] == "HIGH_NO_SHOW_SLOT"]
    assert len(slots) == 1
    params = slots[0]["params"]
    assert (params["weekday"], params["hour"], params["count"]) == (1, 9, 30)
    assert params["rate"] > out["totals"]["noShowRate"] + 0.10


def test_no_recommendation_when_count_below_20() -> None:
    rows = [row("2026-02-03 09:00", "NO_SHOW")] * 10 + [row("2026-02-04 14:00")] * 200
    kinds = [r["kind"] for r in run(rows)["recommendations"]]
    assert "HIGH_NO_SHOW_SLOT" not in kinds


def test_peak_hours_top_three() -> None:
    rows = (
        [row("2026-02-02 09:00")] * 5
        + [row("2026-02-03 10:00")] * 4
        + [row("2026-02-04 11:00")] * 3
        + [row("2026-02-05 12:00")] * 1
    )
    out = run(rows)
    peak = out["demand"]["peak"]
    assert [(p["weekday"], p["hour"], p["count"]) for p in peak] == [
        (0, 9, 5),
        (1, 10, 4),
        (2, 11, 3),
    ]
    rec = next(r for r in out["recommendations"] if r["kind"] == "PEAK_HOURS")
    assert rec["params"]["cells"] == peak


def test_underused_doctor() -> None:
    rows = [row("2026-02-02 09:00", doctor="a")] * 10
    rows += [row("2026-02-02 10:00", doctor="b")] * 10
    rows += [row("2026-02-02 11:00", doctor="c")] * 1
    out = run(rows)
    flagged = [
        r["params"]["doctorId"] for r in out["recommendations"] if r["kind"] == "UNDERUSED_DOCTOR"
    ]
    assert flagged == ["c"]


def test_empty_range_result() -> None:
    agg = InsightsAggregator(date(2026, 1, 1), date(2026, 1, 31), TZ)
    out = agg.result()
    assert out["totals"]["appointments"] == 0
    assert out["recommendations"] == []
    assert len(out["forecast"]) == 14
    assert out["meta"]["chunks"] == 0


def test_day_bounds_utc_follow_local_midnight() -> None:
    lo, hi = day_bounds_utc(date(2026, 3, 29), date(2026, 3, 29), TZ)
    assert lo.isoformat() == "2026-03-28T23:00:00"  # UTC+1 at local midnight
    assert hi.isoformat() == "2026-03-29T22:00:00"  # 23-hour day, UTC+2 afterwards


def test_large_chunk_vectorised_matches_scalar() -> None:
    rng = np.random.default_rng(1)
    starts = rng.integers(1_767_225_600, 1_798_761_600, 5000)
    agg = InsightsAggregator(date(2026, 1, 1), date(2026, 12, 31), TZ)
    local = agg.local_seconds(starts)
    from datetime import datetime
    from zoneinfo import ZoneInfo

    tz = ZoneInfo(TZ)
    for s, lcl in list(zip(starts.tolist(), local.tolist(), strict=True))[:200]:
        dt = datetime.fromtimestamp(s, tz)
        assert lcl == s + int(dt.utcoffset().total_seconds())
