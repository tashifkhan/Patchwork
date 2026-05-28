import { api } from './client';
import type { DeckBoard, DeckBoardDetail, DeckCard, DeckCardCreate, DeckCardDelete, DeckCardUpdate } from './types';

export function fetchDeckBoards() {
  return api.get<DeckBoard[]>('/api/deck/boards');
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
