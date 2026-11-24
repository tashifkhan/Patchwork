import { useQueries } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { searchJiraIssues, type JiraIssue } from '@/api/jira';
import { handleJiraError, useJiraAccounts } from '@/stores/jira-session-store';

/** Wait this long after the last keystroke before asking Jira. */
const DEBOUNCE_MS = 350;
/** Jira text search needs a couple of characters to return anything useful. */
const MIN_QUERY = 2;

export interface JiraSearchHit {
  issue: JiraIssue;
  /** The Jira login the issue came from, for opening it with the right account. */
  accountId: string;
  site: string;
}

export interface JiraSearchState {
  hits: JiraSearchHit[];
  isSearching: boolean;
  /** The first failure, when some login could not search. */
  error: unknown;
}

/** Searches every connected Jira login for `query`. Off while `enabled` is false. */
export function useJiraSearch(query: string, enabled = true): JiraSearchState {
  const accounts = useJiraAccounts();
  const [debounced, setDebounced] = useState(query.trim());

  useEffect(() => {
    const next = query.trim();
    const timer = setTimeout(() => setDebounced(next), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const active = enabled && debounced.length >= MIN_QUERY;

  return useQueries({
    queries: accounts.map((account) => ({
      queryKey: ['jira', 'search', account.id, debounced],
      queryFn: () =>
        searchJiraIssues(account, debounced).catch((error: unknown) => {
          handleJiraError(error, account.id);
          throw error;
        }),
      enabled: active,
      staleTime: 60_000,
      retry: false,
    })),
    combine: (results) => ({
      hits: active
        ? results.flatMap((result, index) =>
            (result.data ?? []).map((issue) => ({
              issue,
              accountId: accounts[index].id,
              site: accounts[index].site,
            }))
          )
        : [],
      isSearching: active && results.some((result) => result.isFetching),
      error: results.find((result) => result.error)?.error ?? null,
    }),
  });
}
