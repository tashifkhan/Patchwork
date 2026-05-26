from xml.etree import ElementTree as ET

import httpx
from fastapi import HTTPException, status

from app.caldav_codec import attach_children, is_deck_calendar, parse_vtodo, serialize_new_vtodo
from app.config import Settings
from app.models import DeckBoard, Task, TaskCreate, TaskList

DAV_NS = "DAV:"
CALDAV_NS = "urn:ietf:params:xml:ns:caldav"
NS = {"d": DAV_NS, "cal": CALDAV_NS}


class NextcloudClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        if not settings.nextcloud_configured:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Nextcloud settings are not configured",
            )

        self.base_url = str(settings.nextcloud_base_url).rstrip("/")
        self.username = settings.nextcloud_username or ""
        self.auth = (self.username, settings.nextcloud_app_password or "")

    async def list_task_calendars(self, *, include_deck: bool = False) -> list[TaskList]:
        url = self._calendar_home_url()
        body = """
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <d:displayname />
    <d:resourcetype />
    <cs:getctag />
  </d:prop>
</d:propfind>
""".strip()

        response = await self._request("PROPFIND", url, content=body, headers={"Depth": "1"})
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
        url = self._absolute_url(href)
        response = await self._request(
            "PUT",
            url,
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

    async def list_deck_boards(self) -> list[DeckBoard]:
        response = await self._request("GET", f"{self.base_url}/index.php/apps/deck/api/v1.0/boards")
        payload = response.json()
        return [DeckBoard(id=item["id"], title=item.get("title", "Untitled board"), raw=item) for item in payload]

    async def get_deck_board(self, board_id: int) -> dict:
        response = await self._request(
            "GET", f"{self.base_url}/index.php/apps/deck/api/v1.0/boards/{board_id}/stacks"
        )
        return {"board_id": board_id, "stacks": response.json()}

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
        response = await self._request(
            "REPORT", self._absolute_url(calendar.href), content=body, headers={"Depth": "1"}
        )
        return _parse_task_report(response.text, calendar)

    async def _request(self, method: str, url: str, **kwargs: object) -> httpx.Response:
        async with httpx.AsyncClient(auth=self.auth, timeout=30) as client:
            response = await client.request(method, url, **kwargs)
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response

    def _calendar_home_url(self) -> str:
        return f"{self.base_url}/remote.php/dav/calendars/{self.username}/"

    def _absolute_url(self, href: str) -> str:
        if href.startswith("http://") or href.startswith("https://"):
            return href
        return f"{self.base_url}/{href.lstrip('/')}"


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
