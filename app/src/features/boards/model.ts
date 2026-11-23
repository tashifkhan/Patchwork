import type { DeckBoard, DeckBoardDetail, DeckCard } from '@/api/types';
import type { JiraBoard, JiraBoardDetail, JiraIssue } from '@/api/jira';

/**
 * One shape for Nextcloud Deck boards and Jira boards, so the Boards tab can
 * list and render both the same way. A board ref is `deck:<id>` or
 * `jira:<id>@<login id>` (older `jira:<id>` refs mean the first login).
 */
export type BoardSource = 'deck' | 'jira';

export interface BoardSummary {
  ref: string;
  source: BoardSource;
  title: string;
  /** Jira project key ("SCRUM"), or the Deck account name. */
  subtitle: string;
  /** Hex tile color (Deck board color). */
  color?: string;
  /** Image for the tile (Jira project avatar). */
  imageUrl?: string;
  /** Jira: the connected login the board belongs to. */
  accountId?: string;
}

export interface BoardCardItem {
  /** Deck card id, or Jira issue key. */
  id: string;
  title: string;
  /** Jira issue key shown on the card footer, e.g. SCRUM-266. */
  key?: string;
  typeName?: string;
  typeIconUrl?: string;
  priorityName?: string;
  priorityIconUrl?: string;
  assignee?: { name: string; avatarUrl?: string };
  assigneeCount?: number;
  labels: { title: string; color?: string }[];
  due?: string | null;
  hasDescription?: boolean;
  /** First line of the description as plain text, for the card's note. */
  note?: string;
  /**
   * Sub-items: a Jira issue's sub-tasks, or a Deck card's checklist (the
   * `- [ ]` / `- [x]` lines in its description).
   */
  subtasks?: BoardSubtask[];
  comments?: number;
  attachments?: number;
  /** Jira status category: done cards draw complete. */
  statusCategory?: string;
  /** Jira boards with sprints: the sprint the issue is in, or the backlog. */
  sprint?: CardSprint;
}

export interface BoardSubtask {
  title: string;
  done: boolean;
  /** Jira sub-task key, e.g. NOVA-31. */
  key?: string;
}

export interface CardSprint {
  /** `sprint:<id>` or `backlog`; what the Sprint filter stores. */
  key: string;
  label: string;
  state: 'active' | 'future' | 'closed' | 'backlog';
  /** Board order: active sprints, upcoming ones, finished ones, then the backlog. */
  rank: number;
}

export interface BoardColumnItem {
  /** Deck stack id, or Jira column name. */
  id: string;
  title: string;
  cards: BoardCardItem[];
}

export function boardRef(source: BoardSource, id: number | string) {
  return `${source}:${id}`;
}

export function parseBoardRef(ref: string): { source: BoardSource; id: string } | null {
  const match = /^(deck|jira):(.+)$/.exec(ref);
  return match ? { source: match[1] as BoardSource, id: match[2] } : null;
}

/** Split the id part of a Jira board ref into the board id and its login. */
export function parseJiraBoardId(id: string): { boardId: number; accountId?: string } | null {
  const at = id.indexOf('@');
  const boardId = Number(at < 0 ? id : id.slice(0, at));
  if (!Number.isFinite(boardId)) return null;
  return at < 0 ? { boardId } : { boardId, accountId: id.slice(at + 1) || undefined };
}

export function deckBoardSummary(board: DeckBoard, showAccount: boolean): BoardSummary {
  const color = typeof board.raw.color === 'string' ? `#${board.raw.color.replace(/^#/, '')}` : undefined;
  return {
    ref: boardRef('deck', board.id),
    source: 'deck',
    title: board.title,
    subtitle: showAccount && board.account_name ? `Deck · ${board.account_name}` : 'Deck',
    color,
  };
}

/** `accountLabel` names the login when more than one is connected. */
export function jiraBoardSummary(board: JiraBoard, accountLabel?: string): BoardSummary {
  const key = board.projectKey ?? board.type.toUpperCase();
  return {
    ref: boardRef('jira', `${board.id}@${board.accountId}`),
    source: 'jira',
    title: board.projectName && board.name.toLowerCase().includes('board') ? board.projectName : board.name,
    subtitle: accountLabel ? `${key} · ${accountLabel}` : key,
    imageUrl: board.projectAvatarUrl,
    accountId: board.accountId,
  };
}

function deckCardItem(card: DeckCard, index: number): BoardCardItem {
  const assignees = card.assignedUsers ?? [];
  const first = assignees[0]?.participant?.displayname;
  return {
    id: String(card.id ?? `idx-${index}`),
    title: card.title ?? 'Untitled',
    labels: (card.labels ?? []).map((label) => ({
      title: label.title ?? '',
      color: label.color ? `#${label.color}` : undefined,
    })),
    due: card.duedate ?? null,
    assignee: first ? { name: first } : undefined,
    assigneeCount: assignees.length,
    hasDescription: !!card.description?.trim(),
    note: noteOf(card.description),
    subtasks: checklistItems(card.description),
    comments: count(card.commentsCount),
    attachments: count(card.attachmentCount),
  };
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

/** The first line of prose in a markdown description, markers and checklist lines left out. */
export function noteOf(markdown: string | undefined): string | undefined {
  if (!markdown) return undefined;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line || /^[-*+]\s+\[[ xX]\]/.test(line)) continue;
    const text = line
      .replace(/^#{1,6}\s+|^>\s?|^[-*+]\s+|^\d+[.)]\s+/, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim();
    if (text) return text.length > 140 ? `${text.slice(0, 139)}…` : text;
  }
  return undefined;
}

/** The checklist items in a markdown description, or nothing without one. */
export function checklistItems(markdown: string | undefined): BoardSubtask[] | undefined {
  if (!markdown) return undefined;
  const items: BoardSubtask[] = [];
  for (const match of markdown.matchAll(/^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/gm)) {
    items.push({ title: match[2].trim(), done: match[1].toLowerCase() === 'x' });
  }
  return items.length ? items : undefined;
}

export function deckColumns(detail: DeckBoardDetail): BoardColumnItem[] {
  return detail.stacks
    .filter((stack) => typeof stack.id === 'number')
    .map((stack) => ({
      id: String(stack.id),
      title: stack.title ?? 'Stack',
      cards: (stack.cards ?? []).map(deckCardItem),
    }));
}

const BACKLOG: CardSprint = { key: 'backlog', label: 'Backlog', state: 'backlog', rank: Number.MAX_SAFE_INTEGER };

function jiraCardSprint(issue: JiraIssue, detail: JiraBoardDetail): CardSprint {
  const sprint = issue.sprint;
  if (!sprint) return BACKLOG;
  const open = detail.sprints.findIndex((candidate) => candidate.id === sprint.id);
  return {
    key: `sprint:${sprint.id}`,
    label: sprint.name,
    state: sprint.state,
    // Open sprints in Jira's order; a sprint the board did not list (a
    // finished one) after them, newest id first.
    rank: open >= 0 ? open : 10_000 - (sprint.id % 10_000),
  };
}

function jiraCardItem(issue: JiraIssue, sprint?: CardSprint): BoardCardItem {
  return {
    id: issue.key,
    key: issue.key,
    title: issue.summary,
    typeName: issue.typeName,
    typeIconUrl: issue.typeIconUrl,
    priorityName: issue.priorityName,
    priorityIconUrl: issue.priorityIconUrl,
    assignee: issue.assignee
      ? { name: issue.assignee.displayName, avatarUrl: issue.assignee.avatarUrl }
      : undefined,
    assigneeCount: issue.assignee ? 1 : 0,
    labels: issue.labels.map((title) => ({ title })),
    due: issue.duedate ?? null,
    statusCategory: issue.statusCategory,
    subtasks: issue.subtasks?.length ? issue.subtasks : undefined,
    sprint,
  };
}

export function jiraColumns(detail: JiraBoardDetail): BoardColumnItem[] {
  const hasSprints =
    detail.sprints.length > 0 || detail.columns.some((column) => column.issues.some((issue) => issue.sprint));
  return detail.columns.map((column) => ({
    id: column.name,
    title: column.name,
    cards: column.issues.map((issue) => jiraCardItem(issue, hasSprints ? jiraCardSprint(issue, detail) : undefined)),
  }));
}

/** Two-letter initials for an avatar fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Stable pleasant color per name, for avatar circles. */
export function nameColor(name: string): string {
  const palette = ['#0B8043', '#F09300', '#0097A7', '#1A73E8', '#8E24AA', '#D81B60', '#5E7D2B', '#E65100'];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

// ── Filters ────────────────────────────────────────────────────────────

export interface BoardFilters {
  /** Sprint keys (`sprint:<id>` or `backlog`). */
  sprints: string[];
  types: string[];
  priorities: string[];
  labels: string[];
}

export const EMPTY_FILTERS: BoardFilters = { sprints: [], types: [], priorities: [], labels: [] };

const PRIORITY_ORDER = ['highest', 'high', 'medium', 'low', 'lowest'];

function uniqueSorted(values: (string | undefined)[], order?: string[]) {
  const set = [...new Set(values.filter((value): value is string => !!value))];
  return set.sort((a, b) => {
    if (order) {
      const ai = order.indexOf(a.toLowerCase());
      const bi = order.indexOf(b.toLowerCase());
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }
    return a.localeCompare(b);
  });
}

/** The choices worth offering: only values that appear on this board. */
export function filterFacets(columns: BoardColumnItem[]) {
  const cards = columns.flatMap((column) => column.cards);
  const sprints = new Map<string, CardSprint>();
  for (const card of cards) if (card.sprint) sprints.set(card.sprint.key, card.sprint);
  return {
    sprints: [...sprints.values()].sort((a, b) => a.rank - b.rank),
    types: uniqueSorted(cards.map((card) => card.typeName)),
    priorities: uniqueSorted(cards.map((card) => card.priorityName), PRIORITY_ORDER),
    labels: uniqueSorted(cards.flatMap((card) => card.labels.map((label) => label.title))),
  };
}

export function activeFilterCount(filters: BoardFilters) {
  return filters.sprints.length + filters.types.length + filters.priorities.length + filters.labels.length;
}

/** A card passes when it matches every group that has a selection (any value within a group). */
export function applyFilters(columns: BoardColumnItem[], filters: BoardFilters): BoardColumnItem[] {
  if (activeFilterCount(filters) === 0) return columns;
  return columns.map((column) => ({
    ...column,
    cards: column.cards.filter(
      (card) =>
        (filters.sprints.length === 0 || (card.sprint != null && filters.sprints.includes(card.sprint.key))) &&
        (filters.types.length === 0 || (card.typeName != null && filters.types.includes(card.typeName))) &&
        (filters.priorities.length === 0 ||
          (card.priorityName != null && filters.priorities.includes(card.priorityName))) &&
        (filters.labels.length === 0 || card.labels.some((label) => filters.labels.includes(label.title)))
    ),
  }));
}

/**
 * Group each column's cards by sprint when the cards on screen span more
 * than one sprint (or a sprint and the backlog). Within a group the board's
 * own order (Jira rank) is kept. Returns the columns unchanged otherwise.
 */
export function groupBySprint(columns: BoardColumnItem[]): { columns: BoardColumnItem[]; grouped: boolean } {
  const keys = new Set<string>();
  for (const column of columns) for (const card of column.cards) if (card.sprint) keys.add(card.sprint.key);
  if (keys.size < 2) return { columns, grouped: false };
  return {
    grouped: true,
    columns: columns.map((column) => ({
      ...column,
      cards: column.cards
        .map((card, index) => ({ card, index }))
        .sort(
          (a, b) =>
            (a.card.sprint?.rank ?? Number.MAX_SAFE_INTEGER) - (b.card.sprint?.rank ?? Number.MAX_SAFE_INTEGER) ||
            a.index - b.index
        )
        .map(({ card }) => card),
    })),
  };
}

/**
 * Cards whose title, key, labels, note or sub-items contain every word of
 * `query`, case-insensitively. An empty query keeps everything.
 */
export function searchColumns(columns: BoardColumnItem[], query: string): BoardColumnItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return columns;
  return columns.map((column) => ({
    ...column,
    cards: column.cards.filter((card) => {
      const haystack = [
        card.title,
        card.key,
        card.note,
        card.typeName,
        card.priorityName,
        card.assignee?.name,
        ...card.labels.map((label) => label.title),
        ...(card.subtasks ?? []).map((sub) => sub.title),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    }),
  }));
}
