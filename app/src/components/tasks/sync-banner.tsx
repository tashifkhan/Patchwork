import { router } from 'expo-router';
import { useState } from 'react';

import { useOfflineBannerStore } from '@/hooks/use-offline';
import { StatusBanner } from '@/components/ui/status-banner';
import type { StatusBannerProps } from '@/components/ui/status-banner-types';
import { useConnectivityStore } from '@/lib/connectivity';
import { describeSyncError } from '@/lib/friendly-error';
import { haptics } from '@/lib/haptics';
import { useOutboxStore } from '@/lib/outbox';
import { flushOutbox } from '@/lib/outbox-sync';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const OFFLINE_PREFIX = "You're offline";

/**
 * One banner for everything about sync on the Tasks screen: offline,
 * sources that failed, and to-dos waiting in the outbox. The most pressing
 * one wins, so the list never stacks two cards that say the same thing.
 * Order: rejected items, offline, a failed load, partial sync, pending.
 * The offline one can be closed; it syncs in the background either way.
 */
export function SyncBanner({
  warnings,
  error,
  onRetry,
}: {
  /** Sync warnings for the screen. A leading "You're offline" one marks offline mode. */
  warnings: string[];
  /** The load failed outright. */
  error?: unknown;
  /** Refetches the screen's data. Runs next to the outbox flush. */
  onRetry: () => unknown;
}) {
  const entries = useOutboxStore((s) => s.entries);
  const probeOffline = useConnectivityStore((s) => s.quality === 'offline');
  const [busy, setBusy] = useState(false);
  const dismissed = useOfflineBannerStore((s) => s.dismissed);
  const setDismissed = useOfflineBannerStore((s) => s.setDismissed);

  const retry = () => {
    if (busy) return;
    setBusy(true);
    Promise.allSettled([Promise.resolve(onRetry()), flushOutbox({ retryFailed: true })])
      .then(([, flush]) => {
        if (flush.status !== 'fulfilled') return;
        const { sent, failed, offline } = flush.value;
        if (offline || failed > 0) haptics.warning();
        else if (sent > 0) haptics.success();
      })
      .finally(() => setBusy(false));
  };
  const outbox = { label: 'Outbox', onPress: () => router.push('/settings/offline') };

  const failed = entries.filter((entry) => entry.lastError != null).length;
  const pending = entries.length - failed;
  const offline = probeOffline || (warnings[0]?.startsWith(OFFLINE_PREFIX) ?? false);
  const partial = warnings.find((w) => !w.startsWith(OFFLINE_PREFIX));
  const waitingNote = pending > 0 ? ` ${plural(pending, 'change')} will go up when it's back.` : '';

  let props: StatusBannerProps | null = null;
  if (failed > 0) {
    props = {
      tone: 'error',
      icon: 'cloud-alert-outline',
      sf: 'exclamationmark.icloud',
      title: `${plural(failed, 'change')} couldn't sync`,
      body: 'The server rejected them. Open the outbox to see why, then retry or discard.',
      primary: { label: 'Retry', onPress: retry, busy },
      secondary: { ...outbox, label: 'Review' },
    };
  } else if (offline) {
    // Closed: the Offline chip by the title says it instead, and taps reopen this.
    if (dismissed) return null;
    props = {
      tone: 'warning',
      icon: 'cloud-off-outline',
      sf: 'icloud.slash',
      title: "You're offline",
      body:
        pending > 0
          ? `Showing your last sync. ${plural(pending, 'change')} saved here will go up when you reconnect.`
          : 'Showing your last sync. Anything new stays on this device until you reconnect.',
      primary: { label: 'Try again', onPress: retry, busy },
      secondary: pending > 0 ? outbox : undefined,
      onDismiss: () => setDismissed(true),
    };
  } else if (error) {
    const copy = describeSyncError(error, 'Your to-dos');
    props = {
      tone: copy.kind === 'other' || copy.kind === 'auth' ? 'error' : 'warning',
      icon: 'cloud-alert-outline',
      sf: 'exclamationmark.icloud',
      title: copy.title,
      body: copy.body + waitingNote,
      detail: copy.detail,
      primary: { label: 'Retry', onPress: retry, busy },
      secondary: entries.length > 0 ? outbox : undefined,
    };
  } else if (partial) {
    const copy = describeSyncError(partial, 'Some lists');
    props = {
      tone: 'warning',
      icon: 'cloud-sync-outline',
      sf: 'arrow.clockwise.icloud',
      title: copy.kind === 'other' ? "Some lists didn't sync" : copy.title,
      body: (copy.kind === 'other' ? 'The rest are up to date.' : copy.body) + waitingNote,
      detail: copy.detail ?? partial,
      primary: { label: 'Retry', onPress: retry, busy },
      secondary: entries.length > 0 ? outbox : undefined,
    };
  } else if (pending > 0) {
    props = {
      tone: 'info',
      icon: 'cloud-upload-outline',
      sf: 'icloud.and.arrow.up',
      title: `${plural(pending, 'change')} waiting to sync`,
      body: `Saved on this device. ${pending === 1 ? 'It goes' : 'They go'} up on the next sync.`,
      primary: { label: 'Sync now', onPress: retry, busy },
      secondary: outbox,
    };
  }

  return props ? <StatusBanner {...props} /> : null;
}
