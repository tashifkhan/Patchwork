import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { Task, TaskCreate } from '@/api/types';
import { attachmentAsLink } from '@/api/caldav/ics-attachments';
import { flattenTasks } from '@/features/tasks/task-buckets';
import { randomUuid } from '@/lib/uuid';

/**
 * Deleted to-dos, kept on this device for 30 days so a mistaken delete can be
 * undone. CalDAV has no trash of its own, so this holds a copy of each
 * to-do's fields. Restoring creates it again with the same UID, which puts
 * its old subtasks (still on the server, pointing at that UID) back under it.
 */

export type SavedTask = TaskCreate & { uid: string };

export interface BinEntry {
  id: string;
  deletedAt: string;
  listName: string;
  accountName?: string;
  task: SavedTask;
  checklist?: SavedTask[];
  attachmentSource?: Pick<Task, 'account_id' | 'attachments'>;
}

const STORAGE_KEY = 'patchwork.recycle-bin.v1';
const KEEP_DAYS = 30;
export const MAX_RECYCLE_BIN_ENTRIES = 300;

interface BinState {
  entries: BinEntry[];
  hydrated: boolean;
}

export const useRecycleBinStore = create<BinState>(() => ({ entries: [], hydrated: false }));

let writing: Promise<void> = Promise.resolve();

export async function loadRecycleBin(): Promise<BinEntry[]> {
  if (useRecycleBinStore.getState().hydrated) return useRecycleBinStore.getState().entries;
  try {
    const entries = await readRecycleBin();
    const current = useRecycleBinStore.getState();
    if (current.hydrated) return current.entries;
    useRecycleBinStore.setState({ entries, hydrated: true });
    return entries;
  } catch {
    return [];
  }
}

async function readRecycleBin() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  const parsed: unknown = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Could not read the recycle bin.');
  return prune(parsed as BinEntry[]);
}

function save(change: (entries: BinEntry[]) => BinEntry[]) {
  const run = writing.then(async () => {
    const state = useRecycleBinStore.getState();
    const current = state.hydrated ? state.entries : await readRecycleBin();
    const next = prune(change(current));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    useRecycleBinStore.setState({ entries: next, hydrated: true });
  });
  writing = run.catch(() => {});
  return run;
}

function prune(entries: BinEntry[]) {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  return entries
    .filter((entry) => new Date(entry.deletedAt).getTime() >= cutoff)
    .slice(0, MAX_RECYCLE_BIN_ENTRIES);
}

export function taskSnapshot(task: Task): SavedTask {
  return {
    list_id: task.list_id,
    uid: task.uid,
    title: task.title,
    markdown: task.markdown,
    completed: task.completed,
    tags: task.tags,
    due_at: task.due_at,
    start_at: task.start_at ?? null,
    reminder_at: task.reminder_at,
    parent_uid: task.parent_uid,
    priority: task.priority,
    sort_order: task.sort_order,
    pinned: task.pinned,
    rrule: task.rrule,
    attachments: task.attachments?.filter((item) => !item.path && !item.file_id).map(attachmentAsLink),
  };
}

export function addToRecycleBin(tasks: Task[], { keepChecklist = false } = {}) {
  if (tasks.length === 0) return Promise.resolve();
  const now = new Date().toISOString();
  const added: BinEntry[] = tasks.map((task) => ({
    id: randomUuid(),
    deletedAt: now,
    listName: task.list_name,
    accountName: task.account_name,
    task: taskSnapshot(task),
    ...(keepChecklist && task.children.length > 0 ? { checklist: flattenTasks(task.children).map(taskSnapshot) } : {}),
    ...(task.attachments?.some((item) => item.path || item.file_id)
      ? { attachmentSource: { account_id: task.account_id, attachments: task.attachments } }
      : {}),
  }));
  return save((entries) => [...added, ...entries.filter((entry) => !added.some((a) => a.task.uid === entry.task.uid && a.task.list_id === entry.task.list_id))]);
}

/** Keep outstanding checklist items available when restoring to a CalDAV list. */
export async function splitRecycleBinChecklist(entry: BinEntry, parent: Pick<Task, 'list_id' | 'list_name' | 'account_name'>) {
  const children = (entry.checklist ?? []).map((task): BinEntry => ({
    id: randomUuid(),
    deletedAt: entry.deletedAt,
    listName: parent.list_name,
    accountName: parent.account_name,
    task: { ...task, list_id: parent.list_id },
  }));
  await save((entries) => [...children, ...entries.filter((item) => item.id !== entry.id)]);
  return children;
}

export function removeFromRecycleBin(ids: string[]) {
  const drop = new Set(ids);
  return save((entries) => entries.filter((entry) => !drop.has(entry.id)));
}

export function emptyRecycleBin() {
  return save(() => []);
}
