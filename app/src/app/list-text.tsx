import { useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { createTask, deleteTask, updateTask } from '@/api/tasks';
import { TextStats } from '@/components/tasks/markdown-notes';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { useTaskLists, useTasks } from '@/hooks/use-tasks';
import { haptics } from '@/lib/haptics';
import { diffListText, summarize, type ListOp } from '@/lib/list-diff';
import { queryKeys } from '@/lib/query-client';
import { addToRecycleBin } from '@/lib/recycle-bin';
import { parseMarkdownLists, tasksToMarkdown } from '@/lib/task-text';
import { ScrollView, Text, TextInput, View } from '@/tw';

function randomUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Karui's "edit tab as text": the whole list as a Markdown checklist. Tick
 * with [x], indent for checklist items, add lines, delete lines. Saving shows
 * what will change first; deleted to-dos go to the recycle bin.
 */
export default function ListTextScreen() {
  const { colors } = useTheme();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ listId?: string }>();
  const listId = typeof params.listId === 'string' ? params.listId : '';
  const listsQuery = useTaskLists();
  const tasksQuery = useTasks();
  const list = listsQuery.data?.find((l) => l.id === listId);
  const tasks = useMemo(() => (tasksQuery.data ?? []).filter((task) => task.list_id === listId), [listId, tasksQuery.data]);
  const original = useMemo(() => tasksToMarkdown(tasks), [tasks]);
  const [text, setText] = useState<string | null>(null);
  const value = text ?? original;
  const [pending, setPending] = useState<ListOp[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function review() {
    const edited = parseMarkdownLists(value, list?.name ?? 'List').flatMap((group) => group.tasks);
    const ops = diffListText(tasks, edited);
    if (ops.length === 0) {
      router.back();
      return;
    }
    setPending(ops);
  }

  async function apply(ops: ListOp[]) {
    setPending(null);
    setBusy(true);
    let failed = 0;
    const uids = new Map<string, string>();
    for (const op of ops) if (op.kind === 'create') uids.set(op.key, randomUuid());
    const deleted = [];
    for (const op of ops) {
      try {
        if (op.kind === 'create') {
          await createTask({
            list_id: listId,
            uid: uids.get(op.key),
            title: op.item.title,
            markdown: op.item.notes || undefined,
            completed: op.item.completed,
            tags: op.item.tags,
            sort_order: op.sortOrder,
            parent_uid: op.parentUid ?? (op.parentKey ? (uids.get(op.parentKey) ?? null) : null),
          });
        } else if (op.kind === 'update') {
          await updateTask(op.task.id, op.patch, op.task.account_id);
        } else {
          await deleteTask(op.task.id, op.task.account_id, op.task.etag);
          deleted.push(op.task);
        }
      } catch {
        failed += 1;
      }
    }
    await addToRecycleBin(deleted).catch(() => {});
    await client.invalidateQueries({ queryKey: queryKeys.tasks });
    setBusy(false);
    if (failed) {
      setError(`${failed} change${failed === 1 ? '' : 's'} didn't go through. Check your connection and try again.`);
      return;
    }
    haptics.success();
    router.back();
  }

  const counts = pending ? summarize(pending) : null;

  return (
    <SheetSurface title={list?.name ?? 'Edit as text'} subtitle="One line per to-do. [x] is done, indent for checklist items.">
      <Stack.Screen options={{ title: 'Edit as text' }} />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: colors.bg3, borderRadius: 20, borderCurve: 'continuous', padding: 14 }}>
          <TextInput
            value={value}
            onChangeText={setText}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
            placeholder={'- [ ] first thing\n- [ ] second thing\n  - [ ] a step'}
            placeholderTextColor={colors.text3}
            accessibilityLabel="List as text"
            className="text-sf-text"
            style={{ minHeight: 320, fontSize: 15, lineHeight: 22, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
          />
          <TextStats text={value} color={colors.text3} />
        </View>
        <Button label={busy ? 'Saving…' : 'Save'} loading={busy} disabled={busy || !listId} onPress={review} />
        <Text className="text-sf-text-3 text-xs">
          Lines are matched to to-dos by title. Changing a title replaces the to-do with a new one.
        </Text>
      </ScrollView>
      <NativeAlert
        visible={pending != null}
        title="Save these changes?"
        message={
          counts
            ? [
                counts.created ? `${counts.created} new` : null,
                counts.updated ? `${counts.updated} changed` : null,
                counts.deleted ? `${counts.deleted} deleted (kept in the recycle bin for 30 days)` : null,
              ]
                .filter(Boolean)
                .join('\n')
            : ''
        }
        confirmLabel="Save"
        dismissLabel="Keep editing"
        onDismiss={() => setPending(null)}
        onConfirm={() => pending && void apply(pending)}
      />
      <NativeAlert visible={error != null} title="Edit as text" message={error ?? ''} onDismiss={() => setError(null)} />
    </SheetSurface>
  );
}
