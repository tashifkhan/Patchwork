import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { addTaskAttachment, getAttachmentAccess, removeTaskAttachment } from '@/api/tasks';
import type { AttachmentUpload, Task, TaskAttachment } from '@/api/types';
import { queryKeys } from '@/lib/query-client';

/**
 * Where to load a Nextcloud account's attachment images from, plus the auth
 * headers expo-image needs. Null for accounts that are not Nextcloud.
 */
export function useAttachmentAccess(accountId: string | undefined) {
  return useQuery({
    queryKey: ['attachment-access', accountId ?? null],
    queryFn: () => getAttachmentAccess(accountId),
    enabled: Boolean(accountId),
    staleTime: Infinity,
    retry: 1,
  });
}

export function useAddAttachment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { taskId: string; file: AttachmentUpload; accountId?: string; etag?: string | null }) =>
      addTaskAttachment(vars.taskId, vars.file, vars.accountId, vars.etag),
    onSuccess: (updated, vars) => showNow(client, vars.taskId, updated),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.tasks }),
  });
}

export function useRemoveAttachment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      taskId: string;
      attachment: TaskAttachment;
      accountId?: string;
      etag?: string | null;
    }) => removeTaskAttachment(vars.taskId, vars.attachment, vars.accountId, vars.etag),
    onSuccess: (updated, vars) => showNow(client, vars.taskId, updated),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.tasks }),
  });
}

/** Put the server's answer in the cache so the row updates before the refetch lands. */
function showNow(client: ReturnType<typeof useQueryClient>, taskId: string, updated: Task) {
  const previous = client.getQueryData<Task[]>(queryKeys.tasks);
  if (!previous) return;
  const replace = (tasks: Task[]): Task[] =>
    tasks.map((task) =>
      task.id === taskId
        ? { ...updated, children: task.children }
        : task.children.length
          ? { ...task, children: replace(task.children) }
          : task,
    );
  client.setQueryData<Task[]>(queryKeys.tasks, replace(previous));
}
