import { api } from './client';
import type { Task, TaskCreate, TaskList, TaskUpdate } from './types';

export function fetchTaskLists() {
  return api.get<TaskList[]>('/api/task-lists');
}

export function fetchTasks() {
  return api.get<Task[]>('/api/tasks');
}

export function createTask(payload: TaskCreate) {
  return api.post<Task>('/api/tasks', payload);
}

// Backend currently returns 501 for these two until CalDAV write support lands.
export function updateTask(taskId: string, payload: TaskUpdate) {
  return api.patch<Task>(`/api/tasks/${encodeURIComponent(taskId)}`, payload);
}

export function deleteTask(taskId: string) {
  return api.delete<void>(`/api/tasks/${encodeURIComponent(taskId)}`);
}
