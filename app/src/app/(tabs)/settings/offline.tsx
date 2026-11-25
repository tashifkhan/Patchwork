import { Fragment, useEffect, useState } from 'react';

import { discardQueued } from '@/features/tasks/repository';

import {
  RowSeparator,
  SettingsActionRow,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
} from '@/components/settings/settings-list';
import { NativeAlert } from '@/components/ui/native-alert';
import { useTaskLists } from '@/features/tasks/queries';
import { useConnectivityStore } from '@/features/sync/connectivity';
import { LOCAL_ACCOUNT_ID } from '@/features/tasks/local-tasks';
import { describeEntry, loadOutbox, useOutboxStore, type OutboxEntry } from '@/features/sync/outbox';
import { flushOutbox, type FlushResult } from '@/features/sync/replay';
import { queryClient, queryKeys } from '@/lib/query-client';

/**
 * On-device lists and the outbox: everything saved while offline that hasn't
 * reached its account, GitHub or Jira yet.
 */
export default function OfflineSettingsScreen() {
  const entries = useOutboxStore((s) => s.entries);
  const loadError = useOutboxStore((s) => s.loadError);
  const quality = useConnectivityStore((s) => s.quality);
  const listsQuery = useTaskLists();
  const localLists = (listsQuery.data ?? []).filter((list) => list.account_id === LOCAL_ACCOUNT_ID);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<FlushResult | null>(null);
  const [discard, setDiscard] = useState<OutboxEntry | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);

  useEffect(() => {
    void loadOutbox().catch(() => {});
  }, []);

  async function syncNow() {
    setSyncing(true);
    setResult(null);
    try {
      setResult(await flushOutbox({ retryFailed: true }));
    } catch {
      // The outbox store exposes a failed read alongside the retry action.
    } finally {
      setSyncing(false);
    }
  }

  const status =
    result == null
      ? quality === 'offline'
        ? "You're offline. Waiting items go up automatically once you're back online."
        : 'Waiting items go up automatically when the app opens and every 30 seconds while it stays open.'
      : result.offline
        ? `Still offline.${result.sent ? ` Sent ${result.sent} before the connection dropped.` : ''}`
        : `Sent ${result.sent}.${result.failed ? ` ${result.failed} turned down by the server.` : ''}`;

  return (
    <SettingsScreen>
      <SettingsGroup
        title="On this device"
        footer="These lists are stored only on this phone and never sync. Move a to-do into an account's list to sync it. New lists can live here too: pick On this device when you create one.">
        {localLists.length === 0 ? (
          <SettingsRow icon="cellphone" title="No on-device lists" />
        ) : (
          localLists.map((list, index) => (
            <Fragment key={list.id}>
              {index > 0 ? <RowSeparator /> : null}
              <SettingsRow icon="cellphone" title={list.name} />
            </Fragment>
          ))
        )}
      </SettingsGroup>

      <SettingsGroup title="Waiting to sync" footer={status}>
        {loadError ? (
          <SettingsRow icon="cloud-alert-outline" title="Outbox unavailable" subtitle={loadError} />
        ) : entries.length === 0 ? (
          <SettingsRow icon="cloud-check-outline" title="Everything is synced" />
        ) : (
          entries.map((entry, index) => {
            const { title, destination } = describeEntry(entry);
            return (
              <Fragment key={entry.id}>
                {index > 0 ? <RowSeparator /> : null}
                <SettingsRow
                  icon={
                    entry.kind === 'github-issue'
                      ? 'github'
                      : entry.kind === 'jira-issue'
                        ? 'jira'
                        : entry.kind === 'attachment' && !entry.lastError
                          ? 'paperclip'
                          : entry.lastError
                            ? 'cloud-alert-outline'
                            : 'cloud-upload-outline'
                  }
                  title={title}
                  subtitle={entry.lastError ? `${destination} · ${entry.lastError}` : destination}
                  onPress={() => setDiscard(entry)}
                />
              </Fragment>
            );
          })
        )}
      </SettingsGroup>

      {entries.length > 0 ? (
        <SettingsGroup>
          <SettingsActionRow
            title={syncing ? 'Syncing…' : 'Sync now'}
            onPress={() => void syncNow()}
            loading={syncing}
            variant="filled"
            androidIcon="cloud-upload-outline"
          />
        </SettingsGroup>
      ) : null}

      <NativeAlert
        visible={discard != null}
        title="Discard this item?"
        message={
          discard
            ? `"${describeEntry(discard).title}" hasn't been sent yet. Discarding deletes it from this device for good.`
            : ''
        }
        confirmLabel="Discard"
        dismissLabel="Keep"
        onDismiss={() => setDiscard(null)}
        onConfirm={() => {
          const entry = discard;
          setDiscard(null);
          if (!entry) return;
          void discardQueued(entry.id)
            .then(() => {
              if (entry.kind === 'task') void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
            })
            .catch((error: unknown) => setDiscardError(error instanceof Error ? error.message : 'Try again.'));
        }}
      />
      <NativeAlert
        visible={discardError != null}
        title="Could not discard item"
        message={discardError ?? ''}
        onDismiss={() => setDiscardError(null)}
      />
    </SettingsScreen>
  );
}
