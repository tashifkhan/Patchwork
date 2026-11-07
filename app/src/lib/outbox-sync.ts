import { ApiError } from '@/api/client';
import { createGitHubIssue } from '@/api/github';
import { createJiraIssue, type JiraIssueCreate } from '@/api/jira';
import { createRemoteTask } from '@/api/tasks';
import type { GitHubIssue, GitHubIssueCreate } from '@/api/types';
import type { GitHubRepositorySelection } from '@/features/github/types';
import { checkConnection, isNetworkError, knownOffline } from '@/lib/connectivity';
import { getJiraAccounts, type JiraCredentials } from '@/lib/credentials';
import { enqueue, getEntries, removeEntry, updateEntry, type OutboxEntry } from '@/lib/outbox';
import { queryClient, queryKeys } from '@/lib/query-client';

export interface FlushResult {
  sent: number;
  failed: number;
  /** True when the connection dropped (or never came back) before the queue emptied. */
  offline: boolean;
}

let running: Promise<FlushResult> | null = null;

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
  const entries = (await getEntries()).filter((entry) => retryFailed || entry.lastError == null);
  const result: FlushResult = { sent: 0, failed: 0, offline: false };
  if (entries.length === 0) return result;
  if ((await checkConnection()) === 'offline') return { ...result, offline: true };

  const sentKinds = new Set<OutboxEntry['kind']>();
  for (const entry of [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    try {
      await send(entry);
      await removeEntry(entry.id);
      sentKinds.add(entry.kind);
      result.sent += 1;
    } catch (error) {
      if (isNetworkError(error)) {
        result.offline = true;
        break;
      }
      result.failed += 1;
      await updateEntry(entry.id, (current) => ({
        ...current,
        attempts: current.attempts + 1,
        lastError: error instanceof Error ? error.message : 'Could not be sent.',
      }));
    }
  }

  if (sentKinds.has('task')) {
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
      if (!isNetworkError(error)) throw error;
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
      if (!isNetworkError(error)) throw error;
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
