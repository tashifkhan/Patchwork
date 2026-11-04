import type { GitHubIssue, GitHubRepo } from '@/api/types';

export type GitHubAuthKind = 'github-app' | 'fine-grained-pat' | 'legacy-oauth';

export interface GitHubAccount {
  id: number;
  login: string;
  avatarUrl: string;
}

export interface GitHubCredentialsV2 {
  schemaVersion: 2;
  authKind: GitHubAuthKind;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  account: GitHubAccount;
  validatedAt: string;
}

export interface GitHubRepositorySelection {
  /** Null only while migrating an old owner/repo string; validation fills it. */
  id: number | null;
  fullName: string;
  visibility?: 'public' | 'private' | 'internal';
  canWriteIssues?: boolean;
}

export type GitHubIssueScope = 'assigned' | 'created' | 'mentioned' | 'all';
export type GitHubIssueState = 'open' | 'closed' | 'all';

export interface GitHubRateLimit {
  limit?: number;
  remaining?: number;
  resetAt?: string;
  retryAfterSeconds?: number;
}

export type GitHubErrorCode =
  | 'network'
  | 'timeout'
  | 'unauthenticated'
  | 'token_expired'
  | 'permission_denied'
  | 'rate_limited'
  | 'not_found'
  | 'validation'
  | 'gone'
  | 'conflict'
  | 'server'
  | 'cancelled'
  | 'invalid_response';

export interface GitHubSourceWarning {
  repository: string;
  code: GitHubErrorCode;
  message: string;
  rateLimit?: GitHubRateLimit;
}

export interface GitHubIssuesResult {
  issues: GitHubIssue[];
  warnings: GitHubSourceWarning[];
  rateLimit?: GitHubRateLimit;
}

export interface GitHubReposResult {
  repositories: GitHubRepo[];
  warnings: GitHubSourceWarning[];
  rateLimit?: GitHubRateLimit;
}

export type GitHubConnectionState =
  | { status: 'initializing' }
  | { status: 'disconnected' }
  | { status: 'connected'; credentials: GitHubCredentialsV2 }
  | { status: 'refreshing'; credentials: GitHubCredentialsV2 }
  | { status: 'expired'; account?: GitHubAccount; message: string }
  | { status: 'error'; message: string };

