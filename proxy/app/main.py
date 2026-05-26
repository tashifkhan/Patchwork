from app.core.application import create_app
from app.router.ai import router as ai_router
from app.router.deck import router as deck_router
from app.router.health import router as health_router
from app.router.tasks import router as tasks_router


app = create_app()
app.include_router(health_router)
app.include_router(tasks_router)
app.include_router(deck_router)
app.include_router(ai_router)
