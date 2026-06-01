from fastapi import APIRouter, Response, status

from app.model.task import Task, TaskCreate, TaskList, TaskListCreate, TaskUpdate
from app.router.dependencies import TaskServiceDep

router = APIRouter(prefix="/api", tags=["tasks"])


@router.get("/task-lists", response_model=list[TaskList])
async def list_task_lists(service: TaskServiceDep) -> list[TaskList]:
    return await service.list_task_calendars()


@router.post("/task-lists", response_model=TaskList, status_code=status.HTTP_201_CREATED)
async def create_task_list(
    task_list: TaskListCreate, service: TaskServiceDep
) -> TaskList:
    return await service.create_task_calendar(task_list)


@router.get("/tasks", response_model=list[Task])
async def list_tasks(service: TaskServiceDep) -> list[Task]:
    return await service.list_tasks()


@router.get("/tasks/{task_id}", response_model=Task)
async def get_task(task_id: str, service: TaskServiceDep) -> Task:
    return await service.get_task(task_id)


@router.post("/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    task: TaskCreate, service: TaskServiceDep
) -> Task:
    return await service.create_task(task)


@router.patch("/tasks/{task_id}", response_model=Task)
async def update_task(
    task_id: str, task: TaskUpdate, service: TaskServiceDep
) -> Task:
    return await service.update_task(task_id, task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str, service: TaskServiceDep) -> Response:
    await service.delete_task(task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
