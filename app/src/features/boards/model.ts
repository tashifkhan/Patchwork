import type { DeckBoard, DeckBoardDetail, DeckCard } from '@/api/types';
import type { JiraBoard, JiraBoardDetail, JiraIssue } from '@/api/jira';

/**
 * One shape for Nextcloud Deck boards and Jira boards, so the Boards tab can
 * list and render both the same way. A board ref is `deck:<id>` or
 * `jira:<id>`.
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

export function jiraBoardSummary(board: JiraBoard): BoardSummary {
  return {
    ref: boardRef('jira', board.id),
    source: 'jira',
    title: board.projectName && board.name.toLowerCase().includes('board') ? board.projectName : board.name,
    subtitle: board.projectKey ?? board.type.toUpperCase(),
    imageUrl: board.projectAvatarUrl,
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
  };
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

function jiraCardItem(issue: JiraIssue): BoardCardItem {
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
  };
}

export function jiraColumns(detail: JiraBoardDetail): BoardColumnItem[] {
  return detail.columns.map((column) => ({
    id: column.name,
    title: column.name,
    cards: column.issues.map(jiraCardItem),
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
  types: string[];
  priorities: string[];
  labels: string[];
}

export const EMPTY_FILTERS: BoardFilters = { types: [], priorities: [], labels: [] };

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
  return {
    types: uniqueSorted(cards.map((card) => card.typeName)),
    priorities: uniqueSorted(cards.map((card) => card.priorityName), PRIORITY_ORDER),
    labels: uniqueSorted(cards.flatMap((card) => card.labels.map((label) => label.title))),
  };
}

export function activeFilterCount(filters: BoardFilters) {
  return filters.types.length + filters.priorities.length + filters.labels.length;
}

/** A card passes when it matches every group that has a selection (any value within a group). */
export function applyFilters(columns: BoardColumnItem[], filters: BoardFilters): BoardColumnItem[] {
  if (activeFilterCount(filters) === 0) return columns;
  return columns.map((column) => ({
    ...column,
    cards: column.cards.filter(
      (card) =>
        (filters.types.length === 0 || (card.typeName != null && filters.types.includes(card.typeName))) &&
        (filters.priorities.length === 0 ||
          (card.priorityName != null && filters.priorities.includes(card.priorityName))) &&
        (filters.labels.length === 0 || card.labels.some((label) => filters.labels.includes(label.title)))
    ),
  }));
}
