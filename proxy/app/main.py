from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.models import AiOcrRequest, AiRefineRequest, HealthResponse, Task, TaskCreate, TaskList, TaskUpdate
from app.nextcloud import NextcloudClient


def create_app() -> FastAPI:
    settings = get_settings()
    api = FastAPI(title="CalDAV Todo Proxy", version="0.1.0")
    api.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return api


app = create_app()


def get_nextcloud_client(settings: Settings = Depends(get_settings)) -> NextcloudClient:
    return NextcloudClient(settings)


@app.get("/health", response_model=HealthResponse)
async def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        nextcloud_configured=settings.nextcloud_configured,
        gemini_configured=bool(settings.gemini_api_key),
    )


@app.get("/api/task-lists", response_model=list[TaskList])
async def list_task_lists(client: NextcloudClient = Depends(get_nextcloud_client)) -> list[TaskList]:
    return await client.list_task_calendars()


@app.get("/api/tasks", response_model=list[Task])
async def list_tasks(client: NextcloudClient = Depends(get_nextcloud_client)) -> list[Task]:
    return await client.list_tasks()


@app.post("/api/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    task: TaskCreate, client: NextcloudClient = Depends(get_nextcloud_client)
) -> Task:
    return await client.create_task(task)


@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, task: TaskUpdate) -> None:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Task updates are next")


@app.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str) -> None:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Task deletion is next")


@app.get("/api/deck/boards")
async def list_deck_boards(client: NextcloudClient = Depends(get_nextcloud_client)) -> object:
    return await client.list_deck_boards()


@app.get("/api/deck/boards/{board_id}")
async def get_deck_board(
    board_id: int, client: NextcloudClient = Depends(get_nextcloud_client)
) -> object:
    return await client.get_deck_board(board_id)


@app.post("/api/ai/ocr")
async def parse_image_tasks(request: AiOcrRequest) -> None:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Gemini OCR is next")


@app.post("/api/ai/refine-tasks")
async def refine_tasks(request: AiRefineRequest) -> None:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Gemini refinement is next")
