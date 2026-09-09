from datetime import datetime

from pydantic import BaseModel, Field


class TaskList(BaseModel):
    id: str
    href: str
    name: str
    is_deck: bool = False


class TaskListCreate(BaseModel):
    name: str = Field(min_length=1)


class TaskListUpdate(BaseModel):
    name: str = Field(min_length=1)


class Task(BaseModel):
    id: str
    uid: str
    list_id: str
    list_name: str
    title: str
    description: str = ""
    markdown: str = ""
    completed: bool = False
    priority: int | None = None
    due_at: datetime | None = None
    reminder_at: datetime | None = None
    tags: list[str] = Field(default_factory=list)
    sort_order: int | None = None
    parent_uid: str | None = None
    children: list["Task"] = Field(default_factory=list)
    etag: str | None = None
    updated_at: datetime | None = None


class TaskCreate(BaseModel):
    list_id: str
    title: str = Field(min_length=1)
    markdown: str = ""
    tags: list[str] = Field(default_factory=list)
    due_at: datetime | None = None
    reminder_at: datetime | None = None
    parent_uid: str | None = None
    priority: int | None = Field(default=None, ge=0, le=9)
    sort_order: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    markdown: str | None = None
    completed: bool | None = None
    tags: list[str] | None = None
    due_at: datetime | None = None
    reminder_at: datetime | None = None
    parent_uid: str | None = None
    priority: int | None = Field(default=None, ge=0, le=9)
    etag: str | None = None
