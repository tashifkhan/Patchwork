import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import {
  createJiraIssue,
  fetchJiraBoardDetail,
  fetchJiraBoards,
  transitionJiraIssue,
  type JiraBoardDetail,
} from '@/api/jira';
import {
  deckBoardSummary,
  deckColumns,
  jiraBoardSummary,
  jiraColumns,
  parseBoardRef,
  type BoardColumnItem,
  type BoardSummary,
} from '@/features/boards/model';
import { useCreateDeckCard, useDeckBoard, useDeckBoards, useReorderDeckCard } from '@/hooks/use-deck';
import { queryKeys } from '@/lib/query-client';
import { useSettingsStore } from '@/stores/settings-store';
import { handleJiraError, useJiraCredentials, useJiraSessionStore } from '@/stores/jira-session-store';

export function useJiraBoards() {
  const credentials = useJiraCredentials();
  const initialize = useJiraSessionStore((store) => store.initialize);
  const status = useJiraSessionStore((store) => store.state.status);
  useEffect(() => {
    if (status === 'initializing') void initialize();
  }, [initialize, status]);

  const query = useQuery({
    queryKey: queryKeys.jiraBoards,
    queryFn: () => fetchJiraBoards(credentials!),
    enabled: credentials != null,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (query.error) handleJiraError(query.error);
  }, [query.error]);
  return query;
}

/** Every board from every source, for the Boards list. */
export function useBoardSummaries() {
  const deck = useDeckBoards();
  const jira = useJiraBoards();
  const jiraStatus = useJiraSessionStore((store) => store.state.status);

  const boards = useMemo(() => {
    const deckBoards = deck.data ?? [];
    const multiAccount = new Set(deckBoards.map((board) => board.account_id)).size > 1;
    const list: BoardSummary[] = [
      ...(jira.data ?? []).map(jiraBoardSummary),
      ...deckBoards.map((board) => deckBoardSummary(board, multiAccount)),
    ];
    return list;
  }, [deck.data, jira.data]);

  return {
    boards,
    isLoading: deck.isLoading || (jiraStatus === 'connected' && jira.isLoading) || jiraStatus === 'initializing',
    isFetching: deck.isFetching || jira.isFetching,
    deckError: deck.error,
    jiraError: jira.error,
    jiraStatus,
    refetch: () => Promise.allSettled([deck.refetch(), jiraStatus === 'connected' ? jira.refetch() : null]),
  };
}

export interface BoardDetailState {
  summary: BoardSummary | null;
  columns: BoardColumnItem[];
  /** Scrum sprint name, shown under the title. */
  sprintName?: string;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  moveCard: (input: { cardId: string; fromColumnId: string; toColumnId: string; toIndex: number }) => Promise<void>;
  createCard: (columnId: string, title: string) => Promise<void>;
  canCreate: boolean;
  /** Jira site, for opening an issue in the browser. */
  jiraSite?: string;
}

/** Columns, cards and actions for one board, whichever source it comes from. */
export function useBoardDetail(ref: string): BoardDetailState {
  const parsed = parseBoardRef(ref);
  const source = parsed?.source;
  const numericId = parsed && source === 'deck' ? Number(parsed.id) : null;
  const jiraId = parsed && source === 'jira' ? Number(parsed.id) : null;
  const client = useQueryClient();
  const credentials = useJiraCredentials();

  // Deck
  const deckBoards = useDeckBoards();
  const deckBoard = useDeckBoard(numericId);
  const reorderDeck = useReorderDeckCard();
  const createDeck = useCreateDeckCard();

  // Jira
  const jiraBoards = useJiraBoards();
  const jiraBoard = jiraBoards.data?.find((board) => board.id === jiraId) ?? null;
  const jiraScope = useSettingsStore((store) => store.jiraIssueScope);
  const jiraKey = queryKeys.jiraBoard(jiraId ?? -1, jiraScope);
  const jiraDetail = useQuery({
    queryKey: jiraKey,
    queryFn: () => fetchJiraBoardDetail(credentials!, jiraBoard!, jiraScope),
    enabled: credentials != null && jiraBoard != null,
  });
  useEffect(() => {
    if (jiraDetail.error) handleJiraError(jiraDetail.error);
  }, [jiraDetail.error]);

  const jiraMove = useMutation({
    mutationFn: async (input: { key: string; toColumn: string }) => {
      const detail = client.getQueryData<JiraBoardDetail>(jiraKey);
      const column = detail?.columns.find((candidate) => candidate.name === input.toColumn);
      if (!credentials || !column) return;
      await transitionJiraIssue(credentials, input.key, column);
    },
    onMutate: async (input: { key: string; toColumn: string; toIndex: number }) => {
      await client.cancelQueries({ queryKey: jiraKey });
      const previous = client.getQueryData<JiraBoardDetail>(jiraKey);
      if (previous) client.setQueryData(jiraKey, moveJiraIssue(previous, input.key, input.toColumn, input.toIndex));
      return { previous };
    },
    onError: (error, _input, context) => {
      handleJiraError(error);
      if (context?.previous) client.setQueryData(jiraKey, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: jiraKey }),
  });

  const jiraCreate = useMutation({
    mutationFn: async (input: { columnId: string; title: string }) => {
      const detail = client.getQueryData<JiraBoardDetail>(jiraKey);
      if (!credentials || !jiraBoard) return;
      await createJiraIssue(credentials, {
        board: jiraBoard,
        summary: input.title,
        column: detail?.columns.find((column) => column.name === input.columnId),
        firstColumn: detail?.columns[0],
        sprintId: detail?.sprint?.id,
      });
    },
    onError: handleJiraError,
    onSettled: () => client.invalidateQueries({ queryKey: jiraKey }),
  });

  if (source === 'jira') {
    return {
      summary: jiraBoard ? jiraBoardSummary(jiraBoard) : null,
      columns: jiraDetail.data ? jiraColumns(jiraDetail.data) : [],
      sprintName: jiraDetail.data?.sprint?.name,
      isLoading: jiraBoards.isLoading || jiraDetail.isLoading,
      isFetching: jiraDetail.isFetching,
      error: jiraBoards.error ?? jiraDetail.error ?? (jiraBoards.data && !jiraBoard ? new Error('This Jira board is no longer available.') : null),
      refetch: () => jiraDetail.refetch(),
      moveCard: async ({ cardId, toColumnId, toIndex }) => {
        await jiraMove.mutateAsync({ key: cardId, toColumn: toColumnId, toIndex });
      },
      createCard: async (columnId, title) => {
        await jiraCreate.mutateAsync({ columnId, title });
      },
      canCreate: !!jiraBoard?.projectKey,
      jiraSite: credentials?.site,
    };
  }

  const board = deckBoards.data?.find((candidate) => candidate.id === numericId) ?? null;
  const multiAccount = new Set((deckBoards.data ?? []).map((candidate) => candidate.account_id)).size > 1;
  return {
    summary: board ? deckBoardSummary(board, multiAccount) : null,
    columns: deckBoard.data ? deckColumns(deckBoard.data) : [],
    isLoading: deckBoards.isLoading || deckBoard.isLoading,
    isFetching: deckBoard.isFetching,
    error: deckBoards.error ?? deckBoard.error,
    refetch: () => deckBoard.refetch(),
    moveCard: async ({ cardId, fromColumnId, toColumnId, toIndex }) => {
      if (numericId == null) return;
      await reorderDeck.mutateAsync({
        board_id: numericId,
        stack_id: Number(fromColumnId),
        card_id: Number(cardId),
        target_stack_id: Number(toColumnId),
        order: toIndex,
      });
    },
    createCard: async (columnId, title) => {
      if (numericId == null) return;
      await createDeck.mutateAsync({ board_id: numericId, stack_id: Number(columnId), title: title.trim() });
    },
    canCreate: true,
  };
}

function moveJiraIssue(detail: JiraBoardDetail, key: string, toColumn: string, toIndex: number): JiraBoardDetail {
  const issue = detail.columns.flatMap((column) => column.issues).find((candidate) => candidate.key === key);
  const target = detail.columns.find((column) => column.name === toColumn);
  if (!issue || !target) return detail;
  const moved = { ...issue, statusId: target.statusIds[0] ?? issue.statusId };
  return {
    ...detail,
    columns: detail.columns.map((column) => {
      const without = column.issues.filter((candidate) => candidate.key !== key);
      if (column.name !== toColumn) return { ...column, issues: without };
      const next = [...without];
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
      return { ...column, issues: next };
    }),
  };
}
