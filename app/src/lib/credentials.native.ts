import * as SecureStore from 'expo-secure-store';

import type { AiProviderId } from './ai-models';
import type { CalDavAccount, GitHubCredentials } from './credentials-types';

export type {
  CalDavAccount,
  GitHubCredentials,
  NextcloudCredentials,
  ServerType,
} from './credentials-types';

const KEYS = {
  accounts: 'caldav-todo.accounts',
  geminiApiKey: 'caldav-todo.gemini.api-key',
  github: 'caldav-todo.github.credentials',
  // Legacy single-account keys (migrated on first read).
  legacyBaseUrl: 'caldav-todo.nextcloud.base-url',
  legacyUsername: 'caldav-todo.nextcloud.username',
  legacyAppPassword: 'caldav-todo.nextcloud.app-password',
};

function aiKeyName(providerId: AiProviderId) {
  return `caldav-todo.ai.${providerId}.api-key`;
}

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
};

function newId(): string {
  return `acc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

async function readAccounts(): Promise<CalDavAccount[]> {
  const raw = await SecureStore.getItemAsync(KEYS.accounts, OPTIONS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CalDavAccount[]) : [];
  } catch {
    return [];
  }
}

async function writeAccounts(accounts: CalDavAccount[]): Promise<void> {
  await SecureStore.setItemAsync(KEYS.accounts, JSON.stringify(accounts), OPTIONS);
}

/** Migrate the legacy single Nextcloud account into the accounts list, once. */
async function migrateLegacy(): Promise<CalDavAccount[]> {
  const [baseUrl, username, appPassword] = await Promise.all([
    SecureStore.getItemAsync(KEYS.legacyBaseUrl, OPTIONS),
    SecureStore.getItemAsync(KEYS.legacyUsername, OPTIONS),
    SecureStore.getItemAsync(KEYS.legacyAppPassword, OPTIONS),
  ]);
  if (!baseUrl || !username || !appPassword) return [];

  const account: CalDavAccount = {
    id: newId(),
    displayName: username,
    baseUrl: normalizeBaseUrl(baseUrl),
    username,
    appPassword,
    serverType: 'nextcloud',
  };
  await writeAccounts([account]);
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.legacyBaseUrl, OPTIONS),
    SecureStore.deleteItemAsync(KEYS.legacyUsername, OPTIONS),
    SecureStore.deleteItemAsync(KEYS.legacyAppPassword, OPTIONS),
  ]);
  return [account];
}

export async function getAccounts(): Promise<CalDavAccount[]> {
  const accounts = await readAccounts();
  if (accounts.length > 0) return accounts;
  return migrateLegacy();
}

export async function getAccount(id: string): Promise<CalDavAccount | null> {
  const accounts = await getAccounts();
  return accounts.find((account) => account.id === id) ?? null;
}

/**
 * Upsert an account. A blank/absent `id` creates a new one and returns the
 * stored record (with its generated id).
 */
export async function saveAccount(
  input: Omit<CalDavAccount, 'id'> & { id?: string }
): Promise<CalDavAccount> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const username = input.username.trim();
  const appPassword = input.appPassword.trim();
  const displayName = input.displayName.trim() || username;

  if (!baseUrl || !username || !appPassword) {
    throw new Error('Server URL, username, and password are required.');
  }

  const accounts = await getAccounts();
  const account: CalDavAccount = {
    id: input.id || newId(),
    displayName,
    baseUrl,
    username,
    appPassword,
    serverType: input.serverType,
  };

  const index = accounts.findIndex((existing) => existing.id === account.id);
  if (index >= 0) accounts[index] = account;
  else accounts.push(account);

  await writeAccounts(accounts);
  return account;
}

export async function deleteAccount(id: string): Promise<void> {
  const accounts = await getAccounts();
  await writeAccounts(accounts.filter((account) => account.id !== id));
}

export async function getGeminiApiKey(): Promise<string | null> {
  return getAiApiKey('google');
}

export async function saveGeminiApiKey(apiKey: string): Promise<void> {
  await saveAiApiKey('google', apiKey);
}

export async function clearGeminiApiKey(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.geminiApiKey, OPTIONS),
    clearAiApiKey('google'),
  ]);
}

export async function getAiApiKey(providerId: AiProviderId): Promise<string | null> {
  const value = await SecureStore.getItemAsync(aiKeyName(providerId), OPTIONS);
  if (value || providerId !== 'google') return value;
  return SecureStore.getItemAsync(KEYS.geminiApiKey, OPTIONS);
}

export async function saveAiApiKey(providerId: AiProviderId, apiKey: string): Promise<void> {
  const value = apiKey.trim();
  if (!value) throw new Error('API key is required.');
  await SecureStore.setItemAsync(aiKeyName(providerId), value, OPTIONS);
}

export async function clearAiApiKey(providerId: AiProviderId): Promise<void> {
  await SecureStore.deleteItemAsync(aiKeyName(providerId), OPTIONS);
}

// ── GitHub ─────────────────────────────────────────────────────────────

export async function getGitHubCredentials(): Promise<GitHubCredentials | null> {
  const raw = await SecureStore.getItemAsync(KEYS.github, OPTIONS);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GitHubCredentials;
  } catch {
    return null;
  }
}

export async function saveGitHubCredentials(creds: GitHubCredentials): Promise<void> {
  await SecureStore.setItemAsync(KEYS.github, JSON.stringify(creds), OPTIONS);
}

export async function clearGitHubCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.github, OPTIONS);
}
