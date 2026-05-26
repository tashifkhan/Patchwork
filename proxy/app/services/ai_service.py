from fastapi import HTTPException, status

from app.model.ai import AiOcrRequest, AiRefineRequest


class AiService:
    async def parse_image_tasks(self, request: AiOcrRequest) -> None:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Gemini OCR is next")

    async def refine_tasks(self, request: AiRefineRequest) -> None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Gemini refinement is next"
        )
