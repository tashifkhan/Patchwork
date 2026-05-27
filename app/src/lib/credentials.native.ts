import * as SecureStore from 'expo-secure-store';

export interface NextcloudCredentials {
  baseUrl: string;
  username: string;
  appPassword: string;
}

export interface AppCredentials {
  nextcloud: NextcloudCredentials | null;
  geminiApiKey: string | null;
}

const KEYS = {
  nextcloudBaseUrl: 'caldav-todo.nextcloud.base-url',
  nextcloudUsername: 'caldav-todo.nextcloud.username',
  nextcloudAppPassword: 'caldav-todo.nextcloud.app-password',
  geminiApiKey: 'caldav-todo.gemini.api-key',
};

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
};

export async function getCredentials(): Promise<AppCredentials> {
  const [baseUrl, username, appPassword, geminiApiKey] = await Promise.all([
    SecureStore.getItemAsync(KEYS.nextcloudBaseUrl, OPTIONS),
    SecureStore.getItemAsync(KEYS.nextcloudUsername, OPTIONS),
    SecureStore.getItemAsync(KEYS.nextcloudAppPassword, OPTIONS),
    SecureStore.getItemAsync(KEYS.geminiApiKey, OPTIONS),
  ]);

  return {
    nextcloud:
      baseUrl && username && appPassword
        ? { baseUrl, username, appPassword }
        : null,
    geminiApiKey,
  };
}

export async function saveNextcloudCredentials(credentials: NextcloudCredentials): Promise<void> {
  const baseUrl = credentials.baseUrl.trim().replace(/\/+$/, '');
  const username = credentials.username.trim();
  const appPassword = credentials.appPassword.trim();

  if (!baseUrl || !username || !appPassword) {
    throw new Error('Nextcloud URL, username, and app password are required.');
  }

  await Promise.all([
    SecureStore.setItemAsync(KEYS.nextcloudBaseUrl, baseUrl, OPTIONS),
    SecureStore.setItemAsync(KEYS.nextcloudUsername, username, OPTIONS),
    SecureStore.setItemAsync(KEYS.nextcloudAppPassword, appPassword, OPTIONS),
  ]);
}

export async function clearNextcloudCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.nextcloudBaseUrl, OPTIONS),
    SecureStore.deleteItemAsync(KEYS.nextcloudUsername, OPTIONS),
    SecureStore.deleteItemAsync(KEYS.nextcloudAppPassword, OPTIONS),
  ]);
}

export async function saveGeminiApiKey(apiKey: string): Promise<void> {
  const value = apiKey.trim();
  if (!value) {
    throw new Error('Gemini API key is required.');
  }
  await SecureStore.setItemAsync(KEYS.geminiApiKey, value, OPTIONS);
}

export async function clearGeminiApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.geminiApiKey, OPTIONS);
}
