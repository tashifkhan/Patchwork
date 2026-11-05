// Shared, platform-agnostic credential types. The runtime implementations live
// in credentials.native.ts / credentials.web.ts / credentials.ts (Metro picks
// one per platform); types are erased at build time so they belong in one place.

/** CalDAV server flavor — affects URL hints and the DAV path we build. */
export type ServerType =
  | 'nextcloud'
  | 'owncloud'
  | 'sabredav'
  | 'mailbox'
  | 'openxchange'
  | 'synology'
  | 'other'
  | 'unknown';

export interface CalDavAccount {
  id: string;
  displayName: string;
  /** Server root, e.g. https://cloud.example.com (no trailing slash). */
  baseUrl: string;
  username: string;
  appPassword: string;
  serverType: ServerType;
}

/** Back-compat alias for the single-account shape some callers still import. */
export type NextcloudCredentials = Pick<CalDavAccount, 'baseUrl' | 'username' | 'appPassword'>;

/** GitHub authentication credentials stored in secure storage. */
export type GitHubCredentials =
  import('@/features/github/types').GitHubCredentialsV2;

/** The Jira Cloud user a token belongs to. */
export interface JiraAccount {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrl?: string;
}

/**
 * Jira Cloud credentials: the site plus an Atlassian API token, sent as HTTP
 * Basic auth (email:token). Stored only in secure storage on this device.
 */
export interface JiraCredentials {
  schemaVersion: 1;
  /** Site root, e.g. https://acme.atlassian.net (no trailing slash). */
  site: string;
  email: string;
  apiToken: string;
  account: JiraAccount;
  validatedAt: string;
}
