import type { GitHubCredentials } from './credentials-types';
import { GitHubError } from '@/features/github/errors';
import type { GitHubAccount } from '@/features/github/types';

const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

/**
 * Where to create a fine-grained personal access token. Patchwork connects to
 * GitHub with a token only; there is no OAuth or GitHub App sign-in.
 */
export const GITHUB_NEW_TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=Patchwork&description=Patchwork%20issues%20as%20tasks';

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
      response.status === 401
        ? 'GitHub did not accept that token. Check it was copied in full and has not expired.'
        : responseMessage(data, `GitHub returned ${response.status} fetching the account.`),
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

/** Check a personal access token against GitHub and build credentials from it. */
export async function validatePat(
  token: string,
  signal?: AbortSignal
): Promise<GitHubCredentials> {
  const accessToken = token.trim();
  if (!accessToken) throw new GitHubError('validation', 'Paste a token first.');
  const account = await fetchGitHubUser(accessToken, signal);
  return {
    schemaVersion: 2,
    authKind: 'fine-grained-pat',
    accessToken,
    account,
    validatedAt: new Date().toISOString(),
  };
}

/**
 * Credentials saved by the old GitHub App sign-in. Tokens are the only way in
 * now, so these must be replaced; the session store reports them as expired.
 */
export function isLegacyCredential(credentials: GitHubCredentials): boolean {
  return credentials.authKind !== 'fine-grained-pat';
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
