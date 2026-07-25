/** Shared URL safety checks for credentials, CalDAV/Deck requests, and AI endpoints. */

export function normalizeServiceUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function originOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin.toLowerCase();
  } catch {
    return url.match(/^https?:\/\/[^/]+/i)?.[0]?.toLowerCase() ?? url.toLowerCase();
  }
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isLoopbackHost(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.home')) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }

  // Unique local IPv6 (fc00::/7) and link-local (fe80::/10)
  if (host.includes(':')) {
    const head = host.split(':')[0] ?? '';
    if (head.startsWith('fc') || head.startsWith('fd') || head.startsWith('fe8') || head.startsWith('fe9') || head.startsWith('fea') || head.startsWith('feb')) {
      return true;
    }
  }

  return false;
}

/**
 * CalDAV / Nextcloud account URLs: HTTPS required, except cleartext to private/LAN hosts
 * (common for home servers). Rejects credentialed requests to arbitrary public HTTP.
 */
export function assertSafeAccountUrl(url: string): string {
  const normalized = normalizeServiceUrl(url);
  if (!normalized) {
    throw new Error('Server URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Server URL is invalid. Use a full URL like https://cloud.example.com');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Server URL must use https:// (or http:// only for a local/LAN server).');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Do not put username or password in the server URL. Use the fields below.');
  }

  if (parsed.protocol === 'http:' && !isPrivateOrLocalHost(parsed.hostname)) {
    throw new Error(
      'HTTP is only allowed for local/LAN servers. Use HTTPS for public hosts to protect your app password.'
    );
  }

  return normalizeServiceUrl(parsed.toString());
}

/**
 * AI provider base URLs: HTTPS, or HTTP only to loopback/private LAN (Ollama, etc.).
 * Prevents shipping API keys to typo'd public cleartext endpoints.
 */
export function assertSafeAiBaseUrl(url: string): string {
  const normalized = normalizeServiceUrl(url);
  if (!normalized) {
    throw new Error('AI base URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('AI base URL is invalid. Use a full URL like https://api.example.com/v1');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('AI base URL must use https:// (or http:// only for a local model server).');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Do not embed credentials in the AI base URL.');
  }

  if (parsed.protocol === 'http:' && !isPrivateOrLocalHost(parsed.hostname)) {
    throw new Error(
      'HTTP AI endpoints are only allowed on local/LAN hosts. Use HTTPS for remote providers so API keys are not sent in cleartext.'
    );
  }

  return normalizeServiceUrl(parsed.toString());
}

/** Reject absolute URLs that would send this account's Basic auth off-origin. */
export function assertUrlSameOrigin(requestUrl: string, accountOrigin: string): string {
  const requestOrigin = originOf(requestUrl);
  const allowedOrigin = originOf(accountOrigin);
  if (requestOrigin !== allowedOrigin) {
    throw new Error(
      `Refusing to send credentials to ${requestOrigin} (account origin is ${allowedOrigin}).`
    );
  }
  return requestUrl;
}
