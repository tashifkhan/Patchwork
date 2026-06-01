// Mirrors the FastAPI proxy Pydantic models in proxy/app/model.
// The backend uses snake_case; keep these names identical to the JSON shape.

export interface TaskList {
  id: string;
  href: string;
  name: string;
  is_deck: boolean;
  /** Calendar component names advertised by CalDAV, e.g. VTODO/VEVENT. */
  supported_components?: string[];
  /** Owning CalDAV account (native multi-account). Absent on the web/proxy path. */
  account_id?: string;
  /** Human-readable account label, for grouping lists by account in the UI. */
  account_name?: string;
}

export interface TaskListCreate {
  name: string;
}

export interface Task {
  id: string;
  uid: string;
  list_id: string;
  list_name: string;
  title: string;
  description: string;
  markdown: string;
  completed: boolean;
  priority: number | null;
  due_at: string | null;
  reminder_at: string | null;
  tags: string[];
  /** Manual ordering within a list (CalDAV X-APPLE-SORT-ORDER). Lower sorts first. */
  sort_order: number | null;
  parent_uid: string | null;
  children: Task[];
  etag: string | null;
  updated_at: string | null;
  /** Owning CalDAV account (native multi-account). */
  account_id?: string;
}

export interface TaskCreate {
  list_id: string;
  title: string;
  markdown?: string;
  tags?: string[];
  due_at?: string | null;
  reminder_at?: string | null;
  parent_uid?: string | null;
  priority?: number | null;
  sort_order?: number | null;
}

export interface TaskUpdate {
  title?: string;
  markdown?: string;
  completed?: boolean;
  tags?: string[];
  due_at?: string | null;
  reminder_at?: string | null;
  parent_uid?: string | null;
  priority?: number | null;
  sort_order?: number | null;
  etag?: string | null;
}

export interface HealthResponse {
  status: 'ok';
  nextcloud_configured: boolean;
  gemini_configured: boolean;
  github_configured: boolean;
}

export interface DeckBoard {
  id: number;
  title: string;
  raw: Record<string, unknown>;
}

export interface DeckBoardCreate {
  title: string;
  color?: string;
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
  readOnly?: boolean;
}

export interface GitHubIssueUpdate {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
}

export interface GitHubRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  owner: GitHubUser;
}
