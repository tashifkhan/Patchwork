import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createTask,
  createTaskList,
  deleteTask,
  deleteTaskList,
  fetchTaskLists,
  fetchTasks,
  updateTask,
  updateTaskList,
} from '@/api/tasks';
import type { Task, TaskCreate, TaskList, TaskListCreate, TaskUpdate } from '@/api/types';
import { assignUids, type ImportPlan } from '@/lib/backup';
import { queryKeys } from '@/lib/query-client';
import { addToRecycleBin, removeFromRecycleBin, type BinEntry } from '@/lib/recycle-bin';
import { cancelTaskReminder } from '@/lib/notifications';
import { flattenTasks } from '@/lib/task-buckets';

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

export function useUpdateTaskList() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, name }: { listId: string; name: string }) =>
      updateTaskList(listId, { name }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.taskLists });
      client.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

export function useDeleteTaskList() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) => deleteTaskList(listId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.taskLists });
      client.invalidateQueries({ queryKey: queryKeys.tasks });
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
    mutationFn: ({ taskId, patch, accountId }: { taskId: string; patch: TaskUpdate; accountId?: string }) =>
      updateTask(taskId, patch, accountId),
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
  accountId?: string;
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
        await updateTask(
          entry.taskId,
          { sort_order: entry.sort_order, etag: entry.etag },
          entry.accountId
        );
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

export interface DeleteInput {
  taskId: string;
  accountId?: string;
  etag?: string | null;
  /** Moving elsewhere (Deck) rather than deleting: skip the recycle bin. */
  skipBin?: boolean;
}

/** Deletes a to-do and keeps a copy in the recycle bin (see `@/lib/recycle-bin`). */
export function useDeleteTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, accountId, etag, skipBin }: DeleteInput) => {
      const snapshot = findInCache(client.getQueryData<Task[]>(queryKeys.tasks), taskId);
      await deleteTask(taskId, accountId, etag);
      if (snapshot && !skipBin) await addToRecycleBin([snapshot]).catch(() => {});
    },
    onMutate: async ({ taskId }) => {
      await client.cancelQueries({ queryKey: queryKeys.tasks });
      const previous = client.getQueryData<Task[]>(queryKeys.tasks);
      if (previous) {
        client.setQueryData<Task[]>(queryKeys.tasks, removeFromTree(previous, taskId));
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.tasks, context.previous);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

/**
 * The same change applied to many to-dos (multi-select, clear completed).
 * Runs one at a time so CalDAV etags don't race, and reports how many failed
 * instead of stopping at the first.
 */
export function useBulkTaskAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { kind: 'update'; tasks: Task[]; patch: (task: Task) => TaskUpdate }
        | { kind: 'delete'; tasks: Task[] }
    ) => {
      let failed = 0;
      const deleted: Task[] = [];
      for (const task of input.tasks) {
        try {
          if (input.kind === 'update') {
            await updateTask(task.id, { etag: task.etag, ...input.patch(task) }, task.account_id);
          } else {
            await deleteTask(task.id, task.account_id, task.etag);
            deleted.push(task);
            void cancelTaskReminder(task.uid).catch(() => {});
          }
        } catch {
          failed += 1;
        }
      }
      if (deleted.length) await addToRecycleBin(deleted).catch(() => {});
      return { failed, total: input.tasks.length };
    },
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: queryKeys.tasks });
      const previous = client.getQueryData<Task[]>(queryKeys.tasks);
      if (previous) {
        let next = previous;
        for (const task of input.tasks) {
          next = input.kind === 'delete' ? removeFromTree(next, task.id) : mapTree(next, task.id, input.patch(task));
        }
        client.setQueryData<Task[]>(queryKeys.tasks, next);
      }
      return { previous };
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

/** Puts recycle-bin entries back, optionally into a different list. */
export function useRestoreTasks() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ entries, listId }: { entries: BinEntry[]; listId?: string }) => {
      const restored: string[] = [];
      let failed = 0;
      // Parents first, so restored subtasks find them.
      const ordered = [...entries].sort((a, b) => Number(!!a.task.parent_uid) - Number(!!b.task.parent_uid));
      for (const entry of ordered) {
        try {
          await createTask({ ...entry.task, list_id: listId ?? entry.task.list_id });
          restored.push(entry.id);
        } catch {
          failed += 1;
        }
      }
      await removeFromRecycleBin(restored);
      return { restored: restored.length, failed };
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

function findInCache(tasks: Task[] | undefined, id: string) {
  return tasks ? flattenTasks(tasks).find((task) => task.id === id) : undefined;
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

/**
 * Creates everything in an import plan (see `@/lib/backup`). Lists are matched
 * by name, case-insensitively; missing ones are created in `newListAccountId`.
 */
export function useImportTasks() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      plan,
      lists,
      newListAccountId,
      intoListId,
    }: {
      plan: ImportPlan;
      lists: TaskList[];
      newListAccountId?: string;
      /** Put everything into this one list instead of matching by name. */
      intoListId?: string;
    }) => {
      const uids = assignUids(plan);
      let created = 0;
      let failed = 0;
      for (const group of plan.lists) {
        let listId = intoListId;
        if (!listId) {
          const match = lists.find((list) => !list.is_deck && list.name.trim().toLowerCase() === group.name.trim().toLowerCase());
          listId = match?.id ?? (await createTaskList({ name: group.name, account_id: newListAccountId })).id;
        }
        for (const task of group.tasks) {
          try {
            await createTask({
              ...task.payload,
              list_id: listId,
              uid: uids.get(task.key),
              parent_uid: task.parentKey ? (uids.get(task.parentKey) ?? null) : null,
            });
            created += 1;
          } catch {
            failed += 1;
          }
        }
      }
      return { created, failed };
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: queryKeys.taskLists });
      client.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}
