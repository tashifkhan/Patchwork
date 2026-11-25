import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { checkConnection, useConnectivityStore } from '@/features/sync/connectivity';
import { flushOutbox } from '@/features/sync/replay';
import { useTaskWarnings } from '@/features/tasks/queries';
import { queryClient } from '@/lib/query-client';
import { useSyncStatusStore } from '@/features/sync/sync-status-store';

const OFFLINE_PREFIX = "You're offline";

/** Whether the "You're offline" banner was closed. Resets on reconnect. */
export const useOfflineBannerStore = create<{ dismissed: boolean; setDismissed: (dismissed: boolean) => void }>(
  (set) => ({ dismissed: false, setDismissed: (dismissed) => set({ dismissed }) })
);

/**
 * True while the app is showing cached data: the last probe found no
 * connection, or the last task or board load fell back to the cache.
 */
export function useIsOffline() {
  const probe = useConnectivityStore((s) => s.quality === 'offline');
  const tasks = useTaskWarnings()?.[0]?.startsWith(OFFLINE_PREFIX) ?? false;
  const deck = useSyncStatusStore((s) => s.deckWarnings[0]?.startsWith(OFFLINE_PREFIX) ?? false);
  return probe || tasks || deck;
}

/**
 * While offline, probe the connection in the background (15s, backing off
 * to 2 minutes) and, once it's back, send the outbox and refetch everything
 * so the cached screens update without a tap. Mount once, at the root.
 */
export function useReconnectSync() {
  const offline = useIsOffline();

  // A closed banner comes back the next time the connection drops.
  useEffect(() => {
    if (!offline) useOfflineBannerStore.getState().setDismissed(false);
  }, [offline]);

  useEffect(() => {
    if (!offline || process.env.EXPO_OS === 'web') return;
    let delay = 15_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const probe = async () => {
      if (cancelled) return;
      if (AppState.currentState === 'active' && (await checkConnection()) !== 'offline' && !cancelled) {
        await flushOutbox().catch(() => {});
        await queryClient.invalidateQueries();
      }
      if (cancelled) return;
      delay = Math.min(delay * 2, 120_000);
      timer = setTimeout(probe, delay);
    };
    timer = setTimeout(probe, delay);
    // Coming back to the app is a good moment to look again.
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      clearTimeout(timer);
      delay = 15_000;
      void probe();
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.remove();
    };
  }, [offline]);
}
