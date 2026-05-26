from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    nextcloud_configured: bool
    gemini_configured: bool


class TaskList(BaseModel):
    id: str
    href: str
    name: str
    is_deck: bool = False


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


class DeckBoard(BaseModel):
    id: int
    title: str
    raw: dict


class AiGeneratedSubtask(BaseModel):
    title: str
    description: str | None = None


class AiGeneratedTask(BaseModel):
    title: str
    description: str | None = None
    list_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    due_at: datetime | None = None
    reminder_at: datetime | None = None
    priority: int | None = Field(default=None, ge=0, le=9)
    subtasks: list[AiGeneratedSubtask] = Field(default_factory=list)


class AiRefineRequest(BaseModel):
    instruction: str
    tasks: list[AiGeneratedTask]
    available_lists: list[TaskList] = Field(default_factory=list)
    available_tags: list[str] = Field(default_factory=list)


class AiOcrRequest(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"
    available_lists: list[TaskList] = Field(default_factory=list)
    available_tags: list[str] = Field(default_factory=list)
