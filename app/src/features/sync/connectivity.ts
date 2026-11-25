import { create } from 'zustand';

/**
 * Reachability without a native module. A request to a 204 endpoint tells
 * three cases apart: it answers fast (online), it answers slowly or not
 * before the deadline (slow), or fetch rejects at once (offline, which is
 * what airplane mode and a dropped Wi-Fi look like on iOS and Android).
 */
export type ConnectionQuality = 'online' | 'slow' | 'offline';

/** Two unrelated hosts, so one blocked or down CDN doesn't read as "offline". */
const PROBE_URLS = ['https://www.gstatic.com/generate_204', 'https://cp.cloudflare.com/generate_204'];

interface ConnectivityState {
  quality: ConnectionQuality | null;
  checkedAt: number | null;
  setQuality: (quality: ConnectionQuality) => void;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  quality: null,
  checkedAt: null,
  setQuality: (quality) => set({ quality, checkedAt: Date.now() }),
}));

/** True when the last probe, taken within `maxAgeMs`, found no connection. */
export function knownOffline(maxAgeMs = 15_000) {
  const { quality, checkedAt } = useConnectivityStore.getState();
  return quality === 'offline' && checkedAt != null && Date.now() - checkedAt < maxAgeMs;
}

export async function checkConnection({
  timeoutMs = 6000,
  slowMs = 3000,
}: { timeoutMs?: number; slowMs?: number } = {}): Promise<ConnectionQuality> {
  const startedAt = Date.now();
  const quality = await new Promise<ConnectionQuality>((resolve) => {
    let pending = PROBE_URLS.length;
    let timedOut = false;
    const controllers = PROBE_URLS.map(() => new AbortController());
    const timer = setTimeout(() => {
      timedOut = true;
      controllers.forEach((controller) => controller.abort());
    }, timeoutMs);
    const settle = (value: ConnectionQuality) => {
      clearTimeout(timer);
      controllers.forEach((controller) => controller.abort());
      resolve(value);
    };
    PROBE_URLS.forEach((url, index) => {
      fetch(url, { method: 'GET', cache: 'no-store', signal: controllers[index].signal })
        .then(() => settle(Date.now() - startedAt > slowMs ? 'slow' : 'online'))
        .catch(() => {
          pending -= 1;
          if (pending === 0) settle(timedOut ? 'slow' : 'offline');
        });
    });
  });
  useConnectivityStore.getState().setQuality(quality);
  return quality;
}

/**
 * Whether a failure came from the connection rather than the server. Only
 * these are worth queueing and retrying; a 4xx will fail the same way again.
 * Matches by shape so this module doesn't import every API client.
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const shaped = error as Error & { status?: unknown; code?: unknown };
  if (shaped.name === 'GitHubError') return shaped.code === 'network';
  if (shaped.name === 'JiraError') {
    return shaped.status == null && /could not reach jira|took too long/i.test(error.message);
  }
  if (typeof shaped.status === 'number') return shaped.status === 0;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  return /network|failed to fetch|internet|offline|timed? ?out|timeout|connection|unreachable|could not connect/i.test(
    error.message
  );
}

export const OFFLINE_DICTATION_MESSAGE =
  "Dictation isn't possible right now because you're offline. Connect to the internet and try again.";

export const SLOW_DICTATION_MESSAGE =
  "Dictation isn't possible right now because your internet connection is too weak. Try again when you have a better signal.";
