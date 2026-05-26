from fastapi import Depends, HTTPException, status

from app.core.application import create_app
from app.core.config import Settings, get_settings
from app.model import AiOcrRequest, AiRefineRequest, HealthResponse, Task, TaskCreate, TaskList, TaskUpdate
from app.services.ai_service import AiService
from app.services.deck_service import DeckService
from app.services.nextcloud_client import NextcloudClient
from app.services.task_service import TaskService


app = create_app()


def get_nextcloud_client(settings: Settings = Depends(get_settings)) -> NextcloudClient:
    return NextcloudClient(settings)


def get_task_service(client: NextcloudClient = Depends(get_nextcloud_client)) -> TaskService:
    return TaskService(client)


def get_deck_service(client: NextcloudClient = Depends(get_nextcloud_client)) -> DeckService:
    return DeckService(client)


def get_ai_service() -> AiService:
    return AiService()


@app.get("/health", response_model=HealthResponse)
async def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        nextcloud_configured=settings.nextcloud_configured,
        gemini_configured=bool(settings.gemini_api_key),
    )


@app.get("/api/task-lists", response_model=list[TaskList])
async def list_task_lists(service: TaskService = Depends(get_task_service)) -> list[TaskList]:
    return await service.list_task_calendars()


@app.get("/api/tasks", response_model=list[Task])
async def list_tasks(service: TaskService = Depends(get_task_service)) -> list[Task]:
    return await service.list_tasks()


@app.post("/api/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    task: TaskCreate, service: TaskService = Depends(get_task_service)
) -> Task:
    return await service.create_task(task)


@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, task: TaskUpdate) -> None:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Task updates are next")


@app.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str) -> None:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Task deletion is next")


@app.get("/api/deck/boards")
async def list_deck_boards(service: DeckService = Depends(get_deck_service)) -> object:
    return await service.list_boards()


@app.get("/api/deck/boards/{board_id}")
async def get_deck_board(
    board_id: int, service: DeckService = Depends(get_deck_service)
) -> object:
    return await service.get_board(board_id)


@app.post("/api/ai/ocr")
async def parse_image_tasks(
    request: AiOcrRequest, service: AiService = Depends(get_ai_service)
) -> None:
    await service.parse_image_tasks(request)


@app.post("/api/ai/refine-tasks")
async def refine_tasks(
    request: AiRefineRequest, service: AiService = Depends(get_ai_service)
) -> None:
    await service.refine_tasks(request)
