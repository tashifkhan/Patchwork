import { useMemo } from 'react';
import { create } from 'zustand';

import { JiraError, validateJiraCredentials } from '@/api/jira';
import type { JiraCredentials } from '@/lib/credentials-types';
import {
  clearJiraCredentials,
  getJiraAccounts,
  removeJiraCredentials,
  saveJiraCredentials,
} from '@/lib/credentials';
import { queryClient } from '@/lib/query-client';

/**
 * Connected Jira logins. Several can be connected at once (different sites,
 * or different people on one site); every board remembers which login it
 * came from. `expired` holds the logins whose token stopped working, by id.
 */
export type JiraConnectionState =
  | { status: 'initializing' }
  | { status: 'disconnected' }
  | { status: 'connected'; accounts: JiraCredentials[]; expired: Record<string, string> };

interface JiraSessionStore {
  state: JiraConnectionState;
  initialize: () => Promise<void>;
  /** Adds a login, or replaces the token of one already connected. */
  connect: (input: { site: string; email: string; apiToken: string }) => Promise<JiraCredentials>;
  disconnect: (id: string) => Promise<void>;
  disconnectAll: () => Promise<void>;
  markExpired: (id: string, message: string) => void;
}

let initialization: Promise<void> | null = null;

function stateFor(accounts: JiraCredentials[], expired: Record<string, string> = {}): JiraConnectionState {
  return accounts.length > 0 ? { status: 'connected', accounts, expired } : { status: 'disconnected' };
}

function currentExpired(state: JiraConnectionState) {
  return state.status === 'connected' ? state.expired : {};
}

export const useJiraSessionStore = create<JiraSessionStore>((set, get) => ({
  state: { status: 'initializing' },

  initialize: async () => {
    if (initialization) return initialization;
    initialization = (async () => {
      const accounts = await getJiraAccounts().catch(() => []);
      // Boards show straight away from the saved tokens; a 401 from any later
      // request marks that login expired (see `handleJiraError`).
      set({ state: stateFor(accounts) });
    })().finally(() => {
      initialization = null;
    });
    return initialization;
  },

  connect: async (input) => {
    const credentials = await validateJiraCredentials(input);
    await saveJiraCredentials(credentials);
    const accounts = await getJiraAccounts();
    const { [credentials.id]: _fixed, ...expired } = currentExpired(get().state);
    set({ state: stateFor(accounts, expired) });
    await queryClient.invalidateQueries({ queryKey: ['jira'] });
    return credentials;
  },

  disconnect: async (id) => {
    await removeJiraCredentials(id);
    const accounts = await getJiraAccounts();
    const { [id]: _gone, ...expired } = currentExpired(get().state);
    set({ state: stateFor(accounts, expired) });
    queryClient.removeQueries({ queryKey: ['jira'] });
  },

  disconnectAll: async () => {
    await clearJiraCredentials();
    set({ state: { status: 'disconnected' } });
    queryClient.removeQueries({ queryKey: ['jira'] });
  },

  markExpired: (id, message) => {
    const current = get().state;
    if (current.status !== 'connected' || current.expired[id] === message) return;
    set({ state: { ...current, expired: { ...current.expired, [id]: message } } });
  },
}));

/**
 * Call from query/mutation error handlers so a revoked token asks for a new
 * one. Pass the login the request used.
 */
export function handleJiraError(error: unknown, accountId?: string) {
  if (accountId && error instanceof JiraError && error.requiresReconnect) {
    useJiraSessionStore.getState().markExpired(accountId, error.message);
  }
}

/** Connected logins whose tokens still work. */
export function useJiraAccounts(): JiraCredentials[] {
  const state = useJiraSessionStore((store) => store.state);
  return useMemo(
    () => (state.status === 'connected' ? state.accounts.filter((account) => !state.expired[account.id]) : EMPTY),
    [state]
  );
}

/** One working login by id, or null. */
export function useJiraCredentials(id: string | undefined): JiraCredentials | null {
  const accounts = useJiraAccounts();
  return id ? (accounts.find((account) => account.id === id) ?? null) : null;
}

const EMPTY: JiraCredentials[] = [];
