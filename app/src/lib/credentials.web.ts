// Web stub. On web the app talks to the proxy (see api/*.ts), which holds the
// CalDAV and AI credentials server-side, so there is nothing to store in the
// browser. These exist to mirror `credentials.native.ts` export for export:
// Metro picks this file on web, and any symbol missing here is `undefined` at
// runtime on web while still type-checking against the native module.

import type { CalDavAccount } from './credentials-types';
import type { AiProviderId } from './ai-models';

export type { CalDavAccount, NextcloudCredentials, ServerType } from './credentials-types';
export type { GitHubCredentials, JiraAccount, JiraCredentials } from './credentials-types';

export async function getAccounts(): Promise<CalDavAccount[]> {
  return [];
}

export async function getAccount(_id: string): Promise<CalDavAccount | null> {
  return null;
}

export async function saveAccount(
  input: Omit<CalDavAccount, 'id'> & { id?: string }
): Promise<CalDavAccount> {
  return { id: input.id ?? 'web', ...input } as CalDavAccount;
}

export async function deleteAccount(_id: string): Promise<void> {}

export async function getGeminiApiKey(): Promise<string | null> {
  return null;
}

export async function saveGeminiApiKey(_apiKey: string): Promise<void> {}

export async function clearGeminiApiKey(): Promise<void> {}

export async function getAiApiKey(_providerId: AiProviderId): Promise<string | null> {
  return null;
}

export async function saveAiApiKey(_providerId: AiProviderId, _apiKey: string): Promise<void> {}

export async function clearAiApiKey(_providerId: AiProviderId): Promise<void> {}

export async function getGitHubCredentials(): Promise<import('./credentials-types').GitHubCredentials | null> {
  return null;
}

export async function saveGitHubCredentials(_creds: import('./credentials-types').GitHubCredentials): Promise<void> {}

export async function clearGitHubCredentials(): Promise<void> {}

// Jira Cloud blocks browser (CORS) requests, so Jira is mobile-only.
export async function getJiraCredentials(): Promise<import('./credentials-types').JiraCredentials | null> {
  return null;
}

export async function saveJiraCredentials(_creds: import('./credentials-types').JiraCredentials): Promise<void> {
  throw new Error('Jira is available in the iOS and Android apps.');
}

export async function clearJiraCredentials(): Promise<void> {}
