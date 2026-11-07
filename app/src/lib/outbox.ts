import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { JiraIssueCreate } from '@/api/jira';
import type { GitHubIssueCreate, Task, TaskCreate } from '@/api/types';
import type { GitHubRepositorySelection } from '@/features/github/types';

/**
 * Things created while the device was offline, kept on disk until they reach
 * their account. `@/lib/outbox-sync` sends them; this module only stores them,
 * so the task API can read pending to-dos without importing the senders.
 */

interface EntryBase {
  id: string;
  createdAt: string;
  attempts: number;
  /** Last non-network failure. Entries with one stay put until sent or discarded. */
  lastError: string | null;
}

export interface OutboxTaskEntry extends EntryBase {
  kind: 'task';
  payload: TaskCreate & { uid: string };
  listName: string;
  accountId?: string;
  accountName?: string;
}

export interface OutboxGitHubEntry extends EntryBase {
  kind: 'github-issue';
  repository: GitHubRepositorySelection;
  issue: GitHubIssueCreate;
}

export interface OutboxJiraEntry extends EntryBase {
  kind: 'jira-issue';
  /** `JiraCredentials.id` of the login that will create it. */
  accountId: string;
  input: JiraIssueCreate;
}

export type OutboxEntry = OutboxTaskEntry | OutboxGitHubEntry | OutboxJiraEntry;
type NewEntry =
  | Omit<OutboxTaskEntry, keyof EntryBase>
  | Omit<OutboxGitHubEntry, keyof EntryBase>
  | Omit<OutboxJiraEntry, keyof EntryBase>;

const STORAGE_KEY = 'patchwork.outbox.v1';
export const PENDING_TASK_PREFIX = 'outbox://';

interface OutboxState {
  entries: OutboxEntry[];
  hydrated: boolean;
}

export const useOutboxStore = create<OutboxState>(() => ({ entries: [], hydrated: false }));

let loading: Promise<OutboxEntry[]> | null = null;
// Writes queue behind each other so two quick saves can't drop one another.
let writing: Promise<void> = Promise.resolve();

export function loadOutbox(): Promise<OutboxEntry[]> {
  if (useOutboxStore.getState().hydrated) return Promise.resolve(useOutboxStore.getState().entries);
  loading ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      const entries = Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
      useOutboxStore.setState({ entries, hydrated: true });
      return entries;
    })
    .catch(() => {
      useOutboxStore.setState({ entries: [], hydrated: true });
      return [];
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

async function mutate(change: (entries: OutboxEntry[]) => OutboxEntry[]) {
  await loadOutbox();
  const run = writing.then(async () => {
    const next = change(useOutboxStore.getState().entries);
    useOutboxStore.setState({ entries: next });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  });
  writing = run.catch(() => {});
  await run;
}

export async function enqueue(entry: NewEntry): Promise<OutboxEntry> {
  const full = {
    ...entry,
    id: randomId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  } as OutboxEntry;
  await mutate((entries) => [...entries, full]);
  return full;
}

export async function updateEntry(id: string, change: (entry: OutboxEntry) => OutboxEntry) {
  await mutate((entries) => entries.map((entry) => (entry.id === id ? change(entry) : entry)));
}

export async function removeEntry(id: string) {
  await mutate((entries) => entries.filter((entry) => entry.id !== id));
}

export async function getEntries() {
  return loadOutbox();
}

export function isPendingTaskId(taskId: string) {
  return taskId.startsWith(PENDING_TASK_PREFIX);
}

export function pendingEntryId(taskId: string) {
  return taskId.slice(PENDING_TASK_PREFIX.length);
}

/** A queued to-do shaped like a server task, so lists and detail screens can show it. */
export function pendingTask(entry: OutboxTaskEntry): Task {
  const { payload } = entry;
  return {
    id: `${PENDING_TASK_PREFIX}${entry.id}`,
    uid: payload.uid,
    list_id: payload.list_id,
    list_name: entry.listName,
    account_id: entry.accountId,
    account_name: entry.accountName,
    title: payload.title,
    description: payload.markdown ?? '',
    markdown: payload.markdown ?? '',
    completed: payload.completed ?? false,
    priority: payload.priority ?? null,
    due_at: payload.due_at ?? null,
    reminder_at: payload.reminder_at ?? null,
    tags: payload.tags ?? [],
    sort_order: payload.sort_order ?? null,
    parent_uid: payload.parent_uid ?? null,
    children: [],
    etag: null,
    updated_at: entry.createdAt,
    pending_sync: true,
  };
}

/** One line for settings and banners: what it is and where it's going. */
export function describeEntry(entry: OutboxEntry): { title: string; destination: string } {
  switch (entry.kind) {
    case 'task':
      return {
        title: entry.payload.title,
        destination: [entry.listName, entry.accountName].filter(Boolean).join(' · '),
      };
    case 'github-issue':
      return { title: entry.issue.title, destination: `GitHub · ${entry.repository.fullName}` };
    case 'jira-issue':
      return {
        title: entry.input.summary,
        destination: `Jira · ${entry.input.board.projectKey ?? entry.input.board.name}`,
      };
  }
}

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
