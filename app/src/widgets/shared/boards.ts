import { sprintTiming, type JiraBoardView, type JiraSprint } from '@/api/jira';
import type { BoardColumnItem, BoardSummary } from '@/features/boards/model';
import { initials, parseBoardRef, parseJiraBoardId } from '@/features/boards/model';

import type { BoardsProps, WidgetBoardColumn } from './types';

export const BOARD_WIDGET_COLUMN_CAP = 6;
export const BOARD_WIDGET_CARD_CAP = 5;

const DONE_COLUMN = /\b(done|closed|complete[d]?|resolved|shipped)\b/i;

export function boardUrl(ref: string): string {
  return `patchwork:///deck/board/${encodeURIComponent(ref)}`;
}

/** True when `due` falls on a day before `now`. Date-only strings are local days. */
export function isOverdue(due: string | null | undefined, now: Date): boolean {
  if (!due) return false;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(due);
  if (Number.isNaN(d.getTime())) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return d.getTime() < startOfToday;
}

export function emptyBoardsProps(generatedAt: number): BoardsProps {
  return {
    generatedAt,
    boardRef: null,
    title: '',
    subtitle: '',
    source: null,
    url: 'patchwork:///deck',
    sprintName: null,
    totalCards: 0,
    columns: [],
  };
}

export interface BoardSnapshotInputs {
  ref: string;
  summary: BoardSummary | null;
  columns: BoardColumnItem[];
  sprintName?: string | null;
  sprintTiming?: string | null;
  /** Jira login that owns the board, so tapping an issue opens it with the right account. */
  jiraAccountId?: string;
  now?: Date;
}

/**
 * The sprint a Jira board widget names. Boards usually open on every issue (the
 * `board` view), which has no sprint of its own, so this falls back to the
 * board's active sprint. Viewing the backlog names the backlog.
 */
export function jiraWidgetSprint(
  view: JiraBoardView,
  shown: JiraSprint | undefined,
  sprints: JiraSprint[],
  now = Date.now()
): { name: string | null; timing: string | null } {
  if (view.kind === 'backlog') return { name: 'Backlog', timing: null };
  const sprint = shown ?? sprints.find((candidate) => candidate.state === 'active');
  if (!sprint) return { name: null, timing: null };
  return { name: sprint.name, timing: sprintTiming(sprint, now) ?? null };
}

/** Turns a board's columns into the small, JSON-safe shape the widgets render. */
export function buildBoardsProps(inputs: BoardSnapshotInputs): BoardsProps {
  const now = inputs.now ?? new Date();
  const parsed = parseBoardRef(inputs.ref);
  const source = parsed?.source ?? null;
  const jiraBoardId = source === 'jira' && parsed ? parseJiraBoardId(parsed.id)?.boardId : undefined;
  const jiraAccountId = inputs.jiraAccountId ?? (source === 'jira' && parsed ? parseJiraBoardId(parsed.id)?.accountId : undefined);

  const query = (params: Record<string, string | undefined>): string => {
    const pairs = Object.entries(params)
      .filter((entry): entry is [string, string] => !!entry[1])
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`);
    return pairs.length ? `?${pairs.join('&')}` : '';
  };

  const cardUrl = (columnId: string, cardId: string): string => {
    if (source === 'jira') {
      const board = jiraBoardId != null ? String(jiraBoardId) : undefined;
      return `patchwork:///deck/issue/${encodeURIComponent(cardId)}${query({ account: jiraAccountId, board })}`;
    }
    return `patchwork:///deck/card/${encodeURIComponent(cardId)}${query({ boardId: parsed?.id, stackId: columnId })}`;
  };

  const columns: WidgetBoardColumn[] = inputs.columns.slice(0, BOARD_WIDGET_COLUMN_CAP).map((column) => {
    const done = DONE_COLUMN.test(column.title);
    return {
      id: column.id,
      title: column.title,
      count: column.cards.length,
      cards: column.cards.slice(0, BOARD_WIDGET_CARD_CAP).map((card) => ({
        id: card.id,
        title: card.title,
        key: card.key ?? null,
        due: card.due ?? null,
        overdue: !done && isOverdue(card.due, now),
        type: card.typeName ?? null,
        priority: card.priorityName ?? null,
        assignee: card.assignee ? initials(card.assignee.name) : null,
        sprint: card.sprint && card.sprint.label !== inputs.sprintName ? card.sprint.label : null,
        url: cardUrl(column.id, card.id),
      })),
    };
  });

  return {
    generatedAt: now.getTime(),
    boardRef: inputs.ref,
    title: inputs.summary?.title ?? 'Board',
    subtitle: inputs.summary?.subtitle ?? (source === 'jira' ? 'Jira' : 'Deck'),
    source,
    url: boardUrl(inputs.ref),
    sprintName: inputs.sprintName ?? null,
    sprintTiming: inputs.sprintTiming ?? null,
    totalCards: inputs.columns.reduce((sum, column) => sum + column.cards.length, 0),
    columns,
  };
}

/**
 * Drops null fields. iOS stores widget props in UserDefaults, which rejects NSNull,
 * so a snapshot with a null anywhere makes `updateSnapshot` throw. The layouts read
 * a missing field the same as null.
 */
export function withoutNulls<T>(props: T): T {
  return JSON.parse(JSON.stringify(props, (_key, value) => (value === null ? undefined : value))) as T;
}
