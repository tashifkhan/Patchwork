import pytest
from fastapi import HTTPException

from app.services.ai_service import _decode_base64_image, _parse_task_json, parse_tags_form


def test_parse_task_json_accepts_tasks_object() -> None:
    tasks = _parse_task_json(
        '{"tasks":[{"title":"Finish lab","tags":["College"],"subtasks":[{"title":"Write report"}]}]}'
    )

    assert tasks[0].title == "Finish lab"
    assert tasks[0].tags == ["College"]
    assert tasks[0].subtasks[0].title == "Write report"


def test_parse_task_json_strips_markdown_fences() -> None:
    tasks = _parse_task_json('```json\n[{"title":"Read notes"}]\n```')

    assert tasks[0].title == "Read notes"


def test_decode_base64_image_accepts_data_url() -> None:
    assert _decode_base64_image("data:image/png;base64,aGVsbG8=") == b"hello"


def test_parse_tags_form_rejects_non_list() -> None:
    with pytest.raises(HTTPException):
        parse_tags_form('{"tag":"College"}')
