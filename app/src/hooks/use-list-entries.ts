import { useMemo } from 'react';

import { useGitHubIssues } from '@/hooks/use-github';
import { useTaskLists, useTasks } from '@/hooks/use-tasks';
import { type ListSummary, summarizeLists } from '@/lib/smart-lists';
import { flattenTasks } from '@/lib/task-buckets';
import { useGitHubSessionStore } from '@/stores/github-session-store';
import { useSettingsStore } from '@/stores/settings-store';

export interface RepoEntry {
  /** `gh:<owner/repo>`, the id Tasks uses for a repo filter. */
  id: string;
  name: string;
  owner: string;
  open: number;
}

/**
 * Everything My lists shows: totals for All tasks, each list with its open
 * and done counts, and followed GitHub repos with their open issues.
 */
export function useListEntries() {
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const githubQuery = useGitHubIssues();
  const githubConnected = useGitHubSessionStore((s) => s.state.status === 'connected');
  const repos = useSettingsStore((s) => s.githubRepositories);

  const summaries: ListSummary[] = useMemo(
    () => summarizeLists(listsQuery.data ?? [], tasksQuery.data ?? []),
    [listsQuery.data, tasksQuery.data]
  );

  const all = useMemo(() => {
    const tasks = flattenTasks(tasksQuery.data ?? []);
    const done = tasks.filter((task) => task.completed).length;
    return { open: tasks.length - done, done };
  }, [tasksQuery.data]);

  const repoEntries: RepoEntry[] = useMemo(() => {
    if (!githubConnected) return [];
    const counts: Record<string, number> = {};
    for (const issue of githubQuery.data?.issues ?? []) {
      if (issue.completed) continue;
      const key = issue.repo.toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return repos.map((repo) => {
      const [owner, name] = repo.fullName.split('/');
      return {
        id: `gh:${repo.fullName}`,
        name: name ?? repo.fullName,
        owner: owner ?? '',
        open: counts[repo.fullName.toLowerCase()] ?? 0,
      };
    });
  }, [githubConnected, githubQuery.data?.issues, repos]);

  return { summaries, all, repos: repoEntries, loading: listsQuery.isLoading };
}
