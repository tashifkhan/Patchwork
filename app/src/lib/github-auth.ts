import type { GitHubCredentials } from './credentials-types';

const GITHUB_CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ?? '';
const GITHUB_API = 'https://api.github.com';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/** Step 1: Request device & user codes from GitHub. */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  if (!GITHUB_CLIENT_ID) {
    throw new Error(
      'GitHub OAuth is not configured. Set EXPO_PUBLIC_GITHUB_CLIENT_ID in your .env file, or use a Personal Access Token instead.'
    );
  }

  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: 'repo',
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} requesting device code.`);
  }

  return response.json() as Promise<DeviceCodeResponse>;
}

/** Step 2: Poll for access token after user enters the code at github.com/login/device. */
export async function pollForAccessToken(
  deviceCode: string,
  interval: number,
  signal?: AbortSignal,
  expiresInSeconds = 900
): Promise<string> {
  let waitSeconds = Math.max(1, interval);
  const deadline = Date.now() + Math.max(30, expiresInSeconds) * 1000;

  while (true) {
    if (signal?.aborted) throw new Error('OAuth flow was cancelled.');
    if (Date.now() >= deadline) {
      throw new Error('The device code has expired. Please try again.');
    }

    await sleep(waitSeconds * 1000, signal);
    if (signal?.aborted) throw new Error('OAuth flow was cancelled.');
    if (Date.now() >= deadline) {
      throw new Error('The device code has expired. Please try again.');
    }

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal,
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (data.access_token) {
      return data.access_token as string;
    }

    if (data.error === 'slow_down') {
      waitSeconds = ((data.interval as number) ?? waitSeconds) + 1;
      continue;
    }

    if (data.error === 'authorization_pending') {
      continue;
    }

    if (data.error === 'expired_token') {
      throw new Error('The device code has expired. Please try again.');
    }

    if (data.error === 'access_denied') {
      throw new Error('Authorization was denied.');
    }

    throw new Error(
      `GitHub OAuth error: ${(data.error_description as string) ?? (data.error as string) ?? 'Unknown error'}`
    );
  }
}

/** Fetch the authenticated GitHub user profile. */
export async function fetchGitHubUser(
  token: string
): Promise<{ login: string; avatar_url: string }> {
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} fetching user profile.`);
  }

  const data = (await response.json()) as { login: string; avatar_url: string };
  return { login: data.login, avatar_url: data.avatar_url };
}

/** Returns true if a GitHub OAuth client ID is configured. */
export function isOAuthAvailable(): boolean {
  return GITHUB_CLIENT_ID.length > 0;
}

/** Validate a Personal Access Token by calling /user and return credentials. */
export async function validatePat(token: string): Promise<GitHubCredentials> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Token is required.');

  const user = await fetchGitHubUser(trimmed);
  return {
    method: 'pat',
    token: trimmed,
    login: user.login,
    avatarUrl: user.avatar_url,
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('OAuth flow was cancelled.'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('OAuth flow was cancelled.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
