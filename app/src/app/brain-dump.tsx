import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, type TextInput as RNTextInput } from 'react-native';

import { sortBrainDump } from '@/api/ai';
import { ApiError } from '@/api/client';
import { MarkdownViewer } from '@/components/tasks/markdown-viewer';
import { TextStats } from '@/components/tasks/markdown-notes';
import { ListPicker } from '@/components/tasks/list-picker';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { ElasticPressable, RiseIn, Swap, TurningChevron, useSpringValue } from '@/components/ui/motion';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { COLLAPSE_OUT, EXPAND_IN, expandLayout, PAISA } from '@/lib/motion';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { SortProgress } from '@/components/brain-dump/sort-progress';
import type { SortStep, StepState } from '@/components/brain-dump/sort-progress-types';
import { VoiceDumpSheet } from '@/components/brain-dump/voice-dump-sheet';
import { GlassIconButton, GlassPillButton } from '@/components/ui/glass-button';
import { useLiquidGlass } from '@/components/ui/glass-surface';
import { BRAIN_DUMP_LIST, isBrainDumpList, useSaveRawDump } from '@/hooks/use-save-raw-dump';
import { useCreateTask, useTaskLists, useTasks } from '@/hooks/use-tasks';
import { haptics } from '@/lib/haptics';
import { flattenTasks } from '@/lib/task-buckets';
import { useAiStagingStore } from '@/stores/ai-staging-store';
import { todayKey, unsortedText, useBrainDumpStore, type DumpDay } from '@/stores/brain-dump-store';
import { useSettingsStore } from '@/stores/settings-store';
import { KeyboardScrollView } from '@/components/ui/keyboard';
import { Text, TextInput, View } from '@/tw';

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
  const append = useBrainDumpStore((s) => s.append);
  const entry: DumpDay | undefined = days[today];
  const text = entry?.text ?? '';
  const pending = unsortedText(entry);

  const listsQuery = useTaskLists();
  const tasksQuery = useTasks();
  const createTask = useCreateTask();
  const setStaged = useAiStagingStore((s) => s.setStaged);
  const aiDefaultListId = useSettingsStore((s) => s.aiDefaultListId);
  const remindersOn = useSettingsStore((s) => s.brainDumpReminders);

  const saveRawDump = useSaveRawDump();
  // The raw dumps live in their own list, so to-dos never get filed there.
  const lists = useMemo(
    () => (listsQuery.data ?? []).filter((list) => !list.is_deck && !isBrainDumpList(list)),
    [listsQuery.data]
  );
  const tags = useMemo(
    () => [...new Set(flattenTasks(tasksQuery.data ?? []).flatMap((task) => task.tags))].sort(),
    [tasksQuery.data]
  );
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<SortStep[] | null>(null);
  // After a sort the actions come back while an alert may be opening; a slide
  // gets frozen part-way under it on Android, so the return is a plain fade.
  const [sortedOnce, setSortedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNoteFor, setSaveNoteFor] = useState<DumpDay | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const input = useRef<RNTextInput>(null);

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
    setMessage(null);
    const sentText = text;
    const fallback = lists.find((list) => list.id === aiDefaultListId)?.id ?? lists[0]?.id ?? null;
    const mark = (key: string, state: StepState) =>
      setSteps((current) => current?.map((step) => (step.key === key ? { ...step, state } : step)) ?? null);
    setSteps([
      {
        key: 'raw',
        label: `Saving the raw dump to ${BRAIN_DUMP_LIST}`,
        doneLabel: `Raw dump saved to ${BRAIN_DUMP_LIST}`,
        failedLabel: "Couldn't save the raw dump",
        short: { working: 'Saving dump', done: 'Dump saved', failed: 'Not saved' },
        state: 'working',
      },
      {
        key: 'ai',
        label: 'Finding to-dos and notes',
        doneLabel: 'To-dos and notes found',
        failedLabel: "Couldn't sort it",
        short: { working: 'Finding to-dos', done: 'To-dos found', failed: "Couldn't sort" },
        state: 'working',
      },
    ]);

    // The raw text is saved whatever the AI makes of it, word for word.
    const raw = saveRawDump(today, sentText, fallback).then(
      () => {
        mark('raw', 'done');
        return null;
      },
      (cause: unknown) => {
        mark('raw', 'failed');
        return cause instanceof Error ? cause.message : 'Unknown error';
      }
    );

    try {
      const result = await sortBrainDump({ text: pending, available_lists: lists, available_tags: tags });
      mark('ai', 'done');
      markSorted(today, {
        note: mergeNotes(entry?.note ?? null, result.note),
        taskCount: (entry?.taskCount ?? 0) + result.tasks.length,
        sentText,
      });
      const rawError = await raw;
      haptics.success();
      // Let the checks land before the review screen covers them.
      await new Promise((resolve) => setTimeout(resolve, 650));
      if (rawError) setError(`Your to-dos are fine, but the raw dump didn't save: ${rawError}`);
      if (result.tasks.length > 0) {
        setStaged(result.tasks.map((task) => ({ ...task, list_id: task.list_id ?? fallback })));
        router.push('/ai-review');
      } else {
        setMessage(`No to-dos in there. The note has it all, and the raw dump is in ${BRAIN_DUMP_LIST}.`);
      }
    } catch (cause) {
      mark('ai', 'failed');
      const rawError = await raw;
      haptics.error();
      setError(
        (cause instanceof ApiError ? cause.message : 'Could not reach your AI model. Check AI import in Settings.') +
          (rawError ? '' : ` The raw dump is saved in ${BRAIN_DUMP_LIST}.`)
      );
    } finally {
      setBusy(false);
      setSortedOnce(true);
      setSteps(null);
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

  const thoughts = pending ? pending.split('\n').filter((line) => line.trim()).length : 0;
  const shortDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());

  /** Starts a new line with a prompt word and puts the cursor after it. */
  function startLine(prompt: string) {
    haptics.selection();
    const next = text.trim() ? `${text.replace(/\s+$/, '')}\n${prompt}: ` : `${prompt}: `;
    setText(today, next);
    requestAnimationFrame(() => input.current?.focus());
  }

  return (
    <SheetSurface title="Brain dump" subtitle="Everything on your mind. Sort it when you're done.">
      <Stack.Screen options={{ title: 'Brain dump' }} />
      <KeyboardScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 20, gap: 16, paddingTop: 8 }}>
        {/* Where you are: the day, and how much is waiting to be sorted. */}
        <RiseIn>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <InfoChip icon="calendar-today" label={shortDate} />
            {thoughts ? (
              <Animated.View entering={ZoomIn.springify().damping(PAISA.arrow.damping).stiffness(PAISA.arrow.stiffness)}>
                <InfoChip icon="lightbulb-on-outline" label={`${thoughts} to sort`} tone="accent" />
              </Animated.View>
            ) : entry?.sortedAt ? (
              <InfoChip icon="check-all" label="All sorted" />
            ) : null}
          </View>
        </RiseIn>

        <RiseIn index={1}>
          <DumpCard focused={focused} sorting={busy}>
            <TextInput
              ref={input}
              value={text}
              onChangeText={(next) => setText(today, next)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              multiline
              placeholder="What's on your mind?"
              placeholderTextColor={colors.text3}
              textAlignVertical="top"
              accessibilityLabel="Brain dump for today"
              className="text-sf-text"
              style={{ fontSize: 18, lineHeight: 26, minHeight: text.trim() ? 160 : 72, paddingVertical: 4 }}
            />
            {text.trim() ? (
              <View className="flex-row items-center justify-between">
                <TextStats text={text} color={colors.text3} />
                {entry?.sortedAt && pending ? (
                  <Text style={{ fontSize: 12, color: colors.text3 }}>Only new lines get sorted</Text>
                ) : null}
              </View>
            ) : (
              // M3 suggestion chips: a nudge for an empty page.
              <Animated.View entering={EXPAND_IN} exiting={COLLAPSE_OUT} style={{ gap: 8 }}>
                <Text style={{ fontSize: 13, color: colors.text2 }}>Start with</Text>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {PROMPTS.map((prompt) => (
                    <SuggestionChip key={prompt.label} icon={prompt.icon} label={prompt.label} onPress={() => startLine(prompt.label)} />
                  ))}
                </View>
              </Animated.View>
            )}
          </DumpCard>
        </RiseIn>

        {message ? (
          <Animated.View entering={EXPAND_IN} exiting={COLLAPSE_OUT}>
            <Text style={{ fontSize: 14, color: colors.text2, paddingHorizontal: 4 }}>{message}</Text>
          </Animated.View>
        ) : null}

        {entry?.note ? (
          // A fresh sort springs the note in; later sorts swap it in place.
          <Animated.View entering={ZoomIn.springify().damping(PAISA.rise.damping).stiffness(PAISA.rise.stiffness)} layout={expandLayout()}>
            <Swap swapKey={entry.sortedAt ?? 0}>
              <NoteCard day={entry} onSave={() => setSaveNoteFor(entry)} />
            </Swap>
          </Animated.View>
        ) : null}

        {!remindersOn ? (
          <RiseIn index={2}>
            <ElasticPressable
              variant="card"
              radius={20}
              onPress={() => router.push('/settings/productivity')}
              accessibilityRole="button"
              style={{ borderRadius: 20, backgroundColor: colors.bg3, padding: 16, overflow: 'hidden' }}>
              <View className="flex-row items-center" style={{ gap: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.selectionBg, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="bell-ring-outline" size={22} color={colors.onSelectionBg} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Make it a habit</Text>
                  <Text style={{ fontSize: 14, color: colors.text2 }}>A nudge each morning and night</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.text3} />
              </View>
            </ElasticPressable>
          </RiseIn>
        ) : null}

        {past.length > 0 ? (
          <View style={{ gap: 8, paddingTop: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent, paddingHorizontal: 4 }}>Earlier</Text>
            <View style={{ gap: 2 }}>
              {past.map((day, index) => {
                const top = index === 0 ? 20 : 4;
                const bottom = index === past.length - 1 ? 20 : 4;
                const [, mo, d] = day.day.split('-').map(Number);
                return (
                  <RiseIn key={day.day} index={index} fromScale={0.98} rise={8}>
                    <Animated.View
                      layout={expandLayout()}
                      style={{
                        backgroundColor: colors.bg3,
                        borderTopLeftRadius: top,
                        borderTopRightRadius: top,
                        borderBottomLeftRadius: bottom,
                        borderBottomRightRadius: bottom,
                        overflow: 'hidden',
                      }}>
                      <ElasticPressable
                        variant="card"
                        radius={top}
                        onPress={() => {
                          haptics.tap();
                          setOpenDay((open) => (open === day.day ? null : day.day));
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: openDay === day.day }}
                        style={{ minHeight: 64, justifyContent: 'center', paddingHorizontal: 16 }}>
                        <View className="flex-row items-center" style={{ gap: 16 }}>
                          {/* Date tile, like a calendar leaf. */}
                          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.selectionBg, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.onSelectionBg, lineHeight: 17 }}>{d}</Text>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.onSelectionBg, lineHeight: 12 }}>
                              {new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(2024, mo - 1, 1))}
                            </Text>
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text numberOfLines={1} style={{ fontSize: 16, color: colors.text }}>
                              {day.note?.title ?? day.text.split('\n')[0]}
                            </Text>
                            <Text style={{ fontSize: 14, color: colors.text2 }}>
                              {dayLabel(day.day)}
                              {day.taskCount ? ` · ${day.taskCount} to-do${day.taskCount === 1 ? '' : 's'}` : ''}
                            </Text>
                          </View>
                          <TurningChevron expanded={openDay === day.day} color={colors.text3} />
                        </View>
                      </ElasticPressable>
                      {openDay === day.day ? (
                        <Animated.View entering={EXPAND_IN} exiting={COLLAPSE_OUT} style={{ gap: 12, padding: 16, paddingTop: 0 }}>
                          {day.note ? <NoteCard day={day} onSave={() => setSaveNoteFor(day)} /> : null}
                          <Text selectable style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }}>
                            {day.text}
                          </Text>
                        </Animated.View>
                      ) : null}
                    </Animated.View>
                  </RiseIn>
                );
              })}
            </View>
          </View>
        ) : null}
      </KeyboardScrollView>

      {/* Pinned actions: talk it out any time; Sort joins once there's something new.
          While sorting, a progress card takes their place. */}
      {steps ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <SortProgress title={`Sorting ${thoughts} thought${thoughts === 1 ? '' : 's'}`} steps={steps} />
        </Animated.View>
      ) : (
        <View className="flex-row items-center" style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 12 }}>
          <Animated.View layout={expandLayout()} style={pending ? undefined : { flex: 1 }}>
            <VoiceButton
              compact={Boolean(pending)}
              disabled={busy}
              onPress={() => {
                Keyboard.dismiss();
                haptics.tap();
                setVoiceOpen(true);
              }}
            />
          </Animated.View>
          {pending ? (
            <Animated.View
              layout={expandLayout()}
              entering={
                sortedOnce
                  ? FadeIn.duration(180)
                  : SlideInRight.springify().damping(PAISA.rise.damping).stiffness(PAISA.rise.stiffness)
              }
              exiting={FadeOut.duration(120)}
              style={{ flex: 1 }}>
              <SortButton disabled={busy} count={thoughts} onPress={() => void sort()} />
            </Animated.View>
          ) : null}
        </View>
      )}

      <VoiceDumpSheet
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onAdd={(lines) => {
          append(lines);
          const added = lines.split('\n').length;
          setMessage(`Added ${added} thought${added === 1 ? '' : 's'} from your voice note.`);
        }}
      />

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

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const PROMPTS: { label: string; icon: IconName }[] = [
  { label: 'Errands', icon: 'cart-outline' },
  { label: 'Work', icon: 'briefcase-outline' },
  { label: 'Ideas', icon: 'lightbulb-outline' },
  { label: 'Follow-ups', icon: 'account-arrow-right-outline' },
  { label: 'On my mind', icon: 'head-heart-outline' },
];

/** The writing surface: lights up with a 2dp accent outline while focused, on a spring. */
/**
 * The writing surface: lights up with a 2dp accent outline while focused, on
 * a spring. On iOS, while the AI reads it, the outline cycles through the
 * Apple Intelligence colours with a soft matching glow, the way Writing Tools
 * marks the text it is working on.
 */
function DumpCard({ focused, sorting, children }: { focused: boolean; sorting: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  const on = useSpringValue(focused ? 1 : 0, 'expand');
  const glow = useSharedValue(0);
  const thinking = useSpringValue(sorting && Platform.OS === 'ios' ? 1 : 0, 'expand');
  useEffect(() => {
    if (sorting && Platform.OS === 'ios') {
      glow.set(0);
      glow.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false));
    } else {
      cancelAnimation(glow);
    }
  }, [glow, sorting]);
  const ring = useAnimatedStyle(() => {
    const hue = interpolateColor(glow.get(), [0, 0.25, 0.5, 0.75, 1], AI_GLOW);
    const t = thinking.get();
    return {
      borderColor: t > 0.01 ? hue : withAlphaWorklet(colors.accent, on.get()),
      shadowColor: hue,
      shadowOpacity: 0.55 * t,
      shadowRadius: 18 * t,
      shadowOffset: { width: 0, height: 0 },
    };
  });
  return (
    <Animated.View
      style={[
        { backgroundColor: colors.bg3, borderRadius: 28, borderCurve: 'continuous', borderWidth: 2, padding: 18, gap: 12 },
        ring,
      ]}>
      {children}
    </Animated.View>
  );
}

/** Apple Intelligence's blue, purple, pink and orange, back to blue for a seamless loop. */
const AI_GLOW = ['#4FA8FF', '#B76CFF', '#FF5A8A', '#FF9F43', '#4FA8FF'];

/** Fades a #RRGGBB colour on the UI thread (Reanimated can't call the JS helper). */
function withAlphaWorklet(color: string, alpha: number) {
  'worklet';
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(color);
  if (!m) return alpha > 0.5 ? color : 'transparent';
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** M3 assist chip for status: 32dp, 8dp corners, leading icon. */
function InfoChip({ icon, label, tone = 'neutral' }: { icon: IconName; label: string; tone?: 'neutral' | 'accent' }) {
  const { colors } = useTheme();
  const accent = tone === 'accent';
  return (
    <View
      className="flex-row items-center"
      style={{
        height: 32,
        paddingLeft: 8,
        paddingRight: 12,
        gap: 6,
        borderRadius: 8,
        backgroundColor: accent ? colors.selectionBg : 'transparent',
        borderWidth: accent ? 0 : 1,
        borderColor: colors.gray2,
      }}>
      <MaterialCommunityIcons name={icon} size={18} color={accent ? colors.onSelectionBg : colors.accent} />
      <Text style={{ fontSize: 14, fontWeight: '500', color: accent ? colors.onSelectionBg : colors.text }}>{label}</Text>
    </View>
  );
}

/** M3 suggestion chip: outlined, 8dp corners that round out under the finger. */
function SuggestionChip({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <ElasticPressable
      variant="control"
      radius={8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Start a line about ${label}`}
      style={({ pressed }) => ({
        height: 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 8,
        paddingRight: 12,
        borderRadius: pressed ? 16 : 8,
        borderWidth: 1,
        borderColor: colors.gray2,
        overflow: 'hidden',
      })}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
      <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{label}</Text>
    </ElasticPressable>
  );
}

/**
 * M3 Expressive tonal button for voice capture. Alone it's a wide "Talk it
 * out" button; next to Sort it folds into a 56dp mic that squares off
 * while held.
 */
function VoiceButton({ compact, disabled, onPress }: { compact: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const glass = useLiquidGlass();
  if (glass) {
    // iOS 26: clear interactive glass, a capsule alone and a circle next to Sort.
    return compact ? (
      <GlassIconButton sf="mic.fill" icon="microphone-outline" label="Talk out a brain dump" size={50} symbolColor={colors.accent} onPress={onPress} />
    ) : (
      <GlassPillButton label="Talk it out" sf="mic.fill" disabled={disabled} accessibilityLabel="Talk out a brain dump" onPress={onPress} />
    );
  }
  return (
    <ElasticPressable
      variant="control"
      radius={28}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Talk out a brain dump"
      style={({ pressed }) => ({
        height: 56,
        minWidth: 56,
        paddingHorizontal: compact ? 0 : 24,
        borderRadius: pressed ? 16 : 28,
        backgroundColor: colors.selectionBg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        overflow: 'hidden',
        opacity: disabled ? 0.5 : 1,
      })}>
      <MaterialCommunityIcons name="microphone-outline" size={24} color={colors.onSelectionBg} />
      {compact ? null : (
        <Animated.Text
          entering={FadeIn.duration(160).delay(80)}
          exiting={FadeOut.duration(80)}
          style={{ fontSize: 16, fontWeight: '600', color: colors.onSelectionBg }}>
          Talk it out
        </Animated.Text>
      )}
    </ElasticPressable>
  );
}

/**
 * M3 Expressive large filled button (56dp, full round, squaring off while
 * held). The label counts what will be sorted. Progress shows in its own
 * card while sorting, so the button never has to pretend to be a spinner.
 */
function SortButton({ disabled, count, onPress }: { disabled: boolean; count: number; onPress: () => void }) {
  const { colors } = useTheme();
  const glass = useLiquidGlass();
  const label = count ? `Sort ${count} thought${count === 1 ? '' : 's'}` : 'Sort';
  const a11y = `Sort ${count} thought${count === 1 ? '' : 's'} into to-dos and notes, and save the raw dump to ${BRAIN_DUMP_LIST}`;
  if (glass) {
    // iOS 26: accent-tinted glass, the screen's one prominent action.
    return <GlassPillButton prominent sf="sparkles" disabled={disabled} label={label} accessibilityLabel={a11y} onPress={onPress} />;
  }
  return (
    <ElasticPressable
      variant="control"
      radius={28}
      glow="rgba(255,255,255,0.22)"
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => ({
        height: 56,
        borderRadius: pressed ? 16 : 28,
        backgroundColor: colors.accent,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        overflow: 'hidden',
      })}>
      <MaterialCommunityIcons name="creation" size={22} color={colors.onAccent} />
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onAccent }}>{label}</Text>
    </ElasticPressable>
  );
}
