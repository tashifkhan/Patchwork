import { create } from 'zustand';

import { GitHubError, asGitHubError } from '@/features/github/errors';
import type {
  GitHubAccount,
  GitHubConnectionState,
  GitHubCredentialsV2,
  GitHubExpiredAccount,
} from '@/features/github/types';
import {
  clearGitHubCredentials,
  getGitHubAccounts,
  removeGitHubCredentials,
  saveGitHubCredentials,
} from '@/lib/credentials';
import { fetchGitHubUser, isLegacyCredential } from '@/lib/github-auth';
import { queryClient, queryKeys } from '@/lib/query-client';

interface GitHubSessionStore {
  state: GitHubConnectionState;
  initialize: (force?: boolean) => Promise<void>;
  /** Adds an account, or replaces the token of one already connected. */
  connect: (credentials: GitHubCredentialsV2) => Promise<void>;
  /** Removes one account, or every account when none is given. */
  disconnect: (account?: GitHubAccount) => Promise<void>;
  /** A token stopped working. Without an account id, the first account. */
  markExpired: (message: string, accountId?: number) => void;
}

let initialization: Promise<void> | null = null;

const LEGACY_MESSAGE = 'Patchwork now connects with a personal access token. Paste one to reconnect.';

function sameAccount(left: GitHubAccount, right: GitHubAccount) {
  return left.id && right.id ? left.id === right.id : left.login.toLowerCase() === right.login.toLowerCase();
}

function stateFor(accounts: GitHubCredentialsV2[], expired: GitHubExpiredAccount[]): GitHubConnectionState {
  if (accounts.length > 0) return { status: 'connected', credentials: accounts[0], accounts, expired };
  if (expired.length > 0) {
    return { status: 'expired', account: expired[0].account, message: expired[0].message, expired };
  }
  return { status: 'disconnected' };
}

function currentExpired(state: GitHubConnectionState): GitHubExpiredAccount[] {
  return 'expired' in state ? state.expired : [];
}

function invalidateGitHub() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.githubRepos }),
    queryClient.invalidateQueries({ queryKey: queryKeys.githubIssues }),
  ]);
}

export const useGitHubSessionStore = create<GitHubSessionStore>((set, get) => ({
  state: { status: 'initializing' },

  initialize: async (force = false) => {
    if (initialization && !force) return initialization;
    initialization = (async () => {
      set({ state: { status: 'initializing' } });
      try {
        const stored = await getGitHubAccounts();
        if (stored.length === 0) {
          set({ state: { status: 'disconnected' } });
          return;
        }

        const working: GitHubCredentialsV2[] = [];
        const expired: GitHubExpiredAccount[] = [];
        let offline: GitHubError | null = null;
        // Check every token. A network failure keeps the account (offline
        // starts still show cached issues); only a rejected token expires it.
        for (const credentials of stored) {
          if (isLegacyCredential(credentials)) {
            expired.push({ account: credentials.account, message: LEGACY_MESSAGE });
            continue;
          }
          try {
            const account = await fetchGitHubUser(credentials.accessToken);
            const validated: GitHubCredentialsV2 = {
              ...credentials,
              account,
              validatedAt: new Date().toISOString(),
            };
            await saveGitHubCredentials(validated);
            working.push(validated);
          } catch (error) {
            const githubError = asGitHubError(error);
            if (githubError.requiresReconnect) {
              expired.push({ account: credentials.account, message: githubError.message });
            } else {
              offline = githubError;
              working.push(credentials);
            }
          }
        }

        if (offline && working.length > 0 && working.every((account) => stored.includes(account))) {
          // Nothing could be checked at all.
          set({ state: { status: 'error', message: offline.message } });
          return;
        }
        set({ state: stateFor(working, expired) });
      } catch (error) {
        set({ state: { status: 'error', message: asGitHubError(error).message } });
      }
    })().finally(() => {
      initialization = null;
    });
    return initialization;
  },

  connect: async (credentials) => {
    await saveGitHubCredentials(credentials);
    const expired = currentExpired(get().state).filter(
      (entry) => !sameAccount(entry.account, credentials.account)
    );
    // Rebuild from storage, so accounts survive an earlier offline start.
    const stored = await getGitHubAccounts();
    const next = stored.filter(
      (entry) =>
        !isLegacyCredential(entry) && !expired.some((gone) => sameAccount(gone.account, entry.account))
    );
    set({ state: stateFor(next, expired) });
    await invalidateGitHub();
  },

  disconnect: async (account) => {
    if (!account) {
      await clearGitHubCredentials();
      set({ state: { status: 'disconnected' } });
      queryClient.removeQueries({ queryKey: ['github'] });
      return;
    }
    await removeGitHubCredentials({ account });
    const current = get().state;
    const accounts = ('accounts' in current ? current.accounts : []).filter(
      (existing) => !sameAccount(existing.account, account)
    );
    const expired = currentExpired(current).filter((entry) => !sameAccount(entry.account, account));
    set({ state: stateFor(accounts, expired) });
    queryClient.removeQueries({ queryKey: ['github'] });
  },

  markExpired: (message, accountId) => {
    const current = get().state;
    if (current.status === 'connected' || current.status === 'refreshing') {
      const target =
        accountId != null
          ? current.accounts.find((entry) => entry.account.id === accountId)
          : current.credentials;
      // Already marked: a late failure from a request that was in flight.
      if (!target) return;
      set({
        state: stateFor(
          current.accounts.filter((entry) => entry !== target),
          [...current.expired, { account: target.account, message }]
        ),
      });
      return;
    }
    if (current.status === 'expired') return;
    set({ state: { status: 'expired', message, expired: [] } });
  },
}));

export function handleGitHubSessionError(error: unknown) {
  if (error instanceof GitHubError && error.requiresReconnect) {
    useGitHubSessionStore.getState().markExpired(error.message, error.accountId);
  }
}

/** The working account for a repository: its own, else the first one. */
export function githubAccountFor(
  state: GitHubConnectionState,
  accountId: number | undefined
): GitHubCredentialsV2 | undefined {
  if (state.status !== 'connected' && state.status !== 'refreshing') return undefined;
  return (accountId != null && state.accounts.find((entry) => entry.account.id === accountId)) || state.credentials;
}
