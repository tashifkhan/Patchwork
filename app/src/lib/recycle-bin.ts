import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { Task, TaskCreate } from '@/api/types';

/**
 * Deleted to-dos, kept on this device for 30 days so a mistaken delete can be
 * undone. CalDAV has no trash of its own, so this holds a copy of each
 * to-do's fields. Restoring creates it again with the same UID, which puts
 * its old subtasks (still on the server, pointing at that UID) back under it.
 */

export interface BinEntry {
  id: string;
  deletedAt: string;
  listName: string;
  accountName?: string;
  task: TaskCreate & { uid: string };
  attachmentSource?: Pick<Task, 'account_id' | 'attachments'>;
}

const STORAGE_KEY = 'patchwork.recycle-bin.v1';
const KEEP_DAYS = 30;
const MAX_ENTRIES = 300;

interface BinState {
  entries: BinEntry[];
  hydrated: boolean;
}

export const useRecycleBinStore = create<BinState>(() => ({ entries: [], hydrated: false }));

let writing: Promise<void> = Promise.resolve();

export async function loadRecycleBin(): Promise<BinEntry[]> {
  if (useRecycleBinStore.getState().hydrated) return useRecycleBinStore.getState().entries;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const entries = prune(Array.isArray(parsed) ? (parsed as BinEntry[]) : []);
    useRecycleBinStore.setState({ entries, hydrated: true });
    return entries;
  } catch {
    useRecycleBinStore.setState({ entries: [], hydrated: true });
    return [];
  }
}

function save(change: (entries: BinEntry[]) => BinEntry[]) {
  const run = writing.then(async () => {
    const current = await loadRecycleBin();
    const next = prune(change(current));
    useRecycleBinStore.setState({ entries: next });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  });
  writing = run.catch(() => {});
  return run;
}

function prune(entries: BinEntry[]) {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  return entries
    .filter((entry) => new Date(entry.deletedAt).getTime() >= cutoff)
    .slice(0, MAX_ENTRIES);
}

export function taskSnapshot(task: Task): TaskCreate & { uid: string } {
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
  };
}

export function addToRecycleBin(tasks: Task[]) {
  if (tasks.length === 0) return Promise.resolve();
  const now = new Date().toISOString();
  const added: BinEntry[] = tasks.map((task) => ({
    id: `${task.uid}:${Date.now().toString(36)}`,
    deletedAt: now,
    listName: task.list_name,
    accountName: task.account_name,
    task: taskSnapshot(task),
    ...(task.attachments?.length ? { attachmentSource: { account_id: task.account_id, attachments: task.attachments } } : {}),
  }));
  return save((entries) => [...added, ...entries.filter((entry) => !added.some((a) => a.task.uid === entry.task.uid))]);
}

export function removeFromRecycleBin(ids: string[]) {
  const drop = new Set(ids);
  return save((entries) => entries.filter((entry) => !drop.has(entry.id)));
}

export function emptyRecycleBin() {
  return save(() => []);
}
