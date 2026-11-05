import * as SecureStore from 'expo-secure-store';

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

const KEYS = {
  accounts: 'patchwork.accounts',
  geminiApiKey: 'patchwork.gemini.api-key',
  github: 'patchwork.github.credentials.v2',
  legacyGithub: 'patchwork.github.credentials',
  jira: 'patchwork.jira.credentials.v1',
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

// ── GitHub ─────────────────────────────────────────────────────────────

export async function getGitHubCredentials(): Promise<GitHubCredentials | null> {
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

export async function saveGitHubCredentials(creds: GitHubCredentials): Promise<void> {
  if (!isGitHubCredentials(creds)) throw new Error('Invalid GitHub credentials.');
  await SecureStore.setItemAsync(KEYS.github, JSON.stringify(creds), OPTIONS);
}

export async function clearGitHubCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.github, OPTIONS),
    SecureStore.deleteItemAsync(KEYS.legacyGithub, OPTIONS),
  ]);
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
    await saveGitHubCredentials(migrated);
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

export async function getJiraCredentials(): Promise<JiraCredentials | null> {
  const raw = await SecureStore.getItemAsync(KEYS.jira, OPTIONS);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isJiraCredentials(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveJiraCredentials(creds: JiraCredentials): Promise<void> {
  if (!isJiraCredentials(creds)) throw new Error('Invalid Jira credentials.');
  await SecureStore.setItemAsync(KEYS.jira, JSON.stringify(creds), OPTIONS);
}

export async function clearJiraCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.jira, OPTIONS);
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
