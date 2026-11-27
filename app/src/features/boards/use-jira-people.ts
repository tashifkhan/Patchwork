import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { searchJiraAssignableUsers, searchJiraUsers, type JiraUser } from '@/api/jira';
import type { JiraCredentials } from '@/lib/credentials-types';

const DEBOUNCE_MS = 250;

/**
 * Jira people search for a picker sheet, typed into as you go. `assignable`
 * asks Jira who may be assigned in that issue or project; `anyone` searches
 * the whole site (the reporter can be anyone). Only runs while `enabled`,
 * which callers tie to the sheet being open.
 */
export function useJiraPeople(
  credentials: JiraCredentials | null,
  mode: { kind: 'assignable'; issueKey?: string; projectKey?: string } | { kind: 'anyone' },
  enabled: boolean
) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const scope = mode.kind === 'assignable' ? (mode.issueKey ?? mode.projectKey ?? '') : '*';
  const people = useQuery<JiraUser[]>({
    queryKey: ['jira', 'people', credentials?.id, mode.kind, scope, debounced],
    queryFn: ({ signal }) =>
      mode.kind === 'assignable'
        ? searchJiraAssignableUsers(credentials!, mode, debounced, signal)
        : searchJiraUsers(credentials!, debounced, signal),
    enabled: enabled && credentials != null && (mode.kind === 'anyone' || scope !== ''),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  return {
    query,
    setQuery,
    users: people.data ?? [],
    loading: people.isFetching || query.trim() !== debounced,
    error: people.error,
  };
}
