import type { HealthResponse } from './types';
import { getCredentials } from '@/lib/credentials';

export async function fetchHealth(): Promise<HealthResponse> {
  const credentials = await getCredentials();
  return {
    status: 'ok',
    nextcloud_configured: !!credentials.nextcloud,
    gemini_configured: !!credentials.geminiApiKey,
  };
}
