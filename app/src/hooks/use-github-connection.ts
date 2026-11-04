import { useCallback, useEffect, useState } from 'react';

import { asGitHubError } from '@/features/github/errors';
import { validatePat } from '@/lib/github-auth';
import { useGitHubSessionStore } from '@/stores/github-session-store';

/** GitHub connection state plus token connect / disconnect actions. */
export function useGitHubConnection() {
  const connection = useGitHubSessionStore((store) => store.state);
  const initialize = useGitHubSessionStore((store) => store.initialize);
  const connect = useGitHubSessionStore((store) => store.connect);
  const disconnect = useGitHubSessionStore((store) => store.disconnect);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [patPending, setPatPending] = useState(false);

  useEffect(() => {
    if (connection.status === 'initializing') initialize();
  }, [connection.status, initialize]);

  const connectPat = useCallback(
    async (token: string) => {
      setPatPending(true);
      setConnectionError(null);
      try {
        const credentials = await validatePat(token);
        await connect(credentials);
      } catch (error) {
        const githubError = asGitHubError(error);
        setConnectionError(githubError.message);
        throw githubError;
      } finally {
        setPatPending(false);
      }
    },
    [connect]
  );

  return {
    connection,
    connectionError,
    patPending,
    initialize,
    connectPat,
    disconnect,
    clearConnectionError: () => setConnectionError(null),
  };
}
