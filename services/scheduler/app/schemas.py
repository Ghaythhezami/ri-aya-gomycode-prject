"""Wire models (camelCase, ADR 0003). Optimiser types mirror `optimizer.ts`."""

from __future__ import annotations

from datetime import date
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator
from pydantic.alias_generators import to_camel

MAX_RANGE_DAYS = 730


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class Interval(CamelModel):
    start: int
    end: int


class OptDoctor(CamelModel):
    id: str = Field(min_length=1, max_length=128)
    specialty: str = Field(max_length=128)
    available: list[Interval] = Field(max_length=64)


class OptAppointment(CamelModel):
    id: str = Field(min_length=1, max_length=128)
    code: str = Field(max_length=64)
    doctor_id: str = Field(max_length=128)
    start: int
    end: int
    status: str = Field(max_length=32)
    type: str = Field(max_length=32)
    locked: bool


class OptimizerInput(CamelModel):
    doctors: list[OptDoctor] = Field(max_length=200)
    appointments: list[OptAppointment] = Field(max_length=5000)
    objective: Literal["MIN_WAIT", "REDUCE_GAPS", "MAX_UTILISATION"]
    now: int
    slot_minutes: int = Field(ge=1, le=1440)
    max_shift_minutes: int | None = Field(default=None, ge=0, le=1440)
    day_start: int
    day_end: int

    @field_validator("day_end")
    @classmethod
    def _day_span(cls, value: int, info: ValidationInfo) -> int:
        start = info.data.get("day_start")
        if start is not None and not 0 < value - start <= 48 * 3_600_000:
            raise ValueError("dayEnd must be after dayStart, at most 48 hours later")
        return value


class InsightsRequest(CamelModel):
    from_: date = Field(alias="from")
    to: date
    time_zone: str = Field(max_length=64)

    @field_validator("time_zone")
    @classmethod
    def _zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError, OSError):
            raise ValueError("timeZone must be a valid IANA time zone") from None
        return value

    @field_validator("to")
    @classmethod
    def _range(cls, value: date, info: ValidationInfo) -> date:
        start = info.data.get("from_")
        if start is None:
            return value
        if value < start:
            raise ValueError("from must be on or before to")
        if (value - start).days + 1 > MAX_RANGE_DAYS:
            raise ValueError(f"range must be at most {MAX_RANGE_DAYS} days")
        return value
