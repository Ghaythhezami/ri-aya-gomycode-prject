"""Wire models. camelCase on the wire, datetimes as ISO 8601 UTC strings with `Z`."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

NotificationCategory = Literal[
    "REMINDER", "CONFIRMATION", "CANCELLATION", "CONFLICT", "DELAY", "AVAILABILITY", "SYSTEM"
]
EntityType = Literal["appointment", "patient", "doctor", "queue"]
Params = dict[str, str | int | float]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class StrictInput(CamelModel):
    """Inputs reject unknown keys, so a body can never smuggle a `clinicId`."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


# ------------------------------------------------------------------ notifications


class NotificationIn(StrictInput):
    user_id: str | None = Field(default=None, min_length=1, max_length=64)
    category: NotificationCategory
    title_key: str = Field(min_length=1, max_length=200)
    body_key: str = Field(min_length=1, max_length=200)
    params: Params = Field(default_factory=dict)
    entity_type: EntityType | None = None
    entity_id: str | None = Field(default=None, max_length=64)
    dedupe_key: str = Field(min_length=1, max_length=200)


class BulkNotificationsIn(StrictInput):
    items: list[NotificationIn] = Field(min_length=1, max_length=1000)


class NotificationOut(CamelModel):
    id: str
    category: NotificationCategory
    title_key: str
    body_key: str
    params: Params
    entity_type: EntityType | None
    entity_id: str | None
    read: bool
    created_at: str


class NotificationPageOut(CamelModel):
    items: list[NotificationOut]
    next_cursor: str | None
    unread_count: int


class CreatedOut(CamelModel):
    id: str
    created: bool


class BulkOut(CamelModel):
    created: int
    duplicates: int


class CountOut(CamelModel):
    count: int
    capped: bool


class SuccessOut(CamelModel):
    success: bool


class UpdatedOut(CamelModel):
    updated: int


class CategoryStat(CamelModel):
    category: str
    count: int
    unread: int


class DayStat(CamelModel):
    date: str
    count: int


class StatsOut(CamelModel):
    from_: str = Field(alias="from")
    to: str
    total: int
    by_category: list[CategoryStat]
    by_day: list[DayStat]

    model_config = ConfigDict(populate_by_name=True)


# ------------------------------------------------------------------ chat


class ConversationIn(StrictInput):
    member_ids: list[str] = Field(max_length=50)
    title: str | None = Field(default=None, max_length=120)


class MessageIn(StrictInput):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class LastMessageOut(CamelModel):
    body: str
    created_at: str
    sender_id: str


class ConversationOut(CamelModel):
    id: str
    title: str | None
    is_group: bool
    member_ids: list[str]
    last_message: LastMessageOut | None
    unread_count: int
    created_at: str
    updated_at: str


class MessageOut(CamelModel):
    id: str
    conversation_id: str
    sender_id: str
    body: str
    read_by: list[str]
    read_by_others: bool
    created_at: str


class MessagePageOut(CamelModel):
    items: list[MessageOut]
    next_cursor: str | None


# ------------------------------------------------------------------ admin


class ImportNotification(StrictInput):
    id: str = Field(min_length=1, max_length=64)
    user_id: str | None = None
    category: NotificationCategory
    title_key: str
    body_key: str
    params: Params = Field(default_factory=dict)
    entity_type: EntityType | None = None
    entity_id: str | None = None
    dedupe_key: str = Field(min_length=1, max_length=200)
    read_by: list[str] = Field(default_factory=list)
    created_at: datetime


class ImportConversation(StrictInput):
    id: str = Field(min_length=1, max_length=64)
    title: str | None = None
    is_group: bool = False
    member_ids: list[str] = Field(min_length=1, max_length=50)
    created_at: datetime
    updated_at: datetime | None = None


class ImportMessage(StrictInput):
    id: str = Field(min_length=1, max_length=64)
    conversation_id: str = Field(min_length=1, max_length=64)
    sender_id: str = Field(min_length=1, max_length=64)
    body: str = Field(min_length=1, max_length=2000)
    read_by: list[str] = Field(default_factory=list)
    created_at: datetime


class ImportRead(StrictInput):
    user_id: str = Field(min_length=1, max_length=64)
    read_all_at: datetime


class ImportIn(StrictInput):
    notifications: list[ImportNotification] = Field(default_factory=list, max_length=10000)
    conversations: list[ImportConversation] = Field(default_factory=list, max_length=10000)
    messages: list[ImportMessage] = Field(default_factory=list, max_length=10000)
    reads: list[ImportRead] = Field(default_factory=list, max_length=10000)


class ImportOut(CamelModel):
    notifications: int
    conversations: int
    messages: int
    reads: int = 0
    skipped: int


class ResetOut(CamelModel):
    notifications: int
    conversations: int
    messages: int
    reads: int = 0
