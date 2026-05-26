from typing import Annotated

from fastapi import Depends

from app.clients.caldav_client import CalDavClient
from app.clients.gemini_client import GeminiClient
from app.core.config import Settings, get_settings
from app.services.ai_service import AiService
from app.services.deck_service import DeckService
from app.services.task_service import TaskService

SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_caldav_client(settings: SettingsDep) -> CalDavClient:
    return CalDavClient(settings)


CalDavClientDep = Annotated[CalDavClient, Depends(get_caldav_client)]


def get_task_service(client: CalDavClientDep) -> TaskService:
    return TaskService(client)


def get_deck_service(client: CalDavClientDep) -> DeckService:
    return DeckService(client)


def get_gemini_client(settings: SettingsDep) -> GeminiClient:
    return GeminiClient(settings)


GeminiClientDep = Annotated[GeminiClient, Depends(get_gemini_client)]


def get_ai_service(settings: SettingsDep, gemini_client: GeminiClientDep) -> AiService:
    return AiService(settings, gemini_client)


TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]
DeckServiceDep = Annotated[DeckService, Depends(get_deck_service)]
AiServiceDep = Annotated[AiService, Depends(get_ai_service)]
