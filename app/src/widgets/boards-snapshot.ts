import { Platform } from 'react-native';

import { fetchDeckBoard, fetchDeckBoards } from '@/api/deck';
import {
  fetchJiraBoardDetail,
  fetchJiraBoards,
  jiraViewKey,
  parseJiraViewKey,
  type JiraBoardDetail,
} from '@/api/jira';
import type { DeckBoard, DeckBoardDetail } from '@/api/types';
import {
  deckBoardSummary,
  deckColumns,
  jiraBoardSummary,
  jiraColumns,
  parseBoardRef,
  parseJiraBoardId,
} from '@/features/boards/model';
import { getJiraAccounts } from '@/lib/credentials';
import { queryClient, queryKeys } from '@/lib/query-client';
import { useSettingsStore } from '@/stores/settings-store';

import BoardsWidget from './BoardsWidget';
import { buildBoardsProps, emptyBoardsProps, jiraWidgetSprint, withoutNulls } from './shared/boards';
import type { BoardsProps } from './shared/types';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

/** The board the widget shows: the one opened most recently. */
export function widgetBoardRef(): string | null {
  return useSettingsStore.getState().recentBoards[0] ?? null;
}

function deckProps(ref: string, boardId: number): BoardsProps | null {
  const detail = queryClient.getQueryData<DeckBoardDetail>(queryKeys.deckBoard(boardId));
  if (!detail) return null;
  const boards = queryClient.getQueryData<DeckBoard[]>(queryKeys.deckBoards) ?? [];
  const board = boards.find((candidate) => candidate.id === boardId);
  const multiAccount = new Set(boards.map((candidate) => candidate.account_id)).size > 1;
  return buildBoardsProps({
    ref,
    summary: board ? deckBoardSummary(board, multiAccount) : null,
    columns: deckColumns(detail),
  });
}

function jiraProps(ref: string, id: string): BoardsProps | null {
  const parsed = parseJiraBoardId(id);
  if (!parsed) return null;
  // Board detail keys are ['jira', 'board', accountId, boardId, scope, view].
  const queries = queryClient
    .getQueryCache()
    .findAll({ queryKey: ['jira', 'board'] })
    .filter((query) => {
      const key = query.queryKey;
      if (key[3] !== parsed.boardId || !query.state.data) return false;
      return parsed.accountId ? key[2] === parsed.accountId : true;
    });
  if (queries.length === 0) return null;
  // Prefer the sprint or backlog the board screen last showed, then the freshest data.
  const savedView = useSettingsStore.getState().jiraBoardViews[ref] ?? 'default';
  const scope = useSettingsStore.getState().jiraIssueScope;
  const best =
    queries.find((query) => query.queryKey[4] === scope && query.queryKey[5] === savedView) ??
    [...queries].sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0];
  const detail = best.state.data as JiraBoardDetail;
  const sprint = jiraWidgetSprint(detail.view, detail.sprint, detail.sprints);
  return buildBoardsProps({
    ref,
    summary: jiraBoardSummary(detail.board),
    columns: jiraColumns(detail),
    sprintName: sprint.name,
    sprintTiming: sprint.timing,
    jiraAccountId: detail.board.accountId,
  });
}

/** Props for `ref` from data already in the query cache, or null when it has none. */
export function boardsPropsFromCache(ref: string | null): BoardsProps | null {
  if (!ref) return emptyBoardsProps(Date.now());
  const parsed = parseBoardRef(ref);
  if (!parsed) return emptyBoardsProps(Date.now());
  if (parsed.source === 'deck') {
    const boardId = Number(parsed.id);
    return Number.isFinite(boardId) ? deckProps(ref, boardId) : null;
  }
  return jiraProps(ref, parsed.id);
}

let lastPushed = '';

/**
 * Push the Boards widget from the query cache. Skips the push when the board's data
 * is not cached yet (a cold start, or the background task), so the widget keeps its
 * last good snapshot instead of going blank.
 */
export function pushBoardsWidget(): void {
  if (!supported) return;
  // Before the settings store hydrates, `recentBoards` is empty and would wipe the widget.
  if (!useSettingsStore.getState().hydrated) return;
  const props = boardsPropsFromCache(widgetBoardRef());
  if (!props) return;
  const fingerprint = JSON.stringify({ ...props, generatedAt: 0 });
  if (fingerprint === lastPushed) return;
  lastPushed = fingerprint;
  BoardsWidget.updateSnapshot(withoutNulls(props));
}

function waitForSettings(timeoutMs = 3000): Promise<boolean> {
  if (useSettingsStore.getState().hydrated) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    const unsubscribe = useSettingsStore.subscribe((state) => {
      if (!state.hydrated) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

async function refreshDeckBoard(boardId: number): Promise<void> {
  const [boards, detail] = await Promise.all([fetchDeckBoards(), fetchDeckBoard(boardId)]);
  queryClient.setQueryData(queryKeys.deckBoards, boards);
  queryClient.setQueryData(queryKeys.deckBoard(boardId), detail);
}

/** Fetches a Jira board the way the board screen does: same login, scope, and sprint view. */
async function refreshJiraBoard(ref: string, id: string): Promise<void> {
  const parsed = parseJiraBoardId(id);
  if (!parsed) return;
  const accounts = await getJiraAccounts();
  // Refs saved before multiple logins name no login; they mean the first one.
  const credentials = parsed.accountId
    ? accounts.find((account) => account.id === parsed.accountId)
    : accounts[0];
  if (!credentials) return;
  const boards = await fetchJiraBoards(credentials);
  const board = boards.find((candidate) => candidate.id === parsed.boardId);
  if (!board) return;
  const settings = useSettingsStore.getState();
  const view = parseJiraViewKey(settings.jiraBoardViews[ref]);
  const detail = await fetchJiraBoardDetail(credentials, board, settings.jiraIssueScope, view);
  queryClient.setQueryData(queryKeys.jiraBoards(credentials.id), boards);
  queryClient.setQueryData(
    queryKeys.jiraBoard(credentials.id, board.id, settings.jiraIssueScope, jiraViewKey(view)),
    detail
  );
}

/** Background refresh: refetch the widget's board, Deck or Jira, and push it. */
export async function refreshBoardsWidget(): Promise<void> {
  if (!supported || !(await waitForSettings())) return;
  const ref = widgetBoardRef();
  const parsed = parseBoardRef(ref ?? '');
  if (!ref || !parsed) return;
  if (parsed.source === 'deck') {
    const boardId = Number(parsed.id);
    if (!Number.isFinite(boardId)) return;
    await refreshDeckBoard(boardId);
  } else {
    await refreshJiraBoard(ref, parsed.id);
  }
  pushBoardsWidget();
}
