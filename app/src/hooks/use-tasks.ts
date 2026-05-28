import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createTask, createTaskList, deleteTask, fetchTaskLists, fetchTasks, updateTask } from '@/api/tasks';
import type { Task, TaskCreate, TaskListCreate, TaskUpdate } from '@/api/types';
import { queryKeys } from '@/lib/query-client';

export function useTaskLists() {
  return useQuery({ queryKey: queryKeys.taskLists, queryFn: fetchTaskLists });
}

export function useTasks() {
  return useQuery({ queryKey: queryKeys.tasks, queryFn: fetchTasks });
}

export function useCreateTaskList() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: TaskListCreate) => createTaskList(payload),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.taskLists });
    },
  });
}

export function useCreateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: TaskCreate) => createTask(payload),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

export function useUpdateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: TaskUpdate }) =>
      updateTask(taskId, patch),
    onMutate: async ({ taskId, patch }) => {
      await client.cancelQueries({ queryKey: queryKeys.tasks });
      const previous = client.getQueryData<Task[]>(queryKeys.tasks);
      if (previous) {
        client.setQueryData<Task[]>(queryKeys.tasks, mapTree(previous, taskId, patch));
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.tasks, context.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

export interface ReorderEntry {
  taskId: string;
  sort_order: number;
  etag: string | null;
}

// Persists manual ordering by writing X-APPLE-SORT-ORDER to each moved task.
// Patches run sequentially so a stale etag on one item doesn't race the others.
export function useReorderTasks() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (entries: ReorderEntry[]) => {
      for (const entry of entries) {
        await updateTask(entry.taskId, { sort_order: entry.sort_order, etag: entry.etag });
      }
    },
    onMutate: async (entries) => {
      await client.cancelQueries({ queryKey: queryKeys.tasks });
      const previous = client.getQueryData<Task[]>(queryKeys.tasks);
      if (previous) {
        const orderById = new Map(entries.map((e) => [e.taskId, e.sort_order]));
        const apply = (tasks: Task[]): Task[] =>
          tasks.map((task) => ({
            ...task,
            sort_order: orderById.get(task.id) ?? task.sort_order,
            children: task.children.length ? apply(task.children) : task.children,
          }));
        client.setQueryData<Task[]>(queryKeys.tasks, apply(previous));
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.tasks, context.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

export function useDeleteTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onMutate: async (taskId) => {
      await client.cancelQueries({ queryKey: queryKeys.tasks });
      const previous = client.getQueryData<Task[]>(queryKeys.tasks);
      if (previous) {
        client.setQueryData<Task[]>(queryKeys.tasks, removeFromTree(previous, taskId));
      }
      return { previous };
    },
    onError: (_error, _taskId, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.tasks, context.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

function mapTree(tasks: Task[], id: string, patch: TaskUpdate): Task[] {
  return tasks.map((task) => {
    const next = task.id === id ? { ...task, ...patch } : task;
    return next.children.length ? { ...next, children: mapTree(next.children, id, patch) } : next;
  });
}

function removeFromTree(tasks: Task[], id: string): Task[] {
  return tasks
    .filter((task) => task.id !== id)
    .map((task) =>
      task.children.length ? { ...task, children: removeFromTree(task.children, id) } : task
    );
}
