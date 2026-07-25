import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  closeGitHubIssue,
  fetchGitHubIssues,
  fetchGitHubRepos,
  reopenGitHubIssue,
  updateGitHubIssue,
} from '@/api/github';
import type { GitHubIssue, GitHubIssueUpdate } from '@/api/types';
import { queryKeys } from '@/lib/query-client';
import { useSettingsStore } from '@/stores/settings-store';

export function useGitHubIssues() {
  const connected = useSettingsStore((s) => s.githubConnected);
  const repos = useSettingsStore((s) => s.githubRepos);
  const mode = useSettingsStore((s) => s.githubMode);

  return useQuery({
    queryKey: [...queryKeys.githubIssues, mode, repos] as const,
    queryFn: fetchGitHubIssues,
    enabled: connected && repos.length > 0,
  });
}

export function useGitHubRepos() {
  const connected = useSettingsStore((s) => s.githubConnected);
  const mode = useSettingsStore((s) => s.githubMode);
  const repos = useSettingsStore((s) => s.githubRepos);

  return useQuery({
    queryKey: [...queryKeys.githubRepos, mode, mode === 'public' ? repos : null] as const,
    queryFn: fetchGitHubRepos,
    enabled: connected && (mode === 'private' || repos.length > 0),
  });
}

export function useToggleGitHubIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (issue: GitHubIssue) => {
      if (issue.readOnly) {
        throw new Error('Public GitHub issues are read-only. Connect a private account to close them.');
      }
      if (issue.completed) {
        return reopenGitHubIssue(issue.repo, issue.number);
      }
      return closeGitHubIssue(issue.repo, issue.number);
    },
    onMutate: async (issue) => {
      await client.cancelQueries({ queryKey: queryKeys.githubIssues });
      const previousEntries = client.getQueriesData<GitHubIssue[]>({
        queryKey: queryKeys.githubIssues,
      });
      client.setQueriesData<GitHubIssue[]>({ queryKey: queryKeys.githubIssues }, (previous) =>
        previous?.map((i) =>
          i.id === issue.id
            ? { ...i, completed: !i.completed, state: i.completed ? 'open' : 'closed' }
            : i
        )
      );
      return { previousEntries };
    },
    onError: (_error, _issue, context) => {
      if (context?.previousEntries) {
        for (const [key, data] of context.previousEntries) {
          client.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
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
    }: {
      repo: string;
      issueNumber: number;
      patch: GitHubIssueUpdate;
    }) => updateGitHubIssue(repo, issueNumber, patch),
    onSettled: () => {
      client.invalidateQueries({ queryKey: queryKeys.githubIssues });
    },
  });
}
