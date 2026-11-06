"""Wire models of `POST /v1/reports/analytics`. Loose on purpose: the API builds the payload from
its own `AnalyticsDto` / `SchedulingInsights`; unknown keys are ignored and missing ones default."""

from __future__ import annotations

from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, FiniteFloat, field_validator

from .schemas import CamelModel

MAX_ITEMS = 1000


class ReportClinic(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    time_zone: str = Field(max_length=64)
    currency: str | None = Field(default=None, max_length=8)

    @field_validator("time_zone")
    @classmethod
    def _zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError, OSError):
            raise ValueError("timeZone must be a valid IANA time zone") from None
        return value


class ReportRange(CamelModel):
    from_: str = Field(alias="from", max_length=10, pattern=r"^\d{4}-\d{2}-\d{2}$")
    to: str = Field(max_length=10, pattern=r"^\d{4}-\d{2}-\d{2}$")
    label: str | None = Field(default=None, max_length=120)


class Kpis(CamelModel):
    volume: float = 0
    volume_change_pct: float | None = None
    no_show_rate: float = 0
    no_show_rate_change: float | None = None
    cancellation_rate: float = 0
    cancellation_rate_change: float | None = None
    avg_wait_minutes: float = 0
    avg_wait_change: float | None = None
    throughput_per_day: float = 0
    throughput_change_pct: float | None = None
    avg_duration_minutes: float = 0


class DayCount(CamelModel):
    date: str = Field(max_length=10)
    count: float = 0


class DayMinutes(CamelModel):
    date: str = Field(max_length=10)
    minutes: float = 0


class SpecialtyCount(CamelModel):
    specialty: str = Field(max_length=120)
    count: float = 0


class StatusCount(CamelModel):
    status: str = Field(max_length=32)
    count: float = 0


class DoctorUtil(CamelModel):
    name: str = Field(default="", max_length=120)
    utilisation: float = 0


class HourCount(CamelModel):
    hour: int = Field(ge=0, le=23)
    count: float = 0


class AnalyticsPayload(CamelModel):
    kpis: Kpis = Field(default_factory=Kpis)
    volume_by_day: list[DayCount] = Field(default_factory=list, max_length=MAX_ITEMS)
    wait_by_day: list[DayMinutes] = Field(default_factory=list, max_length=MAX_ITEMS)
    by_specialty: list[SpecialtyCount] = Field(default_factory=list, max_length=200)
    status_distribution: list[StatusCount] = Field(default_factory=list, max_length=20)
    doctor_utilisation: list[DoctorUtil] = Field(default_factory=list, max_length=200)
    peak_hours: list[HourCount] = Field(default_factory=list, max_length=24)


class InsightRate(CamelModel):
    key: str = Field(max_length=64)
    rate: float = 0
    count: float = 0


class InsightTotals(CamelModel):
    appointments: float = 0
    no_shows: float = 0
    no_show_rate: float = 0


class InsightDemand(CamelModel):
    # 7 weekdays x 24 hours, finite numbers only (no inf/nan from a crafted payload).
    matrix: list[Annotated[list[FiniteFloat], Field(max_length=24)]] = Field(
        default_factory=list, max_length=7
    )


class InsightNoShow(CamelModel):
    by_lead_time: list[InsightRate] = Field(default_factory=list, max_length=12)


class InsightDoctor(CamelModel):
    doctor_name: str | None = Field(default=None, max_length=120)
    appointments: float = 0
    no_show_rate: float = 0


class ForecastDay(CamelModel):
    date: str = Field(max_length=10)
    expected: float = 0


class Recommendation(CamelModel):
    kind: str = Field(max_length=40)
    params: dict[str, object] = Field(default_factory=dict)


class InsightsPayload(CamelModel):
    totals: InsightTotals = Field(default_factory=InsightTotals)
    demand: InsightDemand = Field(default_factory=InsightDemand)
    no_show: InsightNoShow = Field(default_factory=InsightNoShow)
    doctors: list[InsightDoctor] = Field(default_factory=list, max_length=200)
    forecast: list[ForecastDay] = Field(default_factory=list, max_length=60)
    recommendations: list[Recommendation] = Field(default_factory=list, max_length=50)


class ReportRequest(CamelModel):
    locale: Literal["en", "fr", "ar"]
    clinic: ReportClinic
    range: ReportRange
    scope: Literal["clinic", "organization"] = "clinic"
    generated_at: str = Field(max_length=40)
    analytics: AnalyticsPayload
    insights: InsightsPayload | None = None
