import { useConnectivityStore } from '@/lib/connectivity';

export type SyncErrorKind = 'offline' | 'unreachable' | 'auth' | 'other';

export interface SyncErrorCopy {
  kind: SyncErrorKind;
  title: string;
  body: string;
  /** The raw message, for a "Details" toggle. Null when the body already says it all. */
  detail: string | null;
}

const NETWORK =
  /UnknownHostException|Unable to resolve host|Network request failed|fetch failed|ENOTFOUND|ECONNREFUSED|ConnectException|SocketTimeout|timed? ?out|Failed to connect|Internet connection appears to be offline|Could not connect|NSURLErrorDomain/i;
const AUTH = /\b40[13]\b|unauthori[sz]ed|forbidden|invalid (api )?token|expired token|login required/i;

function rawMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '';
}

/** `drive.example.com` from `Unable to resolve host "drive.example.com"` or a URL in the message. */
function hostIn(message: string): string | null {
  const quoted = /host "([^"]+)"/i.exec(message)?.[1];
  if (quoted) return quoted;
  const url = /https?:\/\/([^/\s:"']+)/i.exec(message)?.[1];
  return url ?? null;
}

/**
 * Turns a sync failure into something a person can act on. Java and
 * fetch internals stay out of the title and body; the original text is
 * kept as `detail` for anyone who wants it.
 *
 * `source` names what failed to load, e.g. "Deck boards" or "Jira".
 */
export function describeSyncError(error: unknown, source: string): SyncErrorCopy {
  const message = rawMessage(error).trim();
  const offline = useConnectivityStore.getState().quality === 'offline';

  if (offline) {
    return {
      kind: 'offline',
      title: "You're offline",
      body: `Showing ${source} from your last sync. Retry once you're back online.`,
      detail: null,
    };
  }
  if (NETWORK.test(message)) {
    const host = hostIn(message);
    return {
      kind: 'unreachable',
      title: host ? `Can't reach ${host}` : `Can't reach ${source}`,
      body: "The server didn't answer, so you're seeing what was last synced. Check that it's up, then retry.",
      detail: message || null,
    };
  }
  if (AUTH.test(message)) {
    return {
      kind: 'auth',
      title: `${source} need you to sign in again`,
      body: 'Your saved login was turned down. Update it in Settings.',
      detail: message || null,
    };
  }
  const firstStop = message.search(/\.\s/);
  const short = (firstStop > 0 ? message.slice(0, firstStop + 1) : message).slice(0, 140);
  return {
    kind: 'other',
    title: `${source} didn't sync`,
    body: short || 'Something went wrong while loading them.',
    detail: message && message !== short ? message : null,
  };
}
