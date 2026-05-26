from fastapi import APIRouter, HTTPException, status

from app.model.task import Task, TaskCreate, TaskList, TaskUpdate
from app.router.dependencies import TaskServiceDep

router = APIRouter(prefix="/api", tags=["tasks"])


@router.get("/task-lists", response_model=list[TaskList])
async def list_task_lists(service: TaskServiceDep) -> list[TaskList]:
    return await service.list_task_calendars()


@router.get("/tasks", response_model=list[Task])
async def list_tasks(service: TaskServiceDep) -> list[Task]:
    return await service.list_tasks()


@router.post("/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    task: TaskCreate, service: TaskServiceDep
) -> Task:
    return await service.create_task(task)


@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, task: TaskUpdate) -> None:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Task updates are next")


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str) -> None:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Task deletion is next")
