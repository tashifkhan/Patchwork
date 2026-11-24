import { useEffect, useMemo, useState } from 'react';

import type { TaskList } from '@/api/types';
import {
  RowSeparator,
  SettingsActionRow,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
} from '@/components/settings/settings-list';
import { ListPicker } from '@/components/tasks/list-picker';
import { NativeAlert } from '@/components/ui/native-alert';
import { useRestoreTasks, useTaskLists } from '@/hooks/use-tasks';
import { emptyRecycleBin, loadRecycleBin, useRecycleBinStore, type BinEntry } from '@/lib/recycle-bin';
import Animated from 'react-native-reanimated';
import { COLLAPSE_OUT, listPlacement } from '@/lib/motion';

// Hermes on Android has no Intl.RelativeTimeFormat, so this is spelled out.
function deletedAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * Deleted to-dos from the last 30 days. Tap one to put it back; if its list
 * is gone, pick another one.
 */
export default function RecycleBinScreen() {
  const entries = useRecycleBinStore((s) => s.entries);
  const listsQuery = useTaskLists();
  const restore = useRestoreTasks();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [rehome, setRehome] = useState<BinEntry[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadRecycleBin();
  }, []);

  const lists = useMemo(() => (listsQuery.data ?? []).filter((list) => !list.is_deck), [listsQuery.data]);
  const listIds = useMemo(() => new Set(lists.map((list) => list.id)), [lists]);

  async function putBack(targets: BinEntry[], listId?: string) {
    setMessage(null);
    // Entries whose list is gone wait for the picker; the rest go home now.
    const orphaned = listId || !listsQuery.data ? [] : targets.filter((entry) => !listIds.has(entry.task.list_id));
    const ready = targets.filter((entry) => !orphaned.includes(entry));
    if (orphaned.length > 0) setRehome(orphaned);
    if (ready.length === 0) return;
    const result = await restore.mutateAsync({ entries: ready, listId });
    setMessage(
      result.failed
        ? `Restored ${result.restored}. ${result.failed} could not be restored. Check your connection and try again.`
        : `Restored ${result.restored} to-do${result.restored === 1 ? '' : 's'}.${orphaned.length ? ` Pick a list for the other ${orphaned.length}.` : ''}`
    );
  }

  return (
    <SettingsScreen>
      <SettingsGroup
        title="Deleted to-dos"
        footer={
          message ??
          'Deleted to-dos stay here for 30 days. Tap one to restore it to its list. Restored to-dos get their checklist back if it is still on the server.'
        }>
        {entries.length === 0 ? (
          <SettingsRow icon="trash-can-outline" title="Nothing here" subtitle="Deleted to-dos show up here" />
        ) : (
          entries.map((entry, index) => (
            // Restored rows leave and the rest close the gap, on Paisa's list spring.
            <Animated.View key={entry.id} layout={listPlacement()} exiting={COLLAPSE_OUT}>
              {index > 0 ? <RowSeparator /> : null}
              <SettingsRow
                icon={entry.task.completed ? 'check-circle-outline' : 'restore'}
                title={entry.task.title}
                subtitle={`${entry.listName}${listIds.has(entry.task.list_id) ? '' : ' (list deleted)'} · ${deletedAgo(entry.deletedAt)}`}
                disabled={restore.isPending}
                onPress={() => void putBack([entry])}
              />
            </Animated.View>
          ))
        )}
      </SettingsGroup>

      {entries.length > 0 ? (
        <SettingsGroup>
          <SettingsActionRow
            title={restore.isPending ? 'Restoring…' : 'Restore all'}
            loading={restore.isPending}
            onPress={() => void putBack(entries)}
            androidIcon="restore"
          />
          <RowSeparator />
          <SettingsActionRow title="Empty recycle bin" destructive onPress={() => setConfirmEmpty(true)} />
        </SettingsGroup>
      ) : null}

      <ListPicker
        visible={rehome != null}
        lists={lists}
        selectedId={null}
        title="Restore to"
        onSelect={(list: TaskList) => {
          const targets = rehome;
          setRehome(null);
          if (targets) void putBack(targets, list.id);
        }}
        onClose={() => setRehome(null)}
      />

      <NativeAlert
        visible={confirmEmpty}
        title="Empty the recycle bin?"
        message={`${entries.length} to-do${entries.length === 1 ? '' : 's'} will be gone for good.`}
        confirmLabel="Empty"
        dismissLabel="Cancel"
        onDismiss={() => setConfirmEmpty(false)}
        onConfirm={() => {
          setConfirmEmpty(false);
          void emptyRecycleBin();
        }}
      />
    </SettingsScreen>
  );
}
