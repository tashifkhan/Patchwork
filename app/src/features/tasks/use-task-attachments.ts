import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useShallow } from 'zustand/react/shallow';

import {
  addTaskAttachment,
  discardQueued,
  downloadTaskAttachment,
  getAttachmentAccess,
  removeTaskAttachment,
} from '@/features/tasks/repository';
import type { AttachmentTarget, AttachmentUpload, TaskAttachment } from '@/api/types';
import { useOutboxStore, type OutboxAttachmentEntry } from '@/features/sync/outbox';
import { queryKeys } from '@/lib/query-client';
import { replaceTask } from './mutations';
import { updateCachedTasks } from './queries';

/**
 * Where to load a Nextcloud account's attachment images from, plus the auth
 * headers expo-image needs. Null for accounts that are not Nextcloud.
 */
export function useAttachmentAccess(accountId: string | undefined) {
  return useQuery({
    queryKey: ['attachment-access', accountId ?? null],
    networkMode: 'always',
    queryFn: () => getAttachmentAccess(accountId),
    enabled: Boolean(accountId),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useAddAttachment() {
  const client = useQueryClient();
  return useMutation({
    networkMode: 'always',
    mutationFn: (vars: { taskId: string; target: AttachmentTarget; file: AttachmentUpload; etag?: string | null }) =>
      addTaskAttachment(vars.taskId, vars.target, vars.file, vars.etag),
    // Null means it was queued; the outbox store shows it until it uploads.
    onSuccess: (updated, vars) => {
      if (updated) updateCachedTasks(client, (tasks) => replaceTask(tasks, vars.taskId, vars.target.account_id, updated));
    },
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
    onSuccess: (updated, vars) => {
      updateCachedTasks(client, (tasks) => replaceTask(tasks, vars.taskId, vars.accountId, updated));
    },
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.tasks }),
  });
}

/** Files picked offline for this to-do, still waiting in the outbox. */
export function useQueuedAttachments(taskUid: string, accountId?: string): OutboxAttachmentEntry[] {
  return useOutboxStore(
    useShallow((state) =>
      state.entries.filter(
        (entry): entry is OutboxAttachmentEntry => entry.kind === 'attachment' && entry.taskUid === taskUid && entry.accountId === accountId,
      ),
    ),
  );
}

export function useDiscardQueuedAttachment() {
  return useMutation({ networkMode: 'always', mutationFn: (entryId: string) => discardQueued(entryId) });
}

/** Downloads a Files attachment and returns its local URI, for the share sheet. */
export function useDownloadAttachment() {
  return useMutation({
    mutationFn: (vars: { accountId: string; attachment: TaskAttachment }) =>
      downloadTaskAttachment(vars.accountId, vars.attachment),
  });
}
