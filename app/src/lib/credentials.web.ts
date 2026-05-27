export interface NextcloudCredentials {
  baseUrl: string;
  username: string;
  appPassword: string;
}

export interface AppCredentials {
  nextcloud: NextcloudCredentials | null;
  geminiApiKey: string | null;
}

export async function getCredentials(): Promise<AppCredentials> {
  return { nextcloud: null, geminiApiKey: null };
}

export async function saveNextcloudCredentials(_credentials: NextcloudCredentials): Promise<void> {}

export async function clearNextcloudCredentials(): Promise<void> {}

export async function saveGeminiApiKey(_apiKey: string): Promise<void> {}

export async function clearGeminiApiKey(): Promise<void> {}
