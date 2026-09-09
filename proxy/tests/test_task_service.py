import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.model.task import TaskListUpdate
from app.services.task_service import TaskService


class FakeCalDavClient:
    def __init__(self, xml: str) -> None:
        self.xml = xml
        self.calls: list[tuple[str, str]] = []

    def calendar_home_url(self) -> str:
        return "https://cloud.example/remote.php/dav/calendars/user/"

    def absolute_url(self, href: str) -> str:
        if href.startswith("http://") or href.startswith("https://"):
            return href
        return f"https://cloud.example{href}"

    async def request(self, method: str, url: str, **kwargs: object):
        self.calls.append((method, url))
        return SimpleNamespace(text=self.xml, headers={})


PROPFIND_XML = """
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/remote.php/dav/calendars/user/personal/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Personal</d:displayname>
        <d:resourcetype><cal:calendar /></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>
""".strip()


def test_rename_task_calendar_proppatches_displayname() -> None:
    client = FakeCalDavClient(PROPFIND_XML)
    service = TaskService(client)

    renamed = asyncio.run(service.rename_task_calendar("personal", TaskListUpdate(name="Home")))

    assert renamed.name == "Home"
    assert renamed.id == "personal"
    assert ("PROPPATCH", "https://cloud.example/remote.php/dav/calendars/user/personal/") in client.calls


def test_delete_task_calendar_deletes_collection() -> None:
    client = FakeCalDavClient(PROPFIND_XML)
    service = TaskService(client)

    asyncio.run(service.delete_task_calendar("personal"))

    assert ("DELETE", "https://cloud.example/remote.php/dav/calendars/user/personal/") in client.calls


def test_missing_task_calendar_is_404() -> None:
    client = FakeCalDavClient(PROPFIND_XML)
    service = TaskService(client)

    with pytest.raises(HTTPException) as error:
        asyncio.run(service.delete_task_calendar("missing"))

    assert error.value.status_code == 404
