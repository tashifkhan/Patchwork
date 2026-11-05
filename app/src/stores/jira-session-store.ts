import { create } from 'zustand';

import { JiraError, validateJiraCredentials } from '@/api/jira';
import type { JiraCredentials } from '@/lib/credentials-types';
import { clearJiraCredentials, getJiraCredentials, saveJiraCredentials } from '@/lib/credentials';
import { queryClient } from '@/lib/query-client';

export type JiraConnectionState =
  | { status: 'initializing' }
  | { status: 'disconnected' }
  | { status: 'connected'; credentials: JiraCredentials }
  | { status: 'expired'; credentials: JiraCredentials; message: string };

interface JiraSessionStore {
  state: JiraConnectionState;
  initialize: () => Promise<void>;
  connect: (input: { site: string; email: string; apiToken: string }) => Promise<void>;
  disconnect: () => Promise<void>;
  markExpired: (message: string) => void;
}

let initialization: Promise<void> | null = null;

export const useJiraSessionStore = create<JiraSessionStore>((set, get) => ({
  state: { status: 'initializing' },

  initialize: async () => {
    if (initialization) return initialization;
    initialization = (async () => {
      const credentials = await getJiraCredentials().catch(() => null);
      if (!credentials) {
        set({ state: { status: 'disconnected' } });
        return;
      }
      // Show boards straight away from the saved token; a 401 from any later
      // request flips the state to expired (see `handleJiraError`).
      set({ state: { status: 'connected', credentials } });
    })().finally(() => {
      initialization = null;
    });
    return initialization;
  },

  connect: async (input) => {
    const credentials = await validateJiraCredentials(input);
    await saveJiraCredentials(credentials);
    set({ state: { status: 'connected', credentials } });
    await queryClient.invalidateQueries({ queryKey: ['jira'] });
  },

  disconnect: async () => {
    await clearJiraCredentials();
    set({ state: { status: 'disconnected' } });
    queryClient.removeQueries({ queryKey: ['jira'] });
  },

  markExpired: (message) => {
    const current = get().state;
    if (current.status === 'connected') {
      set({ state: { status: 'expired', credentials: current.credentials, message } });
    }
  },
}));

/** Call from query/mutation error handlers so a revoked token asks for a new one. */
export function handleJiraError(error: unknown) {
  if (error instanceof JiraError && error.requiresReconnect) {
    useJiraSessionStore.getState().markExpired(error.message);
  }
}

/** Connected credentials, or null. */
export function useJiraCredentials(): JiraCredentials | null {
  const state = useJiraSessionStore((store) => store.state);
  return state.status === 'connected' ? state.credentials : null;
}
