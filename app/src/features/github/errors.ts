import type { GitHubErrorCode, GitHubRateLimit } from './types';

export class GitHubError extends Error {
  /** GitHub user id of the connected account the failed request used. */
  accountId?: number;

  constructor(
    public code: GitHubErrorCode,
    message: string,
    public status?: number,
    public detail?: unknown,
    public rateLimit?: GitHubRateLimit
  ) {
    super(message);
    this.name = 'GitHubError';
  }

  get requiresReconnect() {
    return this.code === 'unauthenticated' || this.code === 'token_expired';
  }
}

export function asGitHubError(error: unknown): GitHubError {
  if (error instanceof GitHubError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new GitHubError('cancelled', 'The GitHub request was cancelled.');
  }
  if (error instanceof Error) {
    return new GitHubError('network', error.message);
  }
  return new GitHubError('network', 'Could not reach GitHub.');
}
