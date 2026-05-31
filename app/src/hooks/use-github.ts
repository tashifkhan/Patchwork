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
  return useQuery({
    queryKey: queryKeys.githubIssues,
    queryFn: fetchGitHubIssues,
    enabled: connected,
  });
}

export function useGitHubRepos() {
  const connected = useSettingsStore((s) => s.githubConnected);
  return useQuery({
    queryKey: queryKeys.githubRepos,
    queryFn: fetchGitHubRepos,
    enabled: connected,
  });
}

export function useToggleGitHubIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (issue: GitHubIssue) => {
      if (issue.completed) {
        return reopenGitHubIssue(issue.repo, issue.number);
      }
      return closeGitHubIssue(issue.repo, issue.number);
    },
    onMutate: async (issue) => {
      await client.cancelQueries({ queryKey: queryKeys.githubIssues });
      const previous = client.getQueryData<GitHubIssue[]>(queryKeys.githubIssues);
      if (previous) {
        client.setQueryData<GitHubIssue[]>(
          queryKeys.githubIssues,
          previous.map((i) =>
            i.id === issue.id
              ? { ...i, completed: !i.completed, state: i.completed ? 'open' : 'closed' }
              : i
          )
        );
      }
      return { previous };
    },
    onError: (_error, _issue, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.githubIssues, context.previous);
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
