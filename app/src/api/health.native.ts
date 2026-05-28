import type { HealthResponse } from './types';
import { getAccounts, getGeminiApiKey } from '@/lib/credentials';

export async function fetchHealth(): Promise<HealthResponse> {
  const [accounts, geminiApiKey] = await Promise.all([getAccounts(), getGeminiApiKey()]);
  return {
    status: 'ok',
    nextcloud_configured: accounts.length > 0,
    gemini_configured: !!geminiApiKey,
  };
}
