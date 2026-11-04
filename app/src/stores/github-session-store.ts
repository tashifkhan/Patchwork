import { create } from 'zustand';

import { GitHubError, asGitHubError } from '@/features/github/errors';
import type {
  GitHubConnectionState,
  GitHubCredentialsV2,
} from '@/features/github/types';
import {
  clearGitHubCredentials,
  getGitHubCredentials,
  saveGitHubCredentials,
} from '@/lib/credentials';
import { fetchGitHubUser, isLegacyCredential } from '@/lib/github-auth';
import { queryClient, queryKeys } from '@/lib/query-client';

interface GitHubSessionStore {
  state: GitHubConnectionState;
  initialize: (force?: boolean) => Promise<void>;
  connect: (credentials: GitHubCredentialsV2) => Promise<void>;
  disconnect: () => Promise<void>;
  markExpired: (message: string) => void;
}

let initialization: Promise<void> | null = null;

export const useGitHubSessionStore = create<GitHubSessionStore>((set, get) => ({
  state: { status: 'initializing' },

  initialize: async (force = false) => {
    if (initialization && !force) return initialization;
    initialization = (async () => {
      set({ state: { status: 'initializing' } });
      try {
        const credentials = await getGitHubCredentials();
        if (!credentials) {
          set({ state: { status: 'disconnected' } });
          return;
        }

        // GitHub App sign-ins from older builds can't be refreshed any more.
        if (isLegacyCredential(credentials)) {
          set({
            state: {
              status: 'expired',
              account: credentials.account,
              message: 'Patchwork now connects with a personal access token. Paste one to reconnect.',
            },
          });
          return;
        }

        const account = await fetchGitHubUser(credentials.accessToken);
        const validated: GitHubCredentialsV2 = {
          ...credentials,
          account,
          validatedAt: new Date().toISOString(),
        };
        await saveGitHubCredentials(validated);
        set({ state: { status: 'connected', credentials: validated } });
      } catch (error) {
        const githubError = asGitHubError(error);
        if (githubError.requiresReconnect) {
          const previous = get().state;
          const account =
            previous.status === 'connected' || previous.status === 'refreshing'
              ? previous.credentials.account
              : undefined;
          set({
            state: {
              status: 'expired',
              account,
              message: githubError.message,
            },
          });
        } else {
          set({ state: { status: 'error', message: githubError.message } });
        }
      }
    })().finally(() => {
      initialization = null;
    });
    return initialization;
  },

  connect: async (credentials) => {
    await saveGitHubCredentials(credentials);
    set({ state: { status: 'connected', credentials } });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.githubRepos }),
      queryClient.invalidateQueries({ queryKey: queryKeys.githubIssues }),
    ]);
  },

  disconnect: async () => {
    await clearGitHubCredentials();
    set({ state: { status: 'disconnected' } });
    queryClient.removeQueries({ queryKey: ['github'] });
  },

  markExpired: (message) => {
    const current = get().state;
    const account =
      current.status === 'connected' || current.status === 'refreshing'
        ? current.credentials.account
        : current.status === 'expired'
          ? current.account
          : undefined;
    set({ state: { status: 'expired', account, message } });
  },
}));

export function handleGitHubSessionError(error: unknown) {
  if (error instanceof GitHubError && error.requiresReconnect) {
    useGitHubSessionStore.getState().markExpired(error.message);
  }
}
