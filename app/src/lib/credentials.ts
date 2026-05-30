// Default/web stub. On web the app talks to the proxy (see api/*.ts), so there
// are no on-device CalDAV accounts; these keep the import surface consistent.

import type { CalDavAccount } from './credentials-types';
import type { AiProviderId } from './ai-models';

export type { CalDavAccount, NextcloudCredentials, ServerType } from './credentials-types';

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
