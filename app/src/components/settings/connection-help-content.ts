/** Shared copy for the Connection help popover/tooltip across iOS, Android and web. */
export const CONNECTION_HELP_TITLE = 'Connecting to CalDAV';

export const CONNECTION_HELP_PARAGRAPHS = [
  'Credentials stay on this device — saved in the system keychain/keystore and sent only to your own server.',
  'Nextcloud: use https://‹your-host›/remote.php/dav as the server URL, your username, and an App Password from Settings → Security → Devices & sessions (not your login password, especially with 2FA).',
  'Other CalDAV servers work the same way — point the URL at your principal or calendar collection and sign in with your username and password.',
  'Gemini is optional: paste a key from aistudio.google.com to enable AI image import. It is stored on-device (BYOK).',
];
