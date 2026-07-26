import type { GitHubCredentials } from './credentials-types';
import { GitHubError } from '@/features/github/errors';
import type { GitHubAccount, GitHubTokenGrant } from '@/features/github/types';

const GITHUB_CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ?? '';
const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function requestDeviceCode(signal?: AbortSignal): Promise<DeviceCodeResponse> {
  if (!GITHUB_CLIENT_ID) {
    throw new GitHubError(
      'validation',
      'GitHub is not configured in this build. Set EXPO_PUBLIC_GITHUB_CLIENT_ID to a GitHub App client ID.'
    );
  }

  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID }).toString(),
    signal,
  });
  const data = await readJsonRecord(response, 'requesting a device code');
  if (!response.ok) {
    throw new GitHubError(
      'server',
      responseMessage(data, `GitHub returned ${response.status} requesting a device code.`),
      response.status,
      data
    );
  }

  if (
    typeof data.device_code !== 'string' ||
    typeof data.user_code !== 'string' ||
    typeof data.verification_uri !== 'string' ||
    typeof data.expires_in !== 'number' ||
    typeof data.interval !== 'number'
  ) {
    throw new GitHubError('invalid_response', 'GitHub returned an invalid device code response.');
  }

  return data as unknown as DeviceCodeResponse;
}

export async function pollForAccessToken(
  deviceCode: string,
  interval: number,
  signal?: AbortSignal,
  expiresInSeconds = 900
): Promise<GitHubTokenGrant> {
  let waitSeconds = Math.max(1, interval);
  const deadline = Date.now() + Math.max(30, expiresInSeconds) * 1000;

  while (Date.now() < deadline) {
    await sleep(waitSeconds * 1000, signal);

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
      signal,
    });
    const data = await readJsonRecord(response, 'waiting for GitHub authorization');

    if (typeof data.access_token === 'string') {
      return tokenGrantFromResponse(data);
    }
    if (data.error === 'slow_down') {
      waitSeconds = Math.max(waitSeconds + 5, numberOrUndefined(data.interval) ?? 0);
      continue;
    }
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'expired_token') {
      throw new GitHubError('token_expired', 'The device code expired. Start the connection again.');
    }
    if (data.error === 'access_denied') {
      throw new GitHubError('permission_denied', 'GitHub authorization was denied.');
    }
    if (!response.ok) {
      throw new GitHubError(
        response.status >= 500 ? 'server' : 'validation',
        responseMessage(data, `GitHub returned ${response.status} during authorization.`),
        response.status,
        data
      );
    }
    throw new GitHubError(
      'validation',
      responseMessage(data, 'GitHub could not complete authorization.'),
      response.status,
      data
    );
  }

  throw new GitHubError('token_expired', 'The device code expired. Start the connection again.');
}

export async function refreshGitHubCredentials(
  credentials: GitHubCredentials,
  signal?: AbortSignal
): Promise<GitHubCredentials> {
  if (!credentials.refreshToken) return credentials;
  if (!GITHUB_CLIENT_ID) {
    throw new GitHubError('validation', 'This build cannot refresh the GitHub connection.');
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }).toString(),
    signal,
  });
  const data = await readJsonRecord(response, 'refreshing GitHub authorization');
  if (!response.ok || typeof data.access_token !== 'string') {
    throw new GitHubError(
      response.status === 401 || data.error === 'bad_refresh_token'
        ? 'token_expired'
        : 'server',
      responseMessage(data, 'The GitHub connection could not be refreshed.'),
      response.status,
      data
    );
  }

  const grant = tokenGrantFromResponse(data);
  return credentialsFromGrant(
    { ...grant, refreshToken: grant.refreshToken ?? credentials.refreshToken },
    credentials.account
  );
}

export async function fetchGitHubUser(
  token: string,
  signal?: AbortSignal
): Promise<GitHubAccount> {
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    signal,
  });
  const data = await readJsonRecord(response, 'fetching the GitHub account');
  if (!response.ok) {
    throw new GitHubError(
      response.status === 401 ? 'unauthenticated' : 'permission_denied',
      responseMessage(data, `GitHub returned ${response.status} fetching the account.`),
      response.status,
      data
    );
  }
  if (
    typeof data.id !== 'number' ||
    typeof data.login !== 'string' ||
    typeof data.avatar_url !== 'string'
  ) {
    throw new GitHubError('invalid_response', 'GitHub returned an invalid account response.');
  }
  return { id: data.id, login: data.login, avatarUrl: data.avatar_url };
}

export function isOAuthAvailable(): boolean {
  return GITHUB_CLIENT_ID.length > 0;
}

export async function credentialsFromDeviceGrant(
  grant: GitHubTokenGrant,
  signal?: AbortSignal
): Promise<GitHubCredentials> {
  const account = await fetchGitHubUser(grant.accessToken, signal);
  return credentialsFromGrant(grant, account);
}

export async function validatePat(
  token: string,
  signal?: AbortSignal
): Promise<GitHubCredentials> {
  const accessToken = token.trim();
  if (!accessToken) throw new GitHubError('validation', 'Token is required.');
  const account = await fetchGitHubUser(accessToken, signal);
  return {
    schemaVersion: 2,
    authKind: 'fine-grained-pat',
    accessToken,
    account,
    validatedAt: new Date().toISOString(),
  };
}

export function credentialsNeedRefresh(
  credentials: GitHubCredentials,
  leewayMs = 2 * 60_000
): boolean {
  if (!credentials.accessTokenExpiresAt) return false;
  return new Date(credentials.accessTokenExpiresAt).getTime() <= Date.now() + leewayMs;
}

function credentialsFromGrant(
  grant: GitHubTokenGrant,
  account: GitHubAccount
): GitHubCredentials {
  const now = Date.now();
  return {
    schemaVersion: 2,
    authKind: 'github-app',
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    accessTokenExpiresAt: grant.expiresIn
      ? new Date(now + grant.expiresIn * 1000).toISOString()
      : undefined,
    refreshTokenExpiresAt: grant.refreshTokenExpiresIn
      ? new Date(now + grant.refreshTokenExpiresIn * 1000).toISOString()
      : undefined,
    account,
    validatedAt: new Date(now).toISOString(),
  };
}

function tokenGrantFromResponse(data: Record<string, unknown>): GitHubTokenGrant {
  return {
    accessToken: String(data.access_token),
    refreshToken:
      typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
    expiresIn: numberOrUndefined(data.expires_in),
    refreshTokenExpiresIn: numberOrUndefined(data.refresh_token_expires_in),
  };
}

async function readJsonRecord(
  response: Response,
  operation: string
): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // Handled below with a stable error rather than exposing response HTML.
  }
  throw new GitHubError(
    'invalid_response',
    `GitHub returned an invalid response while ${operation}.`,
    response.status
  );
}

function responseMessage(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.error_description === 'string') return data.error_description;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.error === 'string') return data.error;
  return fallback;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GitHubError('cancelled', 'GitHub authorization was cancelled.'));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new GitHubError('cancelled', 'GitHub authorization was cancelled.'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
