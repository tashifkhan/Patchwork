import * as SecureStore from 'expo-secure-store';

import { githubAccountKey, jiraAccountKey } from './account-keys';
import { aiCredentialId, type AiProviderId } from './ai-models';
import type { CalDavAccount, GitHubCredentials, JiraCredentials } from './credentials-types';
import { assertSafeAccountUrl, normalizeServiceUrl } from './secure-url';

export type {
  CalDavAccount,
  GitHubCredentials,
  JiraAccount,
  JiraCredentials,
  NextcloudCredentials,
  ServerType,
} from './credentials-types';
export { githubAccountKey, jiraAccountKey } from './account-keys';

const KEYS = {
  accounts: 'patchwork.accounts',
  geminiApiKey: 'patchwork.gemini.api-key',
  github: 'patchwork.github.credentials.v2',
  legacyGithub: 'patchwork.github.credentials',
  jira: 'patchwork.jira.credentials.v1',
  githubIndex: 'patchwork.github.accounts.v1',
  githubAccount: 'patchwork.github.account.v1',
  jiraIndex: 'patchwork.jira.accounts.v1',
  jiraAccount: 'patchwork.jira.account.v1',
  // Legacy single-account keys (migrated on first read).
  legacyBaseUrl: 'patchwork.nextcloud.base-url',
  legacyUsername: 'patchwork.nextcloud.username',
  legacyAppPassword: 'patchwork.nextcloud.app-password',
};

// Aliased so providers sharing one upstream credential (OpenCode Zen / Go)
// read and write the same keychain entry.
function aiKeyName(providerId: AiProviderId) {
  return `patchwork.ai.${aiCredentialId(providerId)}.api-key`;
}

// Keep secrets on this device only — do not include in iCloud/Android backup sync of keychain items.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function newId(): string {
  return `acc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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

  let safeBaseUrl: string;
  try {
    safeBaseUrl = assertSafeAccountUrl(baseUrl);
  } catch {
    // Drop unsafe legacy entries rather than blocking app start.
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.legacyBaseUrl, OPTIONS),
      SecureStore.deleteItemAsync(KEYS.legacyUsername, OPTIONS),
      SecureStore.deleteItemAsync(KEYS.legacyAppPassword, OPTIONS),
    ]);
    return [];
  }

  const account: CalDavAccount = {
    id: newId(),
    displayName: username,
    baseUrl: safeBaseUrl,
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
  const baseUrl = assertSafeAccountUrl(input.baseUrl);
  const username = input.username.trim();
  const appPassword = input.appPassword.trim();
  const displayName = input.displayName.trim() || username || normalizeServiceUrl(baseUrl);

  if (!username || !appPassword) {
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

// ── Multi-account storage ──────────────────────────────────────────────
//
// Each account sits under its own keychain key, with a small index of ids
// beside it. One key per account keeps every value well under the size
// SecureStore handles reliably, however many accounts are connected.

async function readIndex(key: string): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(key, OPTIONS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function readList<T>(
  indexKey: string,
  itemKey: (id: string) => string,
  valid: (value: unknown) => value is T
): Promise<T[]> {
  const ids = await readIndex(indexKey);
  const items = await Promise.all(
    ids.map(async (id): Promise<T | null> => {
      const raw = await SecureStore.getItemAsync(itemKey(id), OPTIONS);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return valid(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
  );
  return items.filter((item): item is T => item != null);
}

async function upsertItem(indexKey: string, itemKey: (id: string) => string, id: string, value: unknown) {
  await SecureStore.setItemAsync(itemKey(id), JSON.stringify(value), OPTIONS);
  const ids = await readIndex(indexKey);
  if (!ids.includes(id)) await SecureStore.setItemAsync(indexKey, JSON.stringify([...ids, id]), OPTIONS);
}

async function removeItem(indexKey: string, itemKey: (id: string) => string, id: string) {
  await SecureStore.deleteItemAsync(itemKey(id), OPTIONS);
  const ids = await readIndex(indexKey);
  await SecureStore.setItemAsync(indexKey, JSON.stringify(ids.filter((candidate) => candidate !== id)), OPTIONS);
}

async function clearList(indexKey: string, itemKey: (id: string) => string) {
  const ids = await readIndex(indexKey);
  await Promise.all(ids.map((id) => SecureStore.deleteItemAsync(itemKey(id), OPTIONS)));
  await SecureStore.deleteItemAsync(indexKey, OPTIONS);
}

// ── GitHub ─────────────────────────────────────────────────────────────

const githubItemKey = (id: string) => `${KEYS.githubAccount}.${id}`;

/** Every connected GitHub account, in the order they were added. */
export async function getGitHubAccounts(): Promise<GitHubCredentials[]> {
  const accounts = await readList(KEYS.githubIndex, githubItemKey, isGitHubCredentials);
  if (accounts.length > 0) return accounts;
  // One-time move from the single-account key (and its older predecessor).
  const single = await readSingleGitHubCredentials();
  if (!single) return [];
  await upsertItem(KEYS.githubIndex, githubItemKey, githubAccountKey(single), single);
  await SecureStore.deleteItemAsync(KEYS.github, OPTIONS);
  return [single];
}

/** One account by its GitHub user id, or the first account when no id is given. */
export async function getGitHubCredentials(accountId?: number): Promise<GitHubCredentials | null> {
  const accounts = await getGitHubAccounts();
  if (accountId == null) return accounts[0] ?? null;
  return accounts.find((account) => account.account.id === accountId) ?? null;
}

/** Add an account, or replace the stored token of one already connected. */
export async function saveGitHubCredentials(creds: GitHubCredentials): Promise<void> {
  if (!isGitHubCredentials(creds)) throw new Error('Invalid GitHub credentials.');
  await getGitHubAccounts(); // finish any migration first so it can't overwrite this
  await upsertItem(KEYS.githubIndex, githubItemKey, githubAccountKey(creds), creds);
}

export async function removeGitHubCredentials(creds: Pick<GitHubCredentials, 'account'>): Promise<void> {
  await removeItem(KEYS.githubIndex, githubItemKey, githubAccountKey(creds));
}

/** Remove every GitHub account. */
export async function clearGitHubCredentials(): Promise<void> {
  await clearList(KEYS.githubIndex, githubItemKey);
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.github, OPTIONS),
    SecureStore.deleteItemAsync(KEYS.legacyGithub, OPTIONS),
  ]);
}

async function readSingleGitHubCredentials(): Promise<GitHubCredentials | null> {
  const raw = await SecureStore.getItemAsync(KEYS.github, OPTIONS);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return isGitHubCredentials(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return migrateLegacyGitHubCredentials();
}

async function migrateLegacyGitHubCredentials(): Promise<GitHubCredentials | null> {
  const raw = await SecureStore.getItemAsync(KEYS.legacyGithub, OPTIONS);
  if (!raw) return null;

  try {
    const legacy = JSON.parse(raw) as {
      method?: unknown;
      token?: unknown;
      login?: unknown;
      avatarUrl?: unknown;
    };
    if (
      (legacy.method !== 'oauth' && legacy.method !== 'pat') ||
      typeof legacy.token !== 'string' ||
      !legacy.token ||
      typeof legacy.login !== 'string' ||
      typeof legacy.avatarUrl !== 'string'
    ) {
      return null;
    }

    const migrated: GitHubCredentials = {
      schemaVersion: 2,
      authKind: legacy.method === 'pat' ? 'fine-grained-pat' : 'legacy-oauth',
      accessToken: legacy.token,
      account: {
        id: 0,
        login: legacy.login,
        avatarUrl: legacy.avatarUrl,
      },
      validatedAt: new Date(0).toISOString(),
    };
    await SecureStore.deleteItemAsync(KEYS.legacyGithub, OPTIONS);
    return migrated;
  } catch {
    return null;
  }
}

function isGitHubCredentials(value: unknown): value is GitHubCredentials {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GitHubCredentials>;
  return (
    candidate.schemaVersion === 2 &&
    (candidate.authKind === 'github-app' ||
      candidate.authKind === 'fine-grained-pat' ||
      candidate.authKind === 'legacy-oauth') &&
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    !!candidate.account &&
    typeof candidate.account.id === 'number' &&
    typeof candidate.account.login === 'string' &&
    typeof candidate.account.avatarUrl === 'string' &&
    typeof candidate.validatedAt === 'string'
  );
}

// ── Jira ───────────────────────────────────────────────────────────────

const jiraItemKey = (id: string) => `${KEYS.jiraAccount}.${id}`;

/** Every connected Jira login, in the order they were added. */
export async function getJiraAccounts(): Promise<JiraCredentials[]> {
  const accounts = await readList(KEYS.jiraIndex, jiraItemKey, isJiraCredentials);
  if (accounts.length > 0) return accounts.map(withJiraId);
  const raw = await SecureStore.getItemAsync(KEYS.jira, OPTIONS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!isJiraCredentials(parsed)) return [];
    const single = withJiraId(parsed);
    await upsertItem(KEYS.jiraIndex, jiraItemKey, single.id, single);
    await SecureStore.deleteItemAsync(KEYS.jira, OPTIONS);
    return [single];
  } catch {
    return [];
  }
}

/** Add a Jira login, or replace the token of one already connected. */
export async function saveJiraCredentials(creds: JiraCredentials): Promise<void> {
  if (!isJiraCredentials(creds)) throw new Error('Invalid Jira credentials.');
  await getJiraAccounts();
  const record = withJiraId(creds);
  await upsertItem(KEYS.jiraIndex, jiraItemKey, record.id, record);
}

export async function removeJiraCredentials(id: string): Promise<void> {
  await removeItem(KEYS.jiraIndex, jiraItemKey, id);
}

/** Remove every Jira login. */
export async function clearJiraCredentials(): Promise<void> {
  await clearList(KEYS.jiraIndex, jiraItemKey);
  await SecureStore.deleteItemAsync(KEYS.jira, OPTIONS);
}

function withJiraId(creds: JiraCredentials): JiraCredentials {
  return { ...creds, id: jiraAccountKey(creds) };
}

function isJiraCredentials(value: unknown): value is JiraCredentials {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<JiraCredentials>;
  return (
    c.schemaVersion === 1 &&
    typeof c.site === 'string' &&
    c.site.startsWith('https://') &&
    typeof c.email === 'string' &&
    typeof c.apiToken === 'string' &&
    c.apiToken.length > 0 &&
    !!c.account &&
    typeof c.account.accountId === 'string' &&
    typeof c.validatedAt === 'string'
  );
}
