import { api } from './client';
import type { DeckBoard, DeckBoardDetail } from './types';

export function fetchDeckBoards() {
  return api.get<DeckBoard[]>('/api/deck/boards');
}

// Returns { board_id, stacks: [...] } where each stack carries its cards.
export function fetchDeckBoard(boardId: number) {
  return api.get<DeckBoardDetail>(`/api/deck/boards/${boardId}`);
}
