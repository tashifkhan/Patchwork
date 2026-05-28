from fastapi import APIRouter, Body, Response, status

from app.router.dependencies import DeckServiceDep

router = APIRouter(prefix="/api/deck", tags=["deck"])


@router.get("/boards")
async def list_deck_boards(service: DeckServiceDep) -> object:
    return await service.list_boards()


@router.post("/boards")
async def create_deck_board(
    service: DeckServiceDep,
    payload: dict = Body(...),
) -> object:
    return await service.create_board(payload)


@router.get("/boards/{board_id}")
async def get_deck_board(
    board_id: int, service: DeckServiceDep
) -> object:
    return await service.get_board(board_id)


@router.post("/boards/{board_id}/stacks")
async def create_deck_stack(
    board_id: int,
    service: DeckServiceDep,
    payload: dict = Body(...),
) -> object:
    return await service.create_stack(board_id, payload)


@router.patch("/boards/{board_id}/stacks/{stack_id}")
async def update_deck_stack(
    board_id: int,
    stack_id: int,
    service: DeckServiceDep,
    payload: dict = Body(...),
) -> object:
    return await service.update_stack(board_id, stack_id, payload)


@router.delete("/boards/{board_id}/stacks/{stack_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deck_stack(
    board_id: int,
    stack_id: int,
    service: DeckServiceDep,
) -> Response:
    await service.delete_stack(board_id, stack_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/boards/{board_id}/stacks/{stack_id}/cards")
async def create_deck_card(
    board_id: int,
    stack_id: int,
    service: DeckServiceDep,
    payload: dict = Body(...),
) -> object:
    return await service.create_card(board_id, stack_id, payload)


@router.patch("/boards/{board_id}/stacks/{stack_id}/cards/{card_id}")
async def update_deck_card(
    board_id: int,
    stack_id: int,
    card_id: int,
    service: DeckServiceDep,
    payload: dict = Body(...),
) -> object:
    return await service.update_card(board_id, stack_id, card_id, payload)


@router.put("/boards/{board_id}/stacks/{stack_id}/cards/{card_id}/reorder")
async def reorder_deck_card(
    board_id: int,
    stack_id: int,
    card_id: int,
    service: DeckServiceDep,
    payload: dict = Body(...),
) -> object:
    return await service.reorder_card(board_id, stack_id, card_id, payload)


@router.delete("/boards/{board_id}/stacks/{stack_id}/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deck_card(
    board_id: int,
    stack_id: int,
    card_id: int,
    service: DeckServiceDep,
) -> Response:
    await service.delete_card(board_id, stack_id, card_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
