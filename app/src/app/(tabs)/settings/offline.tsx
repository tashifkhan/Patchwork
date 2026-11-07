import { Fragment, useEffect, useState } from 'react';

import {
  RowSeparator,
  SettingsActionRow,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
} from '@/components/settings/settings-list';
import { NativeAlert } from '@/components/ui/native-alert';
import { useTaskLists } from '@/hooks/use-tasks';
import { useConnectivityStore } from '@/lib/connectivity';
import { LOCAL_ACCOUNT_ID } from '@/lib/local-tasks';
import { describeEntry, loadOutbox, removeEntry, useOutboxStore, type OutboxEntry } from '@/lib/outbox';
import { flushOutbox, type FlushResult } from '@/lib/outbox-sync';
import { queryClient, queryKeys } from '@/lib/query-client';

/**
 * On-device lists and the outbox: everything saved while offline that hasn't
 * reached its account, GitHub or Jira yet.
 */
export default function OfflineSettingsScreen() {
  const entries = useOutboxStore((s) => s.entries);
  const quality = useConnectivityStore((s) => s.quality);
  const listsQuery = useTaskLists();
  const localLists = (listsQuery.data ?? []).filter((list) => list.account_id === LOCAL_ACCOUNT_ID);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<FlushResult | null>(null);
  const [discard, setDiscard] = useState<OutboxEntry | null>(null);

  useEffect(() => {
    void loadOutbox();
  }, []);

  async function syncNow() {
    setSyncing(true);
    setResult(null);
    try {
      setResult(await flushOutbox({ retryFailed: true }));
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
        {entries.length === 0 ? (
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
          void removeEntry(entry.id).then(() => {
            if (entry.kind === 'task') void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
          });
        }}
      />
    </SettingsScreen>
  );
}
