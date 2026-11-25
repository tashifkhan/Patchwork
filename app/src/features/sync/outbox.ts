import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { JiraIssueCreate } from '@/api/jira';
import type { AttachmentUpload, GitHubIssueCreate, Task, TaskCreate } from '@/api/types';
import type { GitHubRepositorySelection } from '@/features/github/types';

/**
 * Things created while the device was offline, kept on disk until they reach
 * their account. The replay module sends them; this module only stores them,
 * so the task API can read pending to-dos without importing the senders.
 */

interface EntryBase {
  id: string;
  createdAt: string;
  attempts: number;
  /** Last non-network failure. Entries with one stay put until sent or discarded. */
  lastError: string | null;
  delivery?: 'sending' | 'uncertain';
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

/** A file picked while offline, waiting to go up to the task's Nextcloud Files. */
export interface OutboxAttachmentEntry extends EntryBase {
  kind: 'attachment';
  /** Stable path for attachments queued by older and newer app versions. */
  uploadId?: string;
  operationId?: string;
  /** The task's server href, or the `outbox://` id of a to-do that hasn't synced yet. */
  taskId: string;
  taskUid: string;
  taskTitle: string;
  accountId: string;
  accountName?: string;
  /** A copy of the picked file in the app's documents folder, so it survives restarts. */
  file: AttachmentUpload;
}

export type OutboxEntry = OutboxTaskEntry | OutboxGitHubEntry | OutboxJiraEntry | OutboxAttachmentEntry;
type NewEntry =
  | Omit<OutboxTaskEntry, keyof EntryBase>
  | Omit<OutboxAttachmentEntry, keyof EntryBase>
  | Omit<OutboxGitHubEntry, keyof EntryBase>
  | Omit<OutboxJiraEntry, keyof EntryBase>;

const STORAGE_KEY = 'patchwork.outbox.v1';
export const PENDING_TASK_PREFIX = 'outbox://';

interface OutboxState {
  entries: OutboxEntry[];
  hydrated: boolean;
  loadError: string | null;
}

export const useOutboxStore = create<OutboxState>(() => ({ entries: [], hydrated: false, loadError: null }));

let loading: Promise<OutboxEntry[]> | null = null;
// Writes queue behind each other so two quick saves can't drop one another.
let writing: Promise<void> = Promise.resolve();
const inFlight = new Set<string>();

function serialize<T>(work: () => T | Promise<T>): Promise<T> {
  const run = writing.then(work);
  writing = run.then(() => {}, () => {});
  return run;
}

export function loadOutbox(): Promise<OutboxEntry[]> {
  if (useOutboxStore.getState().hydrated) return Promise.resolve(useOutboxStore.getState().entries);
  loading ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      if (!Array.isArray(parsed)) throw new Error('Invalid outbox data');
      const entries = parsed as OutboxEntry[];
      useOutboxStore.setState({ entries, hydrated: true, loadError: null });
      return entries;
    })
    .catch(() => {
      const message = 'Could not read pending changes on this device. Try again before saving offline.';
      useOutboxStore.setState({ loadError: message });
      throw new Error(message);
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

async function mutate(change: (entries: OutboxEntry[]) => OutboxEntry[]) {
  await loadOutbox();
  await serialize(async () => {
    const next = change(useOutboxStore.getState().entries);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    useOutboxStore.setState({ entries: next });
  });
}

export async function enqueue(entry: NewEntry, uncertain?: string): Promise<OutboxEntry> {
  const full = {
    ...entry,
    id: randomId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: uncertain ?? null,
    ...(uncertain ? { delivery: 'uncertain' as const } : {}),
  } as OutboxEntry;
  await mutate((entries) => {
    if (entry.kind === 'attachment' && isPendingTaskId(entry.taskId)) {
      const parentId = pendingEntryId(entry.taskId);
      if (inFlight.has(parentId) || !entries.some((item) => item.id === parentId)) {
        throw new Error('This task is syncing or has moved. Reopen it and try adding the file again.');
      }
    }
    return [...entries, full];
  });
  return full;
}

export async function updateEntry(id: string, change: (entry: OutboxEntry) => OutboxEntry) {
  await mutate((entries) => {
    if (inFlight.has(id)) throw new Error('This change is syncing. Try again when it finishes.');
    return entries.map((entry) => entry.id === id ? change(entry) : entry);
  });
}

export async function removeEntries(ids: string[]) {
  const removing = new Set(ids);
  await mutate((entries) => {
    if (ids.some((id) => inFlight.has(id))) throw new Error('This change is syncing. Try again when it finishes.');
    return entries.filter((entry) => !removing.has(entry.id));
  });
}

export function removeEntry(id: string) {
  return removeEntries([id]);
}

interface LockedEntry {
  update: (change: (entry: OutboxEntry) => OutboxEntry) => Promise<void>;
  remove: (relatedIds?: string[]) => Promise<void>;
}

export async function withOutboxEntry<T>(
  id: string,
  work: (entry: OutboxEntry, locked: LockedEntry) => Promise<T>,
): Promise<T | undefined> {
  await loadOutbox();
  const entry = await serialize(() => {
    if (inFlight.has(id)) return undefined;
    const entry = useOutboxStore.getState().entries.find((item) => item.id === id);
    if (entry) inFlight.add(id);
    return entry;
  });
  if (!entry) return;

  try {
    return await work(entry, {
      update: (change) => mutate((entries) => entries.map((item) => item.id === id ? change(item) : item)),
      remove: (relatedIds = []) => mutate((entries) => {
        if (relatedIds.some((relatedId) => inFlight.has(relatedId))) {
          throw new Error('A related change is syncing. Try again when it finishes.');
        }
        const removing = new Set([id, ...relatedIds]);
        return entries.filter((item) => !removing.has(item.id));
      }),
    });
  } finally {
    inFlight.delete(id);
  }
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
    start_at: payload.start_at ?? null,
    reminder_at: payload.reminder_at ?? null,
    tags: payload.tags ?? [],
    sort_order: payload.sort_order ?? null,
    pinned: payload.pinned ?? false,
    rrule: payload.rrule ?? null,
    parent_uid: payload.parent_uid ?? null,
    children: [],
    etag: null,
    updated_at: entry.createdAt,
    pending_sync: true,
    attachments: payload.attachments,
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
    case 'attachment':
      return {
        title: entry.file.name,
        destination: [entry.taskTitle, entry.accountName].filter(Boolean).join(' · '),
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
