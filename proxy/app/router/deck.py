from fastapi import APIRouter, Depends

from app.router.dependencies import get_deck_service
from app.services.deck_service import DeckService

router = APIRouter(prefix="/api/deck", tags=["deck"])


@router.get("/boards")
async def list_deck_boards(service: DeckService = Depends(get_deck_service)) -> object:
    return await service.list_boards()


@router.get("/boards/{board_id}")
async def get_deck_board(
    board_id: int, service: DeckService = Depends(get_deck_service)
) -> object:
    return await service.get_board(board_id)
