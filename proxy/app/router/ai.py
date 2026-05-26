from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.model.ai import AiOcrRequest, AiRefineRequest, AiTasksResponse
from app.router.dependencies import get_ai_service
from app.services.ai_service import AiService, parse_tags_form, parse_task_lists_form

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/ocr", response_model=AiTasksResponse)
async def parse_image_tasks(
    request: AiOcrRequest, service: AiService = Depends(get_ai_service)
) -> AiTasksResponse:
    return await service.parse_image_tasks(request)


@router.post("/ocr-upload", response_model=AiTasksResponse)
async def upload_image_tasks(
    file: UploadFile = File(...),
    available_lists: str | None = Form(default=None),
    available_tags: str | None = Form(default=None),
    service: AiService = Depends(get_ai_service),
) -> AiTasksResponse:
    return await service.parse_uploaded_image_tasks(
        file=file,
        available_lists=parse_task_lists_form(available_lists),
        available_tags=parse_tags_form(available_tags),
    )


@router.post("/refine-tasks", response_model=AiTasksResponse)
async def refine_tasks(
    request: AiRefineRequest, service: AiService = Depends(get_ai_service)
) -> AiTasksResponse:
    return await service.refine_tasks(request)
