import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { createDeckCard, deleteDeckCard, fetchDeckBoard, fetchDeckBoards, updateDeckCard } from '@/api/deck';
import type { DeckBoard, DeckCardCreate, DeckCardDelete, DeckCardUpdate, DeckStack } from '@/api/types';
import { queryKeys } from '@/lib/query-client';

export function useDeckBoards() {
  return useQuery({ queryKey: queryKeys.deckBoards, queryFn: fetchDeckBoards });
}

export function useDeckBoard(boardId: number | null) {
  return useQuery({
    queryKey: boardId == null ? ['deck', 'boards', 'none'] : queryKeys.deckBoard(boardId),
    queryFn: () => fetchDeckBoard(boardId as number),
    enabled: boardId != null,
  });
}

export interface DeckBoardCards {
  boardId: number;
  boardTitle: string;
  stacks: DeckStack[];
}

// Fetches every board's stacks so search can index all Deck cards at once.
export function useAllDeckCards(boards: DeckBoard[]): DeckBoardCards[] {
  const results = useQueries({
    queries: boards.map((board) => ({
      queryKey: queryKeys.deckBoard(board.id),
      queryFn: () => fetchDeckBoard(board.id),
    })),
  });

  return boards.map((board, index) => ({
    boardId: board.id,
    boardTitle: board.title,
    stacks: results[index]?.data?.stacks ?? [],
  }));
}

export function useCreateDeckCard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeckCardCreate) => createDeckCard(payload),
    onSuccess: (_card, payload) => {
      client.invalidateQueries({ queryKey: queryKeys.deckBoards });
      client.invalidateQueries({ queryKey: queryKeys.deckBoard(payload.board_id) });
    },
  });
}

export function useUpdateDeckCard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeckCardUpdate) => updateDeckCard(payload),
    onSuccess: (_card, payload) => {
      client.invalidateQueries({ queryKey: queryKeys.deckBoards });
      client.invalidateQueries({ queryKey: queryKeys.deckBoard(payload.board_id) });
    },
  });
}

export function useDeleteDeckCard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeckCardDelete) => deleteDeckCard(payload),
    onSuccess: (_result, payload) => {
      client.invalidateQueries({ queryKey: queryKeys.deckBoards });
      client.invalidateQueries({ queryKey: queryKeys.deckBoard(payload.board_id) });
    },
  });
}
