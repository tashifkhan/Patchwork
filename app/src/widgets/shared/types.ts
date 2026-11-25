import type { BucketKey } from '@/features/tasks/task-buckets';

/** Compact, JSON-serializable subset of Task used by widget extensions. */
export interface WidgetTask {
  id: string;
  uid: string;
  href?: string;
  title: string;
  due_at: string | null;
  list_name: string;
  account_name: string;
  bucket: BucketKey;
}

export interface TodayProps {
  generatedAt: number;
  tasks: WidgetTask[];
  totalToday: number;
  totalOverdue: number;
}

export interface UpcomingProps {
  generatedAt: number;
  overdue: WidgetTask[];
  today: WidgetTask[];
  tomorrow: WidgetTask[];
  upcoming: WidgetTask[];
}

export interface ListProps {
  generatedAt: number;
  listId: string | null;
  listName: string;
  tasks: WidgetTask[];
}

export interface LockProps {
  generatedAt: number;
  totalToday: number;
  totalOverdue: number;
  nextTitle: string | null;
  nextDueAt: string | null;
}

export interface WidgetBoardCard {
  id: string;
  title: string;
  /** Jira issue key, e.g. SCRUM-266. Null for Deck cards. */
  key: string | null;
  due: string | null;
  overdue: boolean;
  /** Jira issue type, e.g. Bug, Story, Task, Epic. */
  type?: string | null;
  /** Jira priority, e.g. Highest, High, Medium, Low. */
  priority?: string | null;
  /** Assignee initials, e.g. "TK". */
  assignee?: string | null;
  /** Jira: the issue's sprint (or "Backlog"), only when it differs from the board's sprint. */
  sprint?: string | null;
  /** Deep link that opens the card or issue in the app. */
  url: string;
}

export interface WidgetBoardColumn {
  id: string;
  title: string;
  /** Every card in the column, including ones cut from `cards`. */
  count: number;
  cards: WidgetBoardCard[];
}

export interface BoardsProps {
  generatedAt: number;
  /** `deck:<id>` or `jira:<id>@<login>`; null until a board has been opened. */
  boardRef: string | null;
  title: string;
  subtitle: string;
  source: 'deck' | 'jira' | null;
  /** Deep link that opens the board. */
  url: string;
  sprintName: string | null;
  /** Jira: "3 days left", "Ends today", "Starts Mon 17 Nov". */
  sprintTiming?: string | null;
  totalCards: number;
  columns: WidgetBoardColumn[];
  /**
   * Android only: the column picked with the widget's filter chips. The widget sets it
   * itself when a chip is tapped; app pushes leave it out, which shows the first column.
   */
  selectedColumn?: string | null;
}
