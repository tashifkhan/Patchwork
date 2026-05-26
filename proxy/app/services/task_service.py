from xml.etree import ElementTree as ET

from fastapi import HTTPException, status

from app.model.task import Task, TaskCreate, TaskList
from app.services.caldav_codec import (
    attach_children,
    is_deck_calendar,
    parse_vtodo,
    serialize_new_vtodo,
)
from app.services.nextcloud_client import NextcloudClient

DAV_NS = "DAV:"
CALDAV_NS = "urn:ietf:params:xml:ns:caldav"
NS = {"d": DAV_NS, "cal": CALDAV_NS}


class TaskService:
    def __init__(self, client: NextcloudClient) -> None:
        self.client = client

    async def list_task_calendars(self, *, include_deck: bool = False) -> list[TaskList]:
        body = """
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <d:displayname />
    <d:resourcetype />
    <cs:getctag />
  </d:prop>
</d:propfind>
""".strip()

        response = await self.client.request(
            "PROPFIND", self.client.calendar_home_url(), content=body, headers={"Depth": "1"}
        )
        calendars = _parse_calendar_list(response.text)
        if include_deck:
            return calendars
        return [calendar for calendar in calendars if not calendar.is_deck]

    async def list_tasks(self) -> list[Task]:
        calendars = await self.list_task_calendars()
        tasks: list[Task] = []
        for calendar in calendars:
            tasks.extend(await self._list_calendar_tasks(calendar))
        return attach_children(tasks)

    async def create_task(self, task: TaskCreate) -> Task:
        calendars = await self.list_task_calendars()
        target = next((calendar for calendar in calendars if calendar.id == task.list_id), None)
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task list not found")

        uid, calendar_data = serialize_new_vtodo(task)
        href = f"{target.href.rstrip('/')}/{uid}.ics"
        response = await self.client.request(
            "PUT",
            self.client.absolute_url(href),
            content=calendar_data,
            headers={"Content-Type": "text/calendar; charset=utf-8"},
        )
        created = parse_vtodo(
            calendar_data=calendar_data,
            href=href,
            etag=response.headers.get("etag"),
            list_id=target.id,
            list_name=target.name,
        )
        if created is None:
            raise HTTPException(status_code=500, detail="Created task could not be parsed")
        return created

    async def _list_calendar_tasks(self, calendar: TaskList) -> list[Task]:
        body = """
<cal:calendar-query xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <cal:calendar-data />
  </d:prop>
  <cal:filter>
    <cal:comp-filter name="VCALENDAR">
      <cal:comp-filter name="VTODO" />
    </cal:comp-filter>
  </cal:filter>
</cal:calendar-query>
""".strip()
        response = await self.client.request(
            "REPORT", self.client.absolute_url(calendar.href), content=body, headers={"Depth": "1"}
        )
        return _parse_task_report(response.text, calendar)


def _parse_calendar_list(xml_text: str) -> list[TaskList]:
    root = ET.fromstring(xml_text)
    calendars: list[TaskList] = []
    for response in root.findall("d:response", NS):
        href = _node_text(response, "d:href")
        name = _node_text(response, "d:propstat/d:prop/d:displayname")
        if not href or not name:
            continue
        resource_type = response.find("d:propstat/d:prop/d:resourcetype", NS)
        if resource_type is None or resource_type.find("cal:calendar", NS) is None:
            continue
        calendars.append(
            TaskList(
                id=href.strip("/").rsplit("/", 1)[-1],
                href=href,
                name=name,
                is_deck=is_deck_calendar(name, href),
            )
        )
    return calendars


def _parse_task_report(xml_text: str, calendar: TaskList) -> list[Task]:
    root = ET.fromstring(xml_text)
    tasks: list[Task] = []
    for response in root.findall("d:response", NS):
        href = _node_text(response, "d:href")
        etag = _node_text(response, "d:propstat/d:prop/d:getetag")
        calendar_data = _node_text(response, "d:propstat/d:prop/cal:calendar-data")
        if not href or not calendar_data:
            continue
        task = parse_vtodo(
            calendar_data=calendar_data,
            href=href,
            etag=etag,
            list_id=calendar.id,
            list_name=calendar.name,
        )
        if task is not None:
            tasks.append(task)
    return tasks


def _node_text(node: ET.Element, path: str) -> str | None:
    child = node.find(path, NS)
    return child.text if child is not None else None
