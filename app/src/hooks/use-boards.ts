import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import {
  createJiraIssue,
  fetchJiraBoardDetail,
  fetchJiraBoards,
  rankJiraIssue,
  transitionJiraIssue,
  jiraViewKey,
  parseJiraViewKey,
  type JiraBoard,
  type JiraBoardDetail,
  type JiraBoardView,
  type JiraSprint,
} from '@/api/jira';
import {
  deckBoardSummary,
  deckColumns,
  jiraBoardSummary,
  jiraColumns,
  parseBoardRef,
  parseJiraBoardId,
  type BoardColumnItem,
  type BoardSummary,
} from '@/features/boards/model';
import { useCreateDeckCard, useDeckBoard, useDeckBoards, useReorderDeckCard } from '@/hooks/use-deck';
import { queryKeys } from '@/lib/query-client';
import { useSettingsStore } from '@/stores/settings-store';
import type { JiraCredentials } from '@/lib/credentials-types';
import { handleJiraError, useJiraAccounts, useJiraSessionStore } from '@/stores/jira-session-store';

export interface JiraBoardsState {
  /** Boards from every working login, each tagged with its `accountId`. */
  data: JiraBoard[] | undefined;
  accounts: JiraCredentials[];
  isLoading: boolean;
  isFetching: boolean;
  /** The first failure, when some login could not list its boards. */
  error: unknown;
  refetch: () => Promise<unknown>;
}

/** Boards from every connected Jira login. One failing login leaves the rest. */
export function useJiraBoards(): JiraBoardsState {
  const accounts = useJiraAccounts();
  const initialize = useJiraSessionStore((store) => store.initialize);
  const status = useJiraSessionStore((store) => store.state.status);
  useEffect(() => {
    if (status === 'initializing') void initialize();
  }, [initialize, status]);

  const client = useQueryClient();
  const combined = useQueries({
    queries: accounts.map((account) => ({
      queryKey: queryKeys.jiraBoards(account.id),
      // A revoked token marks just that login expired.
      queryFn: () =>
        fetchJiraBoards(account).catch((error: unknown) => {
          handleJiraError(error, account.id);
          throw error;
        }),
      staleTime: 5 * 60_000,
    })),
    combine: (results) => ({
      data: results.some((result) => result.data)
        ? results.flatMap((result) => result.data ?? [])
        : undefined,
      isLoading: results.some((result) => result.isLoading),
      isFetching: results.some((result) => result.isFetching),
      error: results.find((result) => result.error)?.error ?? null,
    }),
  });

  return {
    ...combined,
    accounts,
    refetch: () => client.refetchQueries({ queryKey: ['jira', 'boards'] }),
  };
}

/** A short name for a login, used only when more than one is connected. */
export function jiraAccountLabel(account: JiraCredentials, all: JiraCredentials[]): string | undefined {
  if (all.length < 2) return undefined;
  const host = account.site.replace(/^https:\/\//, '').replace(/\.atlassian\.net$/, '');
  const sameSite = all.filter((candidate) => candidate.site === account.site).length > 1;
  return sameSite ? `${host} · ${account.account.displayName}` : host;
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
      ...(jira.data ?? []).map((board) => {
        const account = jira.accounts.find((candidate) => candidate.id === board.accountId);
        return jiraBoardSummary(board, account ? jiraAccountLabel(account, jira.accounts) : undefined);
      }),
      ...deckBoards.map((board) => deckBoardSummary(board, multiAccount)),
    ];
    return list;
  }, [deck.data, jira.data, jira.accounts]);

  return {
    boards,
    isLoading: deck.isLoading || (jiraStatus === 'connected' && jira.isLoading) || jiraStatus === 'initializing',
    isFetching: deck.isFetching || jira.isFetching,
    deckError: deck.error,
    jiraError: jira.error,
    jiraStatus,
    refetch: () => Promise.allSettled([deck.refetch(), jira.refetch()]),
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
  /** The Jira login the board belongs to: opening issues, loading avatars. */
  jiraCredentials?: JiraCredentials;
  /** Jira scrum boards: which sprint (or the backlog) is shown, and the choices. */
  jira?: {
    view: JiraBoardView;
    sprint?: JiraSprint;
    sprints: JiraSprint[];
    /** True while a newly picked sprint loads over the previous one. */
    switching: boolean;
    setView: (view: JiraBoardView) => void;
  };
}

/** Columns, cards and actions for one board, whichever source it comes from. */
export function useBoardDetail(ref: string): BoardDetailState {
  const parsed = parseBoardRef(ref);
  const source = parsed?.source;
  const numericId = parsed && source === 'deck' ? Number(parsed.id) : null;
  const jiraRef = parsed && source === 'jira' ? parseJiraBoardId(parsed.id) : null;
  const jiraId = jiraRef?.boardId ?? null;
  const client = useQueryClient();

  // Deck
  const deckBoards = useDeckBoards();
  const deckBoard = useDeckBoard(numericId);
  const reorderDeck = useReorderDeckCard();
  const createDeck = useCreateDeckCard();

  // Jira
  const jiraBoards = useJiraBoards();
  // Refs saved before multiple logins name no login; they mean the first one.
  const jiraBoard =
    jiraBoards.data?.find(
      (board) =>
        board.id === jiraId && (jiraRef?.accountId ? board.accountId === jiraRef.accountId : true)
    ) ?? null;
  const credentials = jiraBoards.accounts.find((account) => account.id === jiraBoard?.accountId) ?? null;
  const jiraAccountId = credentials?.id;
  const jiraScope = useSettingsStore((store) => store.jiraIssueScope);
  const savedView = useSettingsStore((store) => store.jiraBoardViews[ref]);
  const setSavedView = useSettingsStore((store) => store.setJiraBoardView);
  const requestedView = parseJiraViewKey(savedView);
  const jiraKey = queryKeys.jiraBoard(jiraAccountId ?? '', jiraId ?? -1, jiraScope, jiraViewKey(requestedView));
  const jiraDetail = useQuery({
    queryKey: jiraKey,
    queryFn: () => fetchJiraBoardDetail(credentials!, jiraBoard!, jiraScope, requestedView),
    enabled: credentials != null && jiraBoard != null,
    // Switching sprint keeps this board's columns up while the next one loads.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === jiraAccountId && previousQuery?.queryKey[3] === jiraId ? previous : undefined,
  });
  useEffect(() => {
    if (jiraDetail.error) handleJiraError(jiraDetail.error, jiraAccountId);
  }, [jiraDetail.error, jiraAccountId]);

  const jiraMove = useMutation({
    mutationFn: async (input: { key: string; fromColumn: string; toColumn: string }) => {
      // onMutate already moved the issue in the cache, so its new neighbours are there.
      const detail = client.getQueryData<JiraBoardDetail>(jiraKey);
      const column = detail?.columns.find((candidate) => candidate.name === input.toColumn);
      if (!credentials || !column) return;
      const sameColumn = input.fromColumn === input.toColumn;
      if (!sameColumn) await transitionJiraIssue(credentials, input.key, column);
      const at = column.issues.findIndex((issue) => issue.key === input.key);
      const below = column.issues[at + 1];
      const above = column.issues[at - 1];
      const position = below ? { before: below.key } : above ? { after: above.key } : null;
      if (!position) return;
      try {
        await rankJiraIssue(credentials, input.key, position);
      } catch (error) {
        // A reorder is the whole point within a column; across columns the
        // status change already landed, so a failed rank is not worth an error.
        if (sameColumn) throw error;
      }
    },
    onMutate: async (input: { key: string; fromColumn: string; toColumn: string; toIndex: number }) => {
      await client.cancelQueries({ queryKey: jiraKey });
      const previous = client.getQueryData<JiraBoardDetail>(jiraKey);
      if (previous) client.setQueryData(jiraKey, moveJiraIssue(previous, input.key, input.toColumn, input.toIndex));
      return { previous };
    },
    onError: (error, _input, context) => {
      handleJiraError(error, jiraAccountId);
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
        // Lands in the sprint being viewed, or the active sprint when viewing
        // all issues; viewing the backlog leaves it there.
        sprintId:
          detail?.view.kind === 'sprint'
            ? detail.view.sprintId
            : detail?.view.kind === 'board'
              ? detail.sprints.find((sprint) => sprint.state === 'active')?.id
              : undefined,
      });
    },
    onError: (error) => handleJiraError(error, jiraAccountId),
    onSettled: () => client.invalidateQueries({ queryKey: jiraKey }),
  });

  if (source === 'jira') {
    return {
      summary: jiraBoard
        ? jiraBoardSummary(jiraBoard, credentials ? jiraAccountLabel(credentials, jiraBoards.accounts) : undefined)
        : null,
      columns: jiraDetail.data ? jiraColumns(jiraDetail.data) : [],
      sprintName: jiraDetail.data?.sprint?.name,
      jira: jiraDetail.data
        ? {
            view: jiraDetail.data.view,
            sprint: jiraDetail.data.sprint,
            sprints: jiraDetail.data.sprints,
            switching: jiraDetail.isPlaceholderData,
            setView: (view: JiraBoardView) => setSavedView(ref, jiraViewKey(view)),
          }
        : undefined,
      isLoading: jiraBoards.isLoading || jiraDetail.isLoading,
      isFetching: jiraDetail.isFetching,
      error: jiraBoards.error ?? jiraDetail.error ?? (jiraBoards.data && !jiraBoard ? new Error('This Jira board is no longer available.') : null),
      refetch: () => jiraDetail.refetch(),
      moveCard: async ({ cardId, fromColumnId, toColumnId, toIndex }) => {
        await jiraMove.mutateAsync({ key: cardId, fromColumn: fromColumnId, toColumn: toColumnId, toIndex });
      },
      createCard: async (columnId, title) => {
        await jiraCreate.mutateAsync({ columnId, title });
      },
      canCreate: !!jiraBoard?.projectKey,
      jiraCredentials: credentials ?? undefined,
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
