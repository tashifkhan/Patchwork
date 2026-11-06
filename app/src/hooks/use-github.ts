import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  closeGitHubIssue,
  createGitHubIssue,
  fetchGitHubIssues,
  fetchGitHubRepos,
  fetchSingleGitHubIssue,
  reopenGitHubIssue,
  updateGitHubIssue,
  validatePublicGitHubRepo,
} from '@/api/github';
import type {
  GitHubIssue,
  GitHubIssueCreate,
  GitHubIssueUpdate,
  GitHubRepo,
} from '@/api/types';
import { GitHubError } from '@/features/github/errors';
import type { GitHubIssuesResult, GitHubRepositorySelection } from '@/features/github/types';
import { queryKeys } from '@/lib/query-client';
import {
  handleGitHubSessionError,
  useGitHubSessionStore,
} from '@/stores/github-session-store';
import { useSettingsStore } from '@/stores/settings-store';

function useGitHubInputs() {
  const repositories = useSettingsStore((state) => state.githubRepositories);
  const scope = useSettingsStore((state) => state.githubIssueScope);
  const issueState = useSettingsStore((state) => state.githubIssueState);
  const connection = useGitHubSessionStore((state) => state.state);
  const authenticated = connection.status === 'connected';
  // Every working account is part of the cache key, so adding or removing one refetches.
  const accountId = authenticated
    ? connection.accounts.map((account) => account.account.id).join(',')
    : 'anonymous';
  const viewerLogin = authenticated
    ? connection.credentials.account.login
    : undefined;
  return {
    repositories,
    scope,
    issueState,
    connection,
    authenticated,
    accountId,
    viewerLogin,
  };
}

export function useGitHubIssues() {
  const {
    repositories,
    scope,
    issueState,
    connection,
    authenticated,
    accountId,
    viewerLogin,
  } = useGitHubInputs();
  return useQuery({
    queryKey: [
      ...queryKeys.githubIssues,
      accountId,
      scope,
      issueState,
      repositories.map(repositoryKey),
    ] as const,
    queryFn: ({ signal }) =>
      fetchGitHubIssues({
        repositories,
        scope,
        state: issueState,
        authenticated,
        viewerLogin,
        signal,
      }),
    enabled:
      repositories.length > 0 &&
      connection.status !== 'initializing' &&
      connection.status !== 'refreshing' &&
      connection.status !== 'expired',
    retry: githubRetry,
    meta: { feature: 'github' },
  });
}

export function useGitHubRepos() {
  const { repositories, connection, authenticated, accountId } = useGitHubInputs();
  return useQuery({
    queryKey: [
      ...queryKeys.githubRepos,
      accountId,
      authenticated ? 'account' : repositories.map(repositoryKey),
    ] as const,
    queryFn: ({ signal }) =>
      fetchGitHubRepos({ repositories, authenticated, signal }),
    enabled:
      connection.status !== 'initializing' &&
      connection.status !== 'refreshing' &&
      (authenticated || repositories.length > 0),
    retry: githubRetry,
    meta: { feature: 'github' },
  });
}

export function useGitHubIssue(repo?: string, issueNumber?: number) {
  const repositories = useSettingsStore((state) => state.githubRepositories);
  const connection = useGitHubSessionStore((state) => state.state);
  const authenticated = connection.status === 'connected';
  const selection = repositories.find(
    (candidate) => candidate.fullName.toLowerCase() === repo?.toLowerCase()
  );
  const canWrite = authenticated ? selection?.canWriteIssues : false;

  return useQuery({
    queryKey:
      repo && issueNumber != null
        ? [...queryKeys.githubIssue(repo, issueNumber), authenticated]
        : ['github', 'issue', 'missing'],
    queryFn: ({ signal }) =>
      fetchSingleGitHubIssue(repo!, issueNumber!, {
        authenticated,
        canWrite,
        accountId: selection?.accountId,
        signal,
      }),
    enabled:
      !!repo &&
      issueNumber != null &&
      Number.isFinite(issueNumber) &&
      connection.status !== 'initializing' &&
      connection.status !== 'refreshing' &&
      connection.status !== 'expired',
    retry: githubRetry,
  });
}

export function useValidatePublicGitHubRepo() {
  return useMutation({
    mutationFn: ({ fullName, signal }: { fullName: string; signal?: AbortSignal }) =>
      validatePublicGitHubRepo(fullName, signal),
  });
}

export function useToggleGitHubIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['github', 'issue', 'toggle'],
    mutationFn: async (issue: GitHubIssue) => {
      if (!issue.canWrite) {
        throw new GitHubError(
          'permission_denied',
          'This connection cannot update issues in that repository.'
        );
      }
      return issue.completed
        ? reopenGitHubIssue(issue.repo, issue.number, issue.accountId)
        : closeGitHubIssue(issue.repo, issue.number, issue.accountId);
    },
    onMutate: async (issue) => {
      await client.cancelQueries({ queryKey: ['github'] });
      const previousIssueLists = client.getQueriesData<GitHubIssuesResult>({
        queryKey: queryKeys.githubIssues,
      });
      const previousDetails = client.getQueriesData<GitHubIssue>({
        queryKey: ['github', 'issue'],
      });
      const optimistic = toggleIssueState(issue);

      previousIssueLists.forEach(([key, previous]) => {
        if (!previous) return;
        const stateFilter = key[4];
        client.setQueryData<GitHubIssuesResult>(key, {
          ...previous,
          issues: previous.issues
            .map((candidate) => (sameIssue(candidate, issue) ? optimistic : candidate))
            .filter((candidate) => {
              if (stateFilter === 'open') return candidate.state === 'open';
              if (stateFilter === 'closed') return candidate.state === 'closed';
              return true;
            }),
        });
      });
      client.setQueriesData<GitHubIssue>(
        { queryKey: ['github', 'issue'] },
        (previous) => (previous && sameIssue(previous, issue) ? optimistic : previous)
      );
      return { previousIssueLists, previousDetails };
    },
    onError: (error, _issue, context) => {
      handleGitHubSessionError(error);
      context?.previousIssueLists.forEach(([key, data]) => client.setQueryData(key, data));
      context?.previousDetails.forEach(([key, data]) => client.setQueryData(key, data));
    },
    onSuccess: (updated) => {
      updateIssueCaches(client, updated);
    },
    onSettled: (_data, _error, issue) => {
      client.invalidateQueries({ queryKey: queryKeys.githubIssues });
      client.invalidateQueries({ queryKey: queryKeys.githubIssue(issue.repo, issue.number) });
    },
  });
}

export function useCreateGitHubIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['github', 'issue', 'create'],
    mutationFn: ({
      repository,
      issue,
    }: {
      repository: GitHubRepositorySelection;
      issue: GitHubIssueCreate;
    }) => createGitHubIssue(repository, issue),
    onError: handleGitHubSessionError,
    onSuccess: (created) => {
      client.setQueryData(
        [...queryKeys.githubIssue(created.repo, created.number), true],
        created
      );
      client.invalidateQueries({ queryKey: queryKeys.githubIssues });
    },
  });
}

export function useUpdateGitHubIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      repo,
      issueNumber,
      patch,
      accountId,
    }: {
      repo: string;
      issueNumber: number;
      patch: GitHubIssueUpdate;
      /** The account that loaded the issue (`GitHubIssue.accountId`). */
      accountId?: number;
    }) => updateGitHubIssue(repo, issueNumber, patch, { accountId }),
    onError: handleGitHubSessionError,
    onSuccess: (updated) => updateIssueCaches(client, updated),
    onSettled: (_data, _error, variables) => {
      client.invalidateQueries({ queryKey: queryKeys.githubIssues });
      client.invalidateQueries({
        queryKey: queryKeys.githubIssue(variables.repo, variables.issueNumber),
      });
    },
  });
}

function repositoryKey(repository: GitHubRepositorySelection) {
  return `${repository.id ?? 'legacy'}:${repository.fullName}:${repository.canWriteIssues ?? false}:${repository.accountId ?? ''}`;
}

function githubRetry(failureCount: number, error: unknown) {
  if (error instanceof GitHubError) {
    handleGitHubSessionError(error);
    if (
      error.status !== undefined &&
      error.status < 500 &&
      error.code !== 'rate_limited'
    ) {
      return false;
    }
    if (error.code === 'rate_limited') return false;
  }
  return failureCount < 2;
}

function sameIssue(left: GitHubIssue, right: GitHubIssue) {
  return left.repo === right.repo && left.number === right.number;
}

function toggleIssueState(issue: GitHubIssue): GitHubIssue {
  const completed = !issue.completed;
  return { ...issue, completed, state: completed ? 'closed' : 'open' };
}

function updateIssueCaches(
  client: ReturnType<typeof useQueryClient>,
  updated: GitHubIssue
) {
  client.setQueriesData<GitHubIssuesResult>(
    { queryKey: queryKeys.githubIssues },
    (previous) =>
      previous
        ? {
            ...previous,
            issues: previous.issues.map((candidate) =>
              sameIssue(candidate, updated) ? updated : candidate
            ),
          }
        : previous
  );
  client.setQueriesData<GitHubIssue>(
    { queryKey: ['github', 'issue'] },
    (previous) => (previous && sameIssue(previous, updated) ? updated : previous)
  );
}

export function selectionFromRepo(repo: GitHubRepo): GitHubRepositorySelection {
  return {
    id: repo.id,
    fullName: repo.full_name,
    visibility: repo.visibility,
    canWriteIssues: repo.canWriteIssues,
    ...(repo.accountId != null ? { accountId: repo.accountId } : {}),
  };
}
