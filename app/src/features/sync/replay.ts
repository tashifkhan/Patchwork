import { ApiError } from '@/api/error';
import { createGitHubIssue } from '@/api/github';
import { createJiraIssue, type JiraIssueCreate } from '@/api/jira';
import { createRemoteTask, dropOutboxFile, sendQueuedAttachment } from '@/features/tasks/repository';
import type { GitHubIssue, GitHubIssueCreate } from '@/api/types';
import type { GitHubRepositorySelection } from '@/features/github/types';
import { isNetworkError, knownOffline } from '@/features/sync/connectivity';
import { getJiraAccounts, type JiraCredentials } from '@/lib/credentials';
import { enqueue, getEntries, pendingEntryId, isPendingTaskId, withOutboxEntry, type OutboxEntry } from '@/features/sync/outbox';
import { queryClient, queryKeys } from '@/lib/query-client';

export interface FlushResult {
  sent: number;
  failed: number;
  /** True when the connection dropped (or never came back) before the queue emptied. */
  offline: boolean;
}

let running: Promise<FlushResult> | null = null;
const uncertainIssue = 'The server may have created this issue. Check the project before discarding this entry or creating another issue.';

/**
 * Send everything in the outbox, oldest first, so a parent to-do lands before
 * its checklist items. Stops at the first connection failure and leaves the
 * rest for the next try. A server-side failure is recorded on the entry and
 * the queue moves on, so one bad item can't block the others.
 * Pass `retryFailed` to try those recorded failures again.
 */
export function flushOutbox({ retryFailed = false }: { retryFailed?: boolean } = {}): Promise<FlushResult> {
  running ??= run(retryFailed).finally(() => {
    running = null;
  });
  return running;
}

async function run(retryFailed: boolean): Promise<FlushResult> {
  // Something the server refused fails the same way every 30 seconds, so
  // background runs leave it alone; "Sync now" retries it.
  const entries = await getEntries();
  const result: FlushResult = { sent: 0, failed: 0, offline: false };
  if (entries.length === 0) return result;
  const sentKinds = new Set<OutboxEntry['kind']>();
  for (const { id } of [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const offline = await withOutboxEntry(id, async (entry, locked) => {
      if (entry.delivery === 'uncertain' || (!retryFailed && entry.lastError)) return false;
      if (entry.delivery === 'sending') {
        await locked.update((item) => ({ ...item, delivery: 'uncertain', lastError: uncertainIssue }));
        result.failed += 1;
        return false;
      }
      if ((await getEntries()).some((other) => blocks(other, entry))) return false;
      const issue = entry.kind === 'github-issue' || entry.kind === 'jira-issue';
      if (issue) await locked.update((item) => ({ ...item, delivery: 'sending' }));
      try {
        await send(entry);
      } catch (error) {
        if (!issue && isNetworkError(error)) return true;
        const uncertain = issue && ambiguousIssueFailure(error);
        result.failed += 1;
        await locked.update((item) => ({
          ...item,
          attempts: item.attempts + 1,
          delivery: uncertain ? 'uncertain' : undefined,
          lastError: uncertain
            ? uncertainIssue
            : error instanceof Error ? error.message : 'Could not be sent.',
        }));
        return false;
      }
      await locked.remove();
      if (entry.kind === 'attachment') await dropOutboxFile(entry.file.uri);
      sentKinds.add(entry.kind);
      result.sent += 1;
      return false;
    });
    if (offline) {
      result.offline = true;
      break;
    }
  }

  if (sentKinds.has('task') || sentKinds.has('attachment')) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
  }
  if (sentKinds.has('github-issue')) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.githubIssues });
  }
  if (sentKinds.has('jira-issue')) {
    void queryClient.invalidateQueries({ queryKey: ['jira', 'board'] });
  }
  return result;
}

function blocks(other: OutboxEntry, entry: OutboxEntry) {
  if (entry.kind === 'attachment') {
    return isPendingTaskId(entry.taskId) && other.id === pendingEntryId(entry.taskId);
  }
  return entry.kind === 'task' && other.kind === 'task' && other.id !== entry.id &&
    other.payload.list_id === entry.payload.list_id && other.payload.uid === entry.payload.parent_uid;
}

function ambiguousIssueFailure(error: unknown) {
  const status = error instanceof Error && 'status' in error ? error.status : undefined;
  return isNetworkError(error) || (typeof status === 'number' && (status === 408 || status >= 500));
}

/**
 * Create a GitHub issue, or keep it for later when the connection is the
 * problem. Resolves to null when it was queued.
 */
export async function createGitHubIssueOrQueue(
  repository: GitHubRepositorySelection,
  issue: GitHubIssueCreate
): Promise<GitHubIssue | null> {
  if (!knownOffline()) {
    try {
      return await createGitHubIssue(repository, issue);
    } catch (error) {
      if (!ambiguousIssueFailure(error)) throw error;
      await enqueue({ kind: 'github-issue', repository, issue }, uncertainIssue);
      return null;
    }
  }
  await enqueue({ kind: 'github-issue', repository, issue });
  return null;
}

/** Same as above for Jira. Resolves to null when it was queued. */
export async function createJiraIssueOrQueue(
  credentials: JiraCredentials,
  input: JiraIssueCreate
): Promise<{ id: string; key: string } | null> {
  if (!knownOffline()) {
    try {
      return await createJiraIssue(credentials, input);
    } catch (error) {
      if (!ambiguousIssueFailure(error)) throw error;
      await enqueue({ kind: 'jira-issue', accountId: credentials.id, input }, uncertainIssue);
      return null;
    }
  }
  await enqueue({ kind: 'jira-issue', accountId: credentials.id, input });
  return null;
}

async function send(entry: OutboxEntry) {
  switch (entry.kind) {
    case 'task':
      try {
        await createRemoteTask(entry.payload);
      } catch (error) {
        // The uid is fixed, so 412 on `If-None-Match: *` means an earlier
        // attempt reached the server and only the reply was lost.
        if (error instanceof ApiError && error.status === 412) return;
        throw error;
      }
      return;
    case 'attachment':
      await sendQueuedAttachment(entry);
      return;
    case 'github-issue':
      await createGitHubIssue(entry.repository, entry.issue);
      return;
    case 'jira-issue': {
      const credentials = (await getJiraAccounts()).find((account) => account.id === entry.accountId);
      if (!credentials) throw new Error('The Jira account for this issue is no longer connected.');
      await createJiraIssue(credentials, entry.input);
      return;
    }
  }
}
