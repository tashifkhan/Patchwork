import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { createDeckBoard, createDeckCard, createDeckStack, deleteDeckCard, deleteDeckStack, fetchDeckBoard, fetchDeckBoards, reorderDeckCard, updateDeckCard, updateDeckStack } from '@/api/deck';
import type { DeckBoard, DeckBoardCreate, DeckBoardDetail, DeckCardCreate, DeckCardDelete, DeckCardReorder, DeckCardUpdate, DeckStack, DeckStackCreate, DeckStackDelete, DeckStackUpdate } from '@/api/types';
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
export function useAllDeckCards(boards: DeckBoard[]) {
  const results = useQueries({
    queries: boards.map((board) => ({
      queryKey: queryKeys.deckBoard(board.id),
      queryFn: () => fetchDeckBoard(board.id),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  });

  return {
    data: boards.map((board, index) => ({
      boardId: board.id,
      boardTitle: board.title,
      stacks: results[index]?.data?.stacks ?? [],
    })),
    isLoading: results.some((result) => result.isLoading),
    errors: results.flatMap((result) => result.error ? [result.error] : []),
  };
}

export function useCreateDeckBoard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeckBoardCreate) => createDeckBoard(payload),
    onSuccess: (board) => {
      client.invalidateQueries({ queryKey: queryKeys.deckBoards });
      client.invalidateQueries({ queryKey: queryKeys.deckBoard(board.id) });
    },
  });
}

export function useCreateDeckCard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeckCardCreate) => createDeckCard(payload),
    onSettled: (_card, _error, payload) => {
      client.invalidateQueries({ queryKey: queryKeys.deckBoards });
      client.invalidateQueries({ queryKey: queryKeys.deckBoard(payload.board_id) });
    },
  });
}

export function useUpdateDeckCard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeckCardUpdate) => updateDeckCard(payload),
    onSettled: (_card, _error, payload) => {
      client.invalidateQueries({ queryKey: queryKeys.deckBoards });
      client.invalidateQueries({ queryKey: queryKeys.deckBoard(payload.board_id) });
    },
  });
}

// Moves a card to a position within (or into) a stack. Optimistically rewrites
// the board cache so the card stays where it was dropped while the slow Deck
// round-trip runs, then reconciles on settle.
export function useReorderDeckCard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeckCardReorder) => reorderDeckCard(payload),
    onMutate: async (payload) => {
      const key = queryKeys.deckBoard(payload.board_id);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<DeckBoardDetail>(key);
      if (previous) {
        client.setQueryData<DeckBoardDetail>(key, moveCardInBoard(previous, payload));
      }
      return { key, previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) client.setQueryData(context.key, context.previous);
    },
    onSettled: (_card, _error, payload) => {
      client.invalidateQueries({ queryKey: queryKeys.deckBoards });
      client.invalidateQueries({ queryKey: queryKeys.deckBoard(payload.board_id) });
    },
  });
}

function moveCardInBoard(board: DeckBoardDetail, payload: DeckCardReorder): DeckBoardDetail {
  const source = board.stacks.find((stack) => stack.id === payload.stack_id);
  const sourceCard = source?.cards?.find((item) => item.id === payload.card_id);
  const card = sourceCard ? { ...sourceCard, stackId: payload.target_stack_id, order: payload.order } : null;
  if (!card) return board;

  const stacks = board.stacks.map((stack) => {
    if (stack.id === payload.stack_id && stack.id === payload.target_stack_id) {
      const without = (stack.cards ?? []).filter((item) => item.id !== payload.card_id);
      without.splice(clampIndex(payload.order, without.length), 0, card);
      return { ...stack, cards: without };
    }
    if (stack.id === payload.stack_id) {
      return { ...stack, cards: (stack.cards ?? []).filter((item) => item.id !== payload.card_id) };
    }
    if (stack.id === payload.target_stack_id) {
      const next = [...(stack.cards ?? [])];
      next.splice(clampIndex(payload.order, next.length), 0, card);
      return { ...stack, cards: next };
    }
    return stack;
  });
  return { ...board, stacks };
}

function clampIndex(index: number, length: number): number {
  if (index < 0) return 0;
  if (index > length) return length;
  return index;
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

function useStackMutation<T extends { board_id: number }, R>(fn: (payload: T) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_result, payload) => {
      client.invalidateQueries({ queryKey: queryKeys.deckBoards });
      client.invalidateQueries({ queryKey: queryKeys.deckBoard(payload.board_id) });
    },
  });
}

export function useCreateDeckStack() {
  return useStackMutation<DeckStackCreate, DeckStack>(createDeckStack);
}

export function useUpdateDeckStack() {
  return useStackMutation<DeckStackUpdate, DeckStack>(updateDeckStack);
}

export function useDeleteDeckStack() {
  return useStackMutation<DeckStackDelete, void>(deleteDeckStack);
}
