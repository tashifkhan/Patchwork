import type { GitHubCredentials, JiraCredentials } from './credentials-types';

// Pure ids for stored accounts. Kept apart from the credential stores so API
// modules and tests can use them without pulling in SecureStore.

/** Keychain keys allow only letters, digits, `.`, `-` and `_`. */
function safeKeyPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Storage id for a GitHub account: its numeric id, or the login for old records with id 0. */
export function githubAccountKey(creds: Pick<GitHubCredentials, 'account'>): string {
  return safeKeyPart(creds.account.id ? String(creds.account.id) : `login-${creds.account.login.toLowerCase()}`);
}

/** Stable id for a Jira login: the site plus the Atlassian account id. */
export function jiraAccountKey(creds: Pick<JiraCredentials, 'site' | 'account'>): string {
  return safeKeyPart(`${creds.site.replace(/^https:\/\//, '')}_${creds.account.accountId}`);
}
