import { api, ApiError } from './client';
import type { Task, TaskCreate, TaskList, TaskListCreate, TaskListUpdate, TaskUpdate } from './types';
import type { CalDavAccount } from '@/lib/credentials';

export function fetchTaskLists() {
  return api.get<TaskList[]>('/api/task-lists');
}

export function createTaskList(payload: TaskListCreate) {
  return api.post<TaskList>('/api/task-lists', payload);
}

export function updateTaskList(listId: string, payload: TaskListUpdate) {
  return api.patch<TaskList>(`/api/task-lists/${encodeURIComponent(listId)}`, payload);
}

export function deleteTaskList(listId: string) {
  return api.delete<void>(`/api/task-lists/${encodeURIComponent(listId)}`);
}

export function fetchTasks() {
  return api.get<Task[]>('/api/tasks');
}

export function createTask(payload: TaskCreate) {
  return api.post<Task>('/api/tasks', payload);
}

export function updateTask(taskId: string, payload: TaskUpdate, _accountId?: string) {
  return api.patch<Task>(`/api/tasks/${encodeURIComponent(taskId)}`, payload);
}

export function deleteTask(taskId: string, _accountId?: string, _etag?: string | null) {
  return api.delete<void>(`/api/tasks/${encodeURIComponent(taskId)}`);
}

/**
 * Web has no per-device CalDAV accounts — the proxy owns the server credentials
 * (see `proxy/app/core/config.py`) and exposes no endpoint to add or check one,
 * so there is nothing here to validate against.
 *
 * The Settings hub hides account management on web, but `/settings/account` is
 * still a routable URL in the single-page web build. Fail loudly rather than
 * letting `saveAccount` (a no-op stub on web) report a success it did not
 * perform. Present only because the native module exports it; a missing symbol
 * here is a runtime `undefined` on web that TypeScript cannot see.
 */
export async function validateCalDavAccount(_account: CalDavAccount): Promise<void> {
  throw new ApiError(
    501,
    'CalDAV accounts are configured on the proxy server, not in the browser. Set them in the proxy environment, or use the iOS/Android app to connect an account on-device.'
  );
}
