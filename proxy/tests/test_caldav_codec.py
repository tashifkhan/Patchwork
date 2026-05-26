from app.model.task import Task, TaskCreate
from app.services.caldav_codec import (
    attach_children,
    is_deck_calendar,
    parse_vtodo,
    serialize_new_vtodo,
)


def test_is_deck_calendar_detects_prefixed_lists() -> None:
    assert is_deck_calendar("Deck: Personal")
    assert not is_deck_calendar("College")


def test_parse_vtodo_maps_core_fields() -> None:
    task = parse_vtodo(
        calendar_data="""BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:abc123
SUMMARY:Finish lab
DESCRIPTION:- [ ] Write report
STATUS:NEEDS-ACTION
CATEGORIES:College,DSA
RELATED-TO:parent123
END:VTODO
END:VCALENDAR
""",
        href="/remote.php/dav/calendars/user/tasks/abc123.ics",
        etag='"etag"',
        list_id="tasks",
        list_name="Tasks",
    )

    assert task is not None
    assert task.uid == "abc123"
    assert task.title == "Finish lab"
    assert task.markdown == "- [ ] Write report"
    assert task.tags == ["College", "DSA"]
    assert task.parent_uid == "parent123"


def test_serialize_new_vtodo_round_trips() -> None:
    uid, payload = serialize_new_vtodo(TaskCreate(list_id="tasks", title="New task"))

    assert uid
    assert "BEGIN:VTODO" in payload
    assert "SUMMARY:New task" in payload


def test_attach_children_returns_roots() -> None:
    parent = Task(id="1", uid="parent", list_id="tasks", list_name="Tasks", title="Parent")
    child = Task(
        id="2",
        uid="child",
        list_id="tasks",
        list_name="Tasks",
        title="Child",
        parent_uid="parent",
    )

    roots = attach_children([parent, child])

    assert roots == [parent]
    assert parent.children == [child]
