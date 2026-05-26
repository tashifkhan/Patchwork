from fastapi import APIRouter

from app.model.health import HealthResponse
from app.router.dependencies import SettingsDep

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(
        nextcloud_configured=settings.nextcloud_configured,
        gemini_configured=bool(settings.gemini_api_key),
    )
