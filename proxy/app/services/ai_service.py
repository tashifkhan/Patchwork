import base64
import binascii
import json
import textwrap
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, UploadFile, status
from pydantic import TypeAdapter, ValidationError

from app.clients.litellm_client import LiteLLMClient
from app.core.config import Settings
from app.model.ai import AiDraftRequest, AiGeneratedTask, AiOcrRequest, AiRefineRequest, AiTasksResponse
from app.model.task import TaskList

TASK_LIST_ADAPTER = TypeAdapter(list[TaskList])
STRING_LIST_ADAPTER = TypeAdapter(list[str])


class AiService:
    def __init__(self, settings: Settings, litellm_client: LiteLLMClient) -> None:
        self.settings = settings
        self.litellm_client = litellm_client

    async def parse_image_tasks(self, request: AiOcrRequest) -> AiTasksResponse:
        image_bytes = _decode_base64_image(request.image_base64)
        return await self._parse_image_bytes(
            image_bytes=image_bytes,
            mime_type=request.mime_type,
            available_lists=request.available_lists,
            available_tags=request.available_tags,
        )

    async def parse_uploaded_image_tasks(
        self,
        *,
        file: UploadFile,
        available_lists: list[TaskList],
        available_tags: list[str],
    ) -> AiTasksResponse:
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Upload must be an image",
            )

        image_bytes = await file.read()
        max_bytes = self.settings.ai_upload_max_mb * 1024 * 1024
        if len(image_bytes) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Image must be {self.settings.ai_upload_max_mb}MB or smaller",
            )

        return await self._parse_image_bytes(
            image_bytes=image_bytes,
            mime_type=file.content_type,
            available_lists=available_lists,
            available_tags=available_tags,
        )

    async def draft_tasks(self, request: AiDraftRequest) -> AiTasksResponse:
        prompt = _build_draft_prompt(request)
        response_text = await self.litellm_client.generate_json(prompt)
        return AiTasksResponse(tasks=_parse_task_json(response_text))

    async def refine_tasks(self, request: AiRefineRequest) -> AiTasksResponse:
        prompt = _build_refine_prompt(request)
        response_text = await self.litellm_client.generate_json(prompt)
        return AiTasksResponse(tasks=_parse_task_json(response_text))

    async def _parse_image_bytes(
        self,
        *,
        image_bytes: bytes,
        mime_type: str,
        available_lists: list[TaskList],
        available_tags: list[str],
    ) -> AiTasksResponse:
        if not image_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Image is empty"
            )

        prompt = _build_ocr_prompt(available_lists, available_tags)
        response_text = await self.litellm_client.generate_json(
            prompt,
            image_bytes=image_bytes,
            mime_type=mime_type,
        )
        return AiTasksResponse(tasks=_parse_task_json(response_text))


def parse_task_lists_form(value: str | None) -> list[TaskList]:
    if not value:
        return []

    try:
        return TASK_LIST_ADAPTER.validate_json(value)

    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="available_lists must be a JSON array of task lists",
        ) from exc


def parse_tags_form(value: str | None) -> list[str]:
    if not value:
        return []

    try:
        return STRING_LIST_ADAPTER.validate_json(value)

    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="available_tags must be a JSON array of strings",
        ) from exc


def _decode_base64_image(value: str) -> bytes:
    encoded = (
        value.split(",", 1)[1] if value.startswith("data:") and "," in value else value
    )

    try:
        return base64.b64decode(encoded, validate=True)

    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="image_base64 must be valid base64 image data",
        ) from exc


def _build_ocr_prompt(
    available_lists: list[TaskList], available_tags: list[str]
) -> str:
    return textwrap.dedent(
        f"""
        You are an OCR and task parsing assistant for a Nextcloud CalDAV todo app.
        Read the uploaded handwritten note, photo, or screenshot and extract actionable tasks.

        Current date/time: {datetime.now(UTC).isoformat()}
        Available lists: {_list_context(available_lists)}
        Available tags: {json.dumps(available_tags)}

        Return STRICT JSON only. Do not wrap it in markdown.
        Return either an array of tasks or an object with a "tasks" array.

        Schema:
        {{
          "tasks": [
            {{
              "title": "string, required, concise action item",
              "description": "string or null, supports GitHub-flavored Markdown",
              "list_id": "string or null, must match an available list id when obvious",
              "tags": ["strings matching existing tags when possible"],
              "due_at": "ISO-8601 datetime string or null",
              "reminder_at": "ISO-8601 datetime string or null",
              "priority": "integer 0-9 or null",
              "subtasks": [{{"title": "string", "description": "string or null"}}]
            }}
          ]
        }}

        Rules:
        - Do not invent due dates, reminders, lists, or tags unless the image clearly implies them.
        - Preserve uncertain context in description instead of guessing.
        - Use subtasks for indented checklist items or clearly nested items.
        - Keep Markdown syntax from screenshots when useful.
        - The app will show these in a staging editor; optimize for editable draft tasks.
        """
    ).strip()


def _build_refine_prompt(request: AiRefineRequest) -> str:
    return textwrap.dedent(
        f"""
        You are editing staged tasks before they are saved to Nextcloud.
        Apply the user's instruction to the current staged tasks and return the full updated task list.

        Current date/time: {datetime.now(UTC).isoformat()}
        Instruction: {request.instruction}
        Available lists: {_list_context(request.available_lists)}
        Available tags: {json.dumps(request.available_tags)}
        Current tasks JSON: {json.dumps([task.model_dump(mode="json") for task in request.tasks])}

        Return STRICT JSON only. Do not wrap it in markdown.
        Return either an array of tasks or an object with a "tasks" array.

        Rules:
        - You may edit, add, remove, split, merge, or reorder staged tasks if the instruction asks for it.
        - Preserve user edits unless the instruction explicitly changes them.
        - Use only available list IDs when assigning list_id.
        - Prefer existing tags. Only create a new tag if the instruction explicitly asks for it.
        - Do not save anything; this response is still only a staging draft.
        """
    ).strip()


def _build_draft_prompt(request: AiDraftRequest) -> str:
    return textwrap.dedent(
        f"""
        You are a task planning assistant for a Nextcloud CalDAV todo app.
        Turn the user's natural-language request into staged tasks for review.

        Current date/time: {datetime.now(UTC).isoformat()}
        Instruction: {request.instruction}
        Available lists: {_list_context(request.available_lists)}
        Available tags: {json.dumps(request.available_tags)}

        Return STRICT JSON only. Do not wrap it in markdown.
        Return either an array of tasks or an object with a "tasks" array.
        Use only available list IDs when assigning list_id. Do not save anything.
        """
    ).strip()


def _parse_task_json(response_text: str) -> list[AiGeneratedTask]:
    cleaned = _strip_markdown_fence(response_text)
    try:
        payload: Any = json.loads(cleaned)

    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI model returned invalid JSON",
        ) from exc

    if isinstance(payload, dict):
        payload = payload.get("tasks")

    if not isinstance(payload, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI JSON must be a task array or an object with a tasks array",
        )

    try:
        return TypeAdapter(list[AiGeneratedTask]).validate_python(payload)

    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI JSON does not match the staged task schema",
        ) from exc


def _strip_markdown_fence(value: str) -> str:
    stripped = value.strip()

    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()

    if len(lines) >= 3 and lines[-1].strip() == "```":
        return "\n".join(lines[1:-1]).strip()

    return stripped


def _list_context(available_lists: list[TaskList]) -> str:
    return json.dumps(
        [
            {
                "id": task_list.id,
                "name": task_list.name,
            }
            for task_list in available_lists
        ]
    )
