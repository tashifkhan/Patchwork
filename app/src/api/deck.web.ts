import { api } from './client';
import type { DeckBoard, DeckBoardCreate, DeckBoardDetail, DeckCard, DeckCardCreate, DeckCardDelete, DeckCardReorder, DeckCardUpdate, DeckStack, DeckStackCreate, DeckStackDelete, DeckStackUpdate } from './types';

export function fetchDeckBoards() {
  return api.get<DeckBoard[]>('/api/deck/boards');
}

export function createDeckBoard(payload: DeckBoardCreate) {
  return api.post<DeckBoard>('/api/deck/boards', payload);
}

// Returns { board_id, stacks: [...] } where each stack carries its cards.
export function fetchDeckBoard(boardId: number) {
  return api.get<DeckBoardDetail>(`/api/deck/boards/${boardId}`);
}

export function createDeckCard(payload: DeckCardCreate) {
  return api.post<DeckCard>(`/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}/cards`, payload);
}

export function updateDeckCard(payload: DeckCardUpdate) {
  return api.patch<DeckCard>(`/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}/cards/${payload.card_id}`, payload);
}

export function deleteDeckCard(payload: DeckCardDelete) {
  return api.delete<void>(`/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}/cards/${payload.card_id}`);
}

export function reorderDeckCard(payload: DeckCardReorder) {
  return api.put<DeckCard>(
    `/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}/cards/${payload.card_id}/reorder`,
    { target_stack_id: payload.target_stack_id, order: payload.order }
  );
}

export function createDeckStack(payload: DeckStackCreate) {
  return api.post<DeckStack>(`/api/deck/boards/${payload.board_id}/stacks`, {
    title: payload.title,
    order: payload.order,
  });
}

export function updateDeckStack(payload: DeckStackUpdate) {
  return api.patch<DeckStack>(`/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}`, {
    title: payload.title,
    order: payload.order,
  });
}

export function deleteDeckStack(payload: DeckStackDelete) {
  return api.delete<void>(`/api/deck/boards/${payload.board_id}/stacks/${payload.stack_id}`);
}
