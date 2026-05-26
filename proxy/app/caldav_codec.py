from datetime import UTC, datetime
from uuid import uuid4

import vobject

from app.models import Task, TaskCreate


def is_deck_calendar(name: str, href: str = "") -> bool:
    normalized_name = name.strip().lower()
    normalized_href = href.lower()
    return normalized_name.startswith("deck:") or "/deck" in normalized_href


def parse_vtodo(
    *,
    calendar_data: str,
    href: str,
    etag: str | None,
    list_id: str,
    list_name: str,
) -> Task | None:
    component = vobject.readOne(calendar_data)
    todo = getattr(component, "vtodo", None)
    if todo is None:
        return None

    uid = _value(todo, "uid") or href.rsplit("/", 1)[-1].removesuffix(".ics")
    description = _value(todo, "description") or ""
    status = (_value(todo, "status") or "").upper()

    return Task(
        id=href,
        uid=uid,
        list_id=list_id,
        list_name=list_name,
        title=_value(todo, "summary") or "Untitled task",
        description=description,
        markdown=description,
        completed=status == "COMPLETED",
        priority=_int_value(todo, "priority"),
        due_at=_datetime_value(todo, "due"),
        reminder_at=_alarm_datetime(todo),
        tags=_categories(todo),
        parent_uid=_value(todo, "related_to"),
        etag=etag,
        updated_at=_datetime_value(todo, "last_modified"),
    )


def serialize_new_vtodo(task: TaskCreate) -> tuple[str, str]:
    uid = str(uuid4())
    component = vobject.iCalendar()
    todo = component.add("vtodo")
    todo.add("uid").value = uid
    todo.add("summary").value = task.title
    todo.add("description").value = task.markdown
    todo.add("dtstamp").value = _vobject_datetime(datetime.now(UTC))
    todo.add("status").value = "NEEDS-ACTION"

    if task.priority is not None:
        todo.add("priority").value = task.priority
    if task.due_at is not None:
        todo.add("due").value = _vobject_datetime(task.due_at)
    if task.tags:
        todo.add("categories").value = task.tags
    if task.parent_uid:
        todo.add("related-to").value = task.parent_uid
    if task.reminder_at is not None:
        alarm = todo.add("valarm")
        alarm.add("action").value = "DISPLAY"
        alarm.add("description").value = task.title
        alarm.add("trigger").value = _vobject_datetime(task.reminder_at)

    return uid, component.serialize()


def attach_children(tasks: list[Task]) -> list[Task]:
    by_uid = {task.uid: task for task in tasks}
    roots: list[Task] = []

    for task in tasks:
        task.children = []

    for task in tasks:
        if task.parent_uid and task.parent_uid in by_uid:
            by_uid[task.parent_uid].children.append(task)
        else:
            roots.append(task)

    return roots


def _value(todo: vobject.base.Component, name: str) -> str | None:
    child = getattr(todo, name, None)
    if child is None:
        return None
    value = getattr(child, "value", None)
    return str(value) if value is not None else None


def _int_value(todo: vobject.base.Component, name: str) -> int | None:
    value = _value(todo, name)
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _datetime_value(todo: vobject.base.Component, name: str) -> datetime | None:
    child = getattr(todo, name, None)
    if child is None:
        return None
    value = getattr(child, "value", None)
    return value if isinstance(value, datetime) else None


def _categories(todo: vobject.base.Component) -> list[str]:
    child = getattr(todo, "categories", None)
    if child is None:
        return []
    value = getattr(child, "value", [])
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return [str(item) for item in value]


def _alarm_datetime(todo: vobject.base.Component) -> datetime | None:
    alarms = getattr(todo, "valarm_list", [])
    for alarm in alarms:
        trigger = getattr(getattr(alarm, "trigger", None), "value", None)
        if isinstance(trigger, datetime):
            return trigger
    return None


def _vobject_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)
