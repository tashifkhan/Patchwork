import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Keyboard, Pressable } from 'react-native';

import { sortBrainDump } from '@/api/ai';
import { ApiError } from '@/api/client';
import { MarkdownViewer } from '@/components/tasks/markdown-viewer';
import { TextStats } from '@/components/tasks/markdown-notes';
import { ListPicker } from '@/components/tasks/list-picker';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { useCreateTask, useTaskLists, useTasks } from '@/hooks/use-tasks';
import { haptics } from '@/lib/haptics';
import { flattenTasks } from '@/lib/task-buckets';
import { useAiStagingStore } from '@/stores/ai-staging-store';
import { todayKey, unsortedText, useBrainDumpStore, type DumpDay } from '@/stores/brain-dump-store';
import { useSettingsStore } from '@/stores/settings-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

const longDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

function dayLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return key === todayKey() ? 'Today' : longDay.format(date);
}

/**
 * Brain dump. Type everything on your mind, in any order. "Sort" sends the
 * new part of today's page to your AI model, which splits it into to-dos
 * (you review them before anything is saved) and a note for the rest.
 */
export default function BrainDumpScreen() {
  const { colors } = useTheme();
  const today = todayKey();
  const days = useBrainDumpStore((s) => s.days);
  const setText = useBrainDumpStore((s) => s.setText);
  const markSorted = useBrainDumpStore((s) => s.markSorted);
  const entry: DumpDay | undefined = days[today];
  const text = entry?.text ?? '';
  const pending = unsortedText(entry);

  const listsQuery = useTaskLists();
  const tasksQuery = useTasks();
  const createTask = useCreateTask();
  const setStaged = useAiStagingStore((s) => s.setStaged);
  const aiDefaultListId = useSettingsStore((s) => s.aiDefaultListId);
  const remindersOn = useSettingsStore((s) => s.brainDumpReminders);

  const lists = useMemo(() => (listsQuery.data ?? []).filter((list) => !list.is_deck), [listsQuery.data]);
  const tags = useMemo(
    () => [...new Set(flattenTasks(tasksQuery.data ?? []).flatMap((task) => task.tags))].sort(),
    [tasksQuery.data]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNoteFor, setSaveNoteFor] = useState<DumpDay | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const past = useMemo(
    () =>
      Object.values(days)
        .filter((day) => day.day !== today && (day.text.trim() || day.note))
        .sort((a, b) => (a.day < b.day ? 1 : -1)),
    [days, today]
  );

  async function sort() {
    if (!pending) return;
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    const sentText = text;
    try {
      const result = await sortBrainDump({ text: pending, available_lists: lists, available_tags: tags });
      const fallback = lists.find((list) => list.id === aiDefaultListId)?.id ?? lists[0]?.id ?? null;
      markSorted(today, {
        note: mergeNotes(entry?.note ?? null, result.note),
        taskCount: (entry?.taskCount ?? 0) + result.tasks.length,
        sentText,
      });
      haptics.success();
      if (result.tasks.length > 0) {
        setStaged(result.tasks.map((task) => ({ ...task, list_id: task.list_id ?? fallback })));
        router.push('/ai-review');
      } else {
        setMessage('No to-dos in there, so it all went into the note.');
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not reach your AI model. Check AI import in Settings.');
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(day: DumpDay, listId: string) {
    if (!day.note) return;
    try {
      await createTask.mutateAsync({ list_id: listId, title: day.note.title, markdown: day.note.markdown });
      haptics.success();
      setMessage(`Saved "${day.note.title}" as a to-do.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save the note.');
    }
  }

  return (
    <SheetSurface title="Brain dump" subtitle="Everything on your mind. Sort it when you're done.">
      <Stack.Screen options={{ title: 'Brain dump' }} />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20, gap: 16, paddingTop: 12 }}>
        <View style={{ backgroundColor: colors.bg3, borderRadius: 24, borderCurve: 'continuous', padding: 16, gap: 6 }}>
          <Text className="text-sf-text-2 text-xs font-semibold uppercase" style={{ letterSpacing: 0.8 }}>
            {dayLabel(today)}
          </Text>
          <TextInput
            value={text}
            onChangeText={(next) => setText(today, next)}
            multiline
            placeholder={'call the landlord about the leak\nidea: weekly review on sundays?\nbuy a birthday gift for sam before friday\nfeeling behind on the report…'}
            placeholderTextColor={colors.text3}
            textAlignVertical="top"
            accessibilityLabel="Brain dump for today"
            className="text-sf-text"
            style={{ fontSize: 17, lineHeight: 24, minHeight: 180, paddingVertical: 4 }}
          />
          {text.trim() ? <TextStats text={text} color={colors.text3} /> : null}
        </View>

        <Button
          label={busy ? 'Sorting…' : pending ? 'Sort into to-dos and notes' : entry?.sortedAt ? 'All sorted' : 'Sort into to-dos and notes'}
          icon="creation"
          loading={busy}
          disabled={!pending || busy}
          onPress={() => void sort()}
        />
        {entry?.sortedAt && pending ? (
          <Text className="text-sf-text-3 text-xs">Only what you added since the last sort goes to the AI.</Text>
        ) : null}
        {message ? <Text className="text-sf-text-2 text-sm">{message}</Text> : null}

        {entry?.note ? (
          <NoteCard day={entry} onSave={() => setSaveNoteFor(entry)} />
        ) : null}

        {!remindersOn ? (
          <Pressable
            onPress={() => router.push('/settings/productivity')}
            accessibilityRole="button"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <View className="flex-row items-center gap-3" style={{ minHeight: 48 }}>
              <MaterialCommunityIcons name="bell-plus-outline" size={20} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600', flex: 1 }}>
                Remind me to brain dump each morning and night
              </Text>
            </View>
          </Pressable>
        ) : null}

        {past.length > 0 ? (
          <View className="gap-1">
            <Text className="text-sf-text text-lg font-semibold" style={{ paddingTop: 8 }}>
              Earlier
            </Text>
            {past.map((day) => (
              <View key={day.day}>
                <Pressable
                  onPress={() => setOpenDay((open) => (open === day.day ? null : day.day))}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: openDay === day.day }}
                  style={{ minHeight: 52, justifyContent: 'center' }}>
                  <View className="flex-row items-center gap-3">
                    <View style={{ flex: 1 }}>
                      <Text className="text-sf-text text-base">{dayLabel(day.day)}</Text>
                      <Text className="text-sf-text-3 text-xs" numberOfLines={1}>
                        {day.note?.title ?? day.text.split('\n')[0]}
                        {day.taskCount ? ` · ${day.taskCount} to-do${day.taskCount === 1 ? '' : 's'}` : ''}
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name={openDay === day.day ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={colors.text3}
                    />
                  </View>
                </Pressable>
                {openDay === day.day ? (
                  <View className="gap-3 pb-3">
                    {day.note ? <NoteCard day={day} onSave={() => setSaveNoteFor(day)} /> : null}
                    <Text selectable className="text-sf-text-2 text-sm">
                      {day.text}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <ListPicker
        visible={saveNoteFor != null}
        lists={lists}
        selectedId={null}
        title="Save note to"
        onSelect={(list) => {
          const day = saveNoteFor;
          setSaveNoteFor(null);
          if (day) void saveNote(day, list.id);
        }}
        onClose={() => setSaveNoteFor(null)}
      />
      <NativeAlert
        visible={error != null}
        title="Brain dump"
        message={error ?? ''}
        onDismiss={() => setError(null)}
      />
    </SheetSurface>
  );
}

function NoteCard({ day, onSave }: { day: DumpDay; onSave: () => void }) {
  const { colors } = useTheme();
  if (!day.note) return null;
  return (
    <View
      style={{
        borderRadius: 28,
        borderCurve: 'continuous',
        padding: 16,
        gap: 8,
        backgroundColor: colors.primaryContainer,
      }}>
      <View className="flex-row items-center gap-2">
        <MaterialCommunityIcons name="note-text-outline" size={18} color={colors.onPrimaryContainer} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.onPrimaryContainer }}>
          {day.note.title}
        </Text>
        <Pressable onPress={onSave} hitSlop={8} accessibilityRole="button" accessibilityLabel="Save note as a to-do">
          <MaterialCommunityIcons name="content-save-outline" size={20} color={colors.onPrimaryContainer} />
        </Pressable>
      </View>
      <MarkdownViewer markdown={day.note.markdown} compact />
    </View>
  );
}

/** A second sort the same day adds to the note instead of replacing it. */
function mergeNotes(
  previous: DumpDay['note'],
  next: DumpDay['note']
): DumpDay['note'] {
  if (!previous) return next;
  if (!next) return previous;
  return { title: previous.title, markdown: `${previous.markdown}\n\n${next.markdown}` };
}
