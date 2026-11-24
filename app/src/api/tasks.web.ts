import { api, ApiError } from './client';
import type {
  AttachmentAccess,
  AttachmentUpload,
  Task,
  TaskAttachment,
  TaskCreate,
  TaskList,
  TaskListCreate,
  TaskListUpdate,
  TaskUpdate,
} from './types';
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

/** Web has no offline outbox, so this is the same request as `createTask`. */
export function createRemoteTask(payload: TaskCreate) {
  return createTask(payload);
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

/** The web proxy has no Files endpoint, so attachments are native-only. */
export async function getAttachmentAccess(_accountId: string | undefined): Promise<AttachmentAccess | null> {
  return null;
}

export async function addTaskAttachment(
  _taskId: string,
  _file: AttachmentUpload,
  _accountId?: string,
  _etag?: string | null
): Promise<Task> {
  throw new ApiError(501, 'Attaching images needs the iOS or Android app.');
}

export async function removeTaskAttachment(
  _taskId: string,
  _attachment: TaskAttachment,
  _accountId?: string,
  _etag?: string | null
): Promise<Task> {
  throw new ApiError(501, 'Removing attachments needs the iOS or Android app.');
}
