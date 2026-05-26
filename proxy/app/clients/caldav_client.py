import httpx
from fastapi import HTTPException, status

from app.core.config import Settings


class CalDavClient:
    def __init__(self, settings: Settings) -> None:
        if not settings.nextcloud_configured:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Nextcloud settings are not configured",
            )

        self.base_url = str(settings.nextcloud_base_url).rstrip("/")
        self.username = settings.nextcloud_username or ""
        self.auth = (self.username, settings.nextcloud_app_password or "")

    async def request(self, method: str, url: str, **kwargs: object) -> httpx.Response:
        async with httpx.AsyncClient(auth=self.auth, timeout=30) as client:
            response = await client.request(method, url, **kwargs)
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response

    def calendar_home_url(self) -> str:
        return f"{self.base_url}/remote.php/dav/calendars/{self.username}/"

    def absolute_url(self, href: str) -> str:
        if href.startswith("http://") or href.startswith("https://"):
            return href
        return f"{self.base_url}/{href.lstrip('/')}"
