from fastapi import Depends

from app.core.config import Settings, get_settings
from app.services.ai_service import AiService
from app.services.deck_service import DeckService
from app.services.nextcloud_client import NextcloudClient
from app.services.task_service import TaskService


def get_nextcloud_client(settings: Settings = Depends(get_settings)) -> NextcloudClient:
    return NextcloudClient(settings)


def get_task_service(client: NextcloudClient = Depends(get_nextcloud_client)) -> TaskService:
    return TaskService(client)


def get_deck_service(client: NextcloudClient = Depends(get_nextcloud_client)) -> DeckService:
    return DeckService(client)


def get_ai_service(settings: Settings = Depends(get_settings)) -> AiService:
    return AiService(settings)
