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
