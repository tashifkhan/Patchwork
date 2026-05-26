import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // Don't retry 4xx/501 — they won't succeed on repeat.
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

export const queryKeys = {
  health: ['health'] as const,
  taskLists: ['task-lists'] as const,
  tasks: ['tasks'] as const,
  deckBoards: ['deck', 'boards'] as const,
  deckBoard: (boardId: number) => ['deck', 'boards', boardId] as const,
};
