import { useCallback } from 'react';

import type { TaskList } from '@/api/types';
import { useTaskLists, useTasks } from '@/features/tasks/queries';
import { useCreateTask, useCreateTaskList, useUpdateTask } from '@/features/tasks/mutations';
import { flattenTasks } from '@/features/tasks/task-buckets';

/** The list every raw brain dump lands in. Created on first sort. */
export const BRAIN_DUMP_LIST = 'Brain dump';

const fullDay = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function isBrainDumpList(list: Pick<TaskList, 'name' | 'is_deck'>) {
  return !list.is_deck && list.name.trim().toLowerCase() === BRAIN_DUMP_LIST.toLowerCase();
}

/** `Brain dump · Tue, 24 Nov 2026` for the `YYYY-MM-DD` day key. */
export function rawDumpTitle(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return `${BRAIN_DUMP_LIST} · ${fullDay.format(new Date(y, m - 1, d))}`;
}

/**
 * Saves a day's raw dump, word for word, as one to-do in the "Brain dump"
 * list, creating the list if it isn't there. One to-do per day: sorting
 * again the same day rewrites that to-do instead of adding another.
 *
 * `ownerListId` picks the account for a new list when there are several.
 */
export function useSaveRawDump() {
  const listsQuery = useTaskLists();
  const tasksQuery = useTasks();
  const createList = useCreateTaskList();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  return useCallback(
    async (day: string, text: string, ownerListId: string | null) => {
      // Never decide the list is missing before the lists have loaded.
      const lists = listsQuery.data ?? (await listsQuery.refetch({ throwOnError: true })).data ?? [];
      let list = lists.find(isBrainDumpList);
      if (!list) {
        const owner = lists.find((l) => l.id === ownerListId) ?? lists.find((l) => !l.is_deck);
        list = await createList.mutateAsync({ name: BRAIN_DUMP_LIST, account_id: owner?.account_id });
      }

      const title = rawDumpTitle(day);
      const markdown = text.trim();
      const existing = flattenTasks(tasksQuery.data ?? []).find(
        (task) => task.list_id === list.id && task.title === title
      );
      if (existing) {
        if (existing.markdown.trim() === markdown) return existing;
        await updateTask.mutateAsync({ taskId: existing.id, patch: { markdown }, accountId: existing.account_id });
        return existing;
      }
      return createTask.mutateAsync({ list_id: list.id, title, markdown });
    },
    [listsQuery, tasksQuery.data, createList, createTask, updateTask]
  );
}
