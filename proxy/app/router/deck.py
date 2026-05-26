from fastapi import APIRouter

from app.router.dependencies import DeckServiceDep

router = APIRouter(prefix="/api/deck", tags=["deck"])


@router.get("/boards")
async def list_deck_boards(service: DeckServiceDep) -> object:
    return await service.list_boards()


@router.get("/boards/{board_id}")
async def get_deck_board(
    board_id: int, service: DeckServiceDep
) -> object:
    return await service.get_board(board_id)
