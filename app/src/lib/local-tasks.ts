import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Task, TaskCreate, TaskList, TaskUpdate } from '@/api/types';
import { normalizeTags } from '@/lib/tags';

/**
 * Lists and to-dos that live only on this device, for people without a
 * CalDAV account or who want a few private lists. They behave like any other
 * account in the task API: list ids are `local:<slug>`, task ids `local://…`.
 *
 * Also keeps the last lists and tasks each CalDAV account returned, so the
 * app can show them (and pick a list for an offline save) with no connection.
 */

export const LOCAL_ACCOUNT_ID = 'local';
export const LOCAL_ACCOUNT_NAME = 'On this device';
const LOCAL_TASK_PREFIX = 'local://tasks/';
const LOCAL_LIST_HREF = 'local://lists/';

const STORE_KEY = 'patchwork.local-tasks.v1';
const CACHE_KEY = 'patchwork.remote-cache.v1';

interface LocalListRecord {
  slug: string;
  name: string;
}

interface LocalStore {
  lists: LocalListRecord[];
  /** Flat; children are rebuilt from `parent_uid` when read. */
  tasks: Task[];
}

let writing: Promise<unknown> = Promise.resolve();

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as T) }) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Serialised read-modify-write, so overlapping saves never lose each other.
 * Unlike `readJson` this throws on a failed read: writing the fallback back
 * would wipe every on-device to-do.
 */
function update<T>(key: string, fallback: T, change: (value: T) => T): Promise<T> {
  const run = writing.then(async () => {
    const raw = await AsyncStorage.getItem(key);
    const current = raw ? ({ ...fallback, ...(JSON.parse(raw) as T) }) : fallback;
    const next = change(current);
    await AsyncStorage.setItem(key, JSON.stringify(next));
    return next;
  });
  writing = run.catch(() => {});
  return run;
}

const emptyStore = (): LocalStore => ({ lists: [], tasks: [] });

export function isLocalListId(listId: string | undefined | null): boolean {
  return !!listId && listId.startsWith(`${LOCAL_ACCOUNT_ID}:`);
}

export function isLocalTaskId(taskId: string) {
  return taskId.startsWith(LOCAL_TASK_PREFIX);
}

function toList(record: LocalListRecord): TaskList {
  return {
    id: `${LOCAL_ACCOUNT_ID}:${record.slug}`,
    href: `${LOCAL_LIST_HREF}${record.slug}/`,
    name: record.name,
    is_deck: false,
    supported_components: ['VTODO'],
    account_id: LOCAL_ACCOUNT_ID,
    account_name: LOCAL_ACCOUNT_NAME,
  };
}

export async function getLocalLists(): Promise<TaskList[]> {
  return (await readJson(STORE_KEY, emptyStore())).lists.map(toList);
}

/** With no account configured, a fresh install gets one list so the + button just works. */
export async function ensureDefaultLocalList(): Promise<TaskList[]> {
  const store = await update(STORE_KEY, emptyStore(), (current) =>
    current.lists.length > 0 ? current : { ...current, lists: [{ slug: 'tasks', name: 'Tasks' }] }
  );
  return store.lists.map(toList);
}

export async function createLocalList(name: string): Promise<TaskList> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('List name cannot be empty.');
  let created: LocalListRecord | null = null;
  await update(STORE_KEY, emptyStore(), (current) => {
    const base = slugify(trimmed);
    let slug = base;
    for (let n = 2; current.lists.some((list) => list.slug === slug); n += 1) slug = `${base}-${n}`;
    created = { slug, name: trimmed };
    return { ...current, lists: [...current.lists, created] };
  });
  return toList(created!);
}

export async function renameLocalList(listId: string, name: string): Promise<TaskList> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('List name cannot be empty.');
  const slug = listSlug(listId);
  const store = await update(STORE_KEY, emptyStore(), (current) => ({
    lists: current.lists.map((list) => (list.slug === slug ? { ...list, name: trimmed } : list)),
    tasks: current.tasks.map((task) => (task.list_id === listId ? { ...task, list_name: trimmed } : task)),
  }));
  const record = store.lists.find((list) => list.slug === slug);
  if (!record) throw new Error('Task list not found');
  return toList(record);
}

export async function deleteLocalList(listId: string) {
  const slug = listSlug(listId);
  await update(STORE_KEY, emptyStore(), (current) => ({
    lists: current.lists.filter((list) => list.slug !== slug),
    tasks: current.tasks.filter((task) => task.list_id !== listId),
  }));
}

export async function getLocalTasks(): Promise<Task[]> {
  return (await readJson(STORE_KEY, emptyStore())).tasks.map((task) => ({ ...task, children: [] }));
}

export async function getLocalTask(taskId: string): Promise<Task | null> {
  return (await getLocalTasks()).find((task) => task.id === taskId) ?? null;
}

export async function createLocalTask(payload: TaskCreate): Promise<Task> {
  const store = await readJson(STORE_KEY, emptyStore());
  const list = store.lists.find((record) => `${LOCAL_ACCOUNT_ID}:${record.slug}` === payload.list_id);
  if (!list) throw new Error('Task list not found');
  const uid = payload.uid ?? randomUuid();
  const now = new Date().toISOString();
  const task: Task = {
    id: `${LOCAL_TASK_PREFIX}${uid}`,
    uid,
    list_id: payload.list_id,
    list_name: list.name,
    account_id: LOCAL_ACCOUNT_ID,
    account_name: LOCAL_ACCOUNT_NAME,
    title: payload.title,
    description: payload.markdown ?? '',
    markdown: payload.markdown ?? '',
    completed: payload.completed ?? false,
    priority: payload.priority ?? null,
    due_at: payload.due_at ?? null,
    reminder_at: payload.reminder_at ?? null,
    tags: normalizeTags(payload.tags ?? []),
    sort_order: payload.sort_order ?? null,
    parent_uid: payload.parent_uid ?? null,
    children: [],
    etag: null,
    updated_at: now,
  };
  await update(STORE_KEY, emptyStore(), (current) => ({ ...current, tasks: [...current.tasks, task] }));
  return task;
}

export async function updateLocalTask(taskId: string, patch: TaskUpdate): Promise<Task> {
  const { etag: _etag, list_id: listId, ...fields } = patch;
  let updated: Task | null = null;
  await update(STORE_KEY, emptyStore(), (current) => {
    const list = listId ? current.lists.find((record) => `${LOCAL_ACCOUNT_ID}:${record.slug}` === listId) : null;
    return {
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) return task;
        updated = {
          ...task,
          ...fields,
          ...(fields.markdown !== undefined ? { description: fields.markdown } : {}),
          ...(fields.tags !== undefined ? { tags: normalizeTags(fields.tags) } : {}),
          ...(list ? { list_id: listId!, list_name: list.name } : {}),
          updated_at: new Date().toISOString(),
        };
        return updated;
      }),
    };
  });
  if (!updated) throw new Error('This to-do is no longer on this device.');
  return updated;
}

export async function deleteLocalTask(taskId: string) {
  await update(STORE_KEY, emptyStore(), (current) => ({
    ...current,
    tasks: current.tasks.filter((task) => task.id !== taskId),
  }));
}

// ── Last-known server data, for offline use ────────────────────────────

// One key per account and kind keeps each value small: Android's
// AsyncStorage can't read back a single row much over 2 MB.
const cacheKey = (kind: 'lists' | 'tasks', accountId: string) => `${CACHE_KEY}.${kind}.${accountId}`;

export async function cacheRemoteLists(accountId: string, lists: TaskList[]) {
  await AsyncStorage.setItem(cacheKey('lists', accountId), JSON.stringify(lists));
}

/** Flat tasks, so pending offline subtasks can still attach to cached parents. */
export async function cacheRemoteTasks(accountId: string, tasks: Task[]) {
  const flat = flatten(tasks).map((task) => ({ ...task, children: [] }));
  await AsyncStorage.setItem(cacheKey('tasks', accountId), JSON.stringify(flat));
}

export async function cachedRemoteLists(accountId: string): Promise<TaskList[] | null> {
  return readArray<TaskList>(cacheKey('lists', accountId));
}

export async function cachedRemoteTasks(accountId: string): Promise<Task[] | null> {
  return readArray<Task>(cacheKey('tasks', accountId));
}

/** Any list we know about, cached or local, for labelling an offline save. */
export async function findKnownList(listId: string): Promise<TaskList | null> {
  if (isLocalListId(listId)) return (await getLocalLists()).find((list) => list.id === listId) ?? null;
  const accountId = listId.split(':')[0];
  return (await cachedRemoteLists(accountId))?.find((list) => list.id === listId) ?? null;
}

async function readArray<T>(key: string): Promise<T[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function flatten(tasks: Task[]): Task[] {
  return tasks.flatMap((task) => [task, ...flatten(task.children ?? [])]);
}

function listSlug(listId: string) {
  return listId.slice(LOCAL_ACCOUNT_ID.length + 1);
}

function slugify(value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || `list-${Date.now().toString(36)}`;
}

function randomUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}
