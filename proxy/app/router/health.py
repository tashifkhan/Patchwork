from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.model.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        nextcloud_configured=settings.nextcloud_configured,
        gemini_configured=bool(settings.gemini_api_key),
    )
