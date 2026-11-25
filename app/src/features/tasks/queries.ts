import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';

import type { Task } from '@/api/types';
import { queryKeys } from '@/lib/query-client';
import { fetchTaskLists, fetchTaskSnapshot, type TaskSnapshot } from './repository';

export const taskQuery = queryOptions({ queryKey: queryKeys.tasks, queryFn: fetchTaskSnapshot });
const taskListsQuery = queryOptions({ queryKey: queryKeys.taskLists, queryFn: fetchTaskLists });

export function useTaskLists() {
  return useQuery(taskListsQuery);
}

export function useTasks() {
  return useQuery({ ...taskQuery, select: (snapshot) => snapshot.tasks });
}

export function useTaskWarnings() {
  return useQuery({ ...taskQuery, select: (snapshot) => snapshot.warnings }).data;
}

export function updateCachedTasks(client: QueryClient, update: (tasks: Task[]) => Task[]) {
  return client.setQueryData<TaskSnapshot>(queryKeys.tasks, (snapshot) =>
    snapshot && { ...snapshot, tasks: update(snapshot.tasks) },
  );
}
