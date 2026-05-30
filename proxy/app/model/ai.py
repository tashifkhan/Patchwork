from datetime import datetime

from pydantic import BaseModel, Field

from app.model.task import TaskList


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


class AiTasksResponse(BaseModel):
    tasks: list[AiGeneratedTask]


class AiRefineRequest(BaseModel):
    instruction: str
    tasks: list[AiGeneratedTask]
    available_lists: list[TaskList] = Field(default_factory=list)
    available_tags: list[str] = Field(default_factory=list)


class AiDraftRequest(BaseModel):
    instruction: str
    available_lists: list[TaskList] = Field(default_factory=list)
    available_tags: list[str] = Field(default_factory=list)


class AiOcrRequest(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"
    available_lists: list[TaskList] = Field(default_factory=list)
    available_tags: list[str] = Field(default_factory=list)
