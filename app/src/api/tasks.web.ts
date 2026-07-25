import { api } from './client';
import type { Task, TaskCreate, TaskList, TaskListCreate, TaskUpdate } from './types';

export function fetchTaskLists() {
  return api.get<TaskList[]>('/api/task-lists');
}

export function createTaskList(payload: TaskListCreate) {
  return api.post<TaskList>('/api/task-lists', payload);
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
