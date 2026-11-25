import type { TaskList } from '@/features/tasks/model';

export type { TaskList, TaskListCreate, TaskListUpdate, Task, TaskAttachment, AttachmentTarget, AttachmentUpload, AttachmentAccess, TaskCreate, TaskUpdate } from '@/features/tasks/model';

export interface DeckBoard {
  /** App-scoped stable id; the server-local id remains inside `raw.id`. */
  id: number;
  title: string;
  account_id?: string;
  account_name?: string;
  raw: Record<string, unknown>;
}

export interface DeckBoardCreate {
  title: string;
  color?: string;
  account_id?: string;
}

// Deck card/stack shapes are passed through as `raw` JSON from the Nextcloud
// Deck REST API, so they are loosely typed.
export interface DeckLabel {
  id?: number;
  title?: string;
  color?: string;
}

export interface DeckCard {
  id?: number;
  title?: string;
  description?: string;
  duedate?: string | null;
  labels?: DeckLabel[];
  assignedUsers?: { participant?: { displayname?: string } }[];
  [key: string]: unknown;
}

export interface DeckStack {
  id?: number;
  title?: string;
  cards?: DeckCard[];
  [key: string]: unknown;
}

export interface DeckBoardDetail {
  board_id: number;
  stacks: DeckStack[];
}

export interface DeckCardCreate {
  board_id: number;
  stack_id: number;
  title: string;
  description?: string;
  duedate?: string | null;
}

export interface DeckCardUpdate {
  board_id: number;
  /** The stack the card is currently in, used for the Deck API path. */
  stack_id: number;
  card_id: number;
  /** Optional destination stack for kanban-style card movement. */
  target_stack_id?: number;
  title?: string;
  description?: string;
  duedate?: string | null;
}

export interface DeckCardDelete {
  board_id: number;
  stack_id: number;
  card_id: number;
}

export interface DeckCardReorder {
  board_id: number;
  /** The stack the card is currently in. */
  stack_id: number;
  card_id: number;
  /** Destination stack (may equal stack_id for an in-stack reorder). */
  target_stack_id: number;
  /** Zero-based position within the destination stack. */
  order: number;
}

export interface DeckStackCreate {
  board_id: number;
  title: string;
  /** Position of the column on the board. */
  order: number;
}

export interface DeckStackUpdate {
  board_id: number;
  stack_id: number;
  title: string;
  order: number;
}

export interface DeckStackDelete {
  board_id: number;
  stack_id: number;
}

export interface AiGeneratedSubtask {
  title: string;
  description?: string | null;
}

export interface AiGeneratedTask {
  /** Client-generated stable identity used to make staged imports retry-safe. */
  draft_id?: string;
  title: string;
  description?: string | null;
  list_id?: string | null;
  tags: string[];
  due_at?: string | null;
  reminder_at?: string | null;
  priority?: number | null;
  subtasks: AiGeneratedSubtask[];
}

export interface AiTasksResponse {
  tasks: AiGeneratedTask[];
}

export interface AiDraftRequest {
  instruction: string;
  available_lists?: TaskList[];
  available_tags?: string[];
}

export interface AiRefineRequest {
  instruction: string;
  tasks: AiGeneratedTask[];
  available_lists?: TaskList[];
  available_tags?: string[];
}

// ── GitHub Issues ──────────────────────────────────────────────────────

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  repositoryId: number | null;
  repo: string;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  created_at: string;
  updated_at: string;
  html_url: string;
  completed: boolean;
  source: 'github';
  canWrite: boolean;
  readOnly: boolean;
  /** GitHub user id of the connected account that loaded the issue. */
  accountId?: number;
}

export interface GitHubIssueUpdate {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
}

export interface GitHubIssueCreate {
  title: string;
  body?: string;
  assignees?: string[];
  /** Label names; GitHub creates any that don't exist yet when you can push. */
  labels?: string[];
}

export interface GitHubRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  visibility: 'public' | 'private' | 'internal';
  archived: boolean;
  has_issues: boolean;
  canCreateIssues: boolean;
  canWriteIssues: boolean;
  owner: GitHubUser;
  /** GitHub user id of the connected account that can see the repository. */
  accountId?: number;
}
