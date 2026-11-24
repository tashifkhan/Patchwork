import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { router } from 'expo-router';
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, TextInput as RNTextInput } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TaskList } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { DateField } from '@/components/tasks/date-field';
import { LiveMarkdownInput } from '@/components/tasks/live-markdown-input';
import { MarkdownViewer } from '@/components/tasks/markdown-viewer';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { FIELD_CLEARANCE, KeyboardScrollView, useKeyboardLift } from '@/components/ui/keyboard';
import { LoadingSpinner } from '@/components/ui/loading';
import { RiseIn } from '@/components/ui/motion';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { haptics } from '@/lib/haptics';
import { EXPAND_IN, COLLAPSE_OUT, expandLayout, PAISA } from '@/lib/motion';
import { listTone } from '@/lib/smart-lists';
import { withAlpha } from '@/lib/theme';
import { blockMinutes, formatLength, withEnd, withStart } from '@/lib/time-block';
import { atDay } from '@/lib/when';
import { ScrollView, Text, View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
const REDUCE = { reduceMotion: ReduceMotion.System } as const;

const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'long' });
const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "4:00" and "PM" apart, the way the reference sets them. */
function splitTime(date: Date): { time: string; period: string } {
  const parts = clock.formatToParts(date);
  const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
  const time = parts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim();
  return { time, period };
}

export interface TaskComposerProps {
  title: string;
  onTitle: (value: string) => void;
  notes: string;
  onNotes: (value: string) => void;
  lists: TaskList[];
  listId: string;
  onList: (id: string) => void;
  /** Opens the full destination picker (other accounts, GitHub repositories). */
  onMoreDestinations: () => void;
  tags: string[];
  onPickTags: () => void;
  dueAt: string | null;
  startAt: string | null;
  onSchedule: (next: { due_at: string | null; start_at: string | null }) => void;
  reminderAt: string | null;
  onReminder: (value: string | null) => void;
  priority: number | null;
  priorities: { label: string; value: number | null }[];
  onPriority: (value: number | null) => void;
  checklist: string[];
  onRemoveChecklist: (index: number) => void;
  checklistDraft: string;
  onChecklistDraft: (value: string) => void;
  onAddChecklist: () => void;
  ai: { write: () => void; dictate: () => void; camera: () => void; photo: () => void };
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  calendarChoice: ReactNode;
}

/**
 * Android "Create new task": a tonal header block in the chosen list's colour
 * holding the title and date, then start and end time, description, the list
 * as category chips, and a pinned Create task button. Material 3 Expressive
 * throughout: underlined fields that thicken on focus, filter chips that pop,
 * a header that recolours as the list changes, and buttons that give under a
 * finger. Reminder, priority, checklist and the AI tools sit under More options.
 */
export function TaskComposer(props: TaskComposerProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const dark = scheme === 'dark';
  const listIndex = Math.max(0, props.lists.findIndex((l) => l.id === props.listId));
  const { fill, ink } = listTone(colors, dark, listIndex);
  const [picking, setPicking] = useState<'date' | 'start' | 'end' | null>(null);
  const [more, setMore] = useState(false);
  const footer = useKeyboardLift(insets.bottom, 0);

  // The header eases into the new list's colour.
  const headerStyle = useAnimatedStyle(() => ({ backgroundColor: withTiming(fill, { duration: 320 }) }), [fill]);

  const due = props.dueAt ? new Date(props.dueAt) : null;
  const start = props.startAt ? new Date(props.startAt) : null;
  const end = start && due ? due : null;
  const minutes = blockMinutes({ start_at: props.startAt, due_at: props.dueAt });

  function moveToDay(day: Date) {
    const nextDue = atDay(day, props.dueAt);
    let nextStart: string | null = null;
    if (start) {
      const s = new Date(day);
      s.setHours(start.getHours(), start.getMinutes(), 0, 0);
      nextStart = s.toISOString();
    }
    props.onSchedule({ due_at: nextDue, start_at: nextStart });
  }

  function setTime(which: 'start' | 'end', date: Date) {
    const value = { start_at: props.startAt, due_at: props.dueAt };
    const next = (which === 'start' ? withStart : withEnd)(value, date.getHours(), date.getMinutes());
    props.onSchedule(next);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardScrollView
        bottomOffset={80 + FIELD_CLEARANCE}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* Header block */}
        <Animated.View
          style={[
            {
              paddingTop: insets.top + 8,
              paddingHorizontal: 24,
              paddingBottom: 28,
              borderBottomLeftRadius: 44,
              borderBottomRightRadius: 44,
              borderCurve: 'continuous',
            },
            headerStyle,
          ]}>
          <RoundButton icon="arrow-left" label="Back" ink={ink} onPress={() => router.back()} />
          <RiseIn>
            <Text style={{ fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.8, color: ink, marginTop: 18 }}>
              Create new task
            </Text>
          </RiseIn>

          <UnderlineField label="Title" ink={ink} style={{ marginTop: 22 }}>
            {(focus) => (
              <RNTextInput
                value={props.title}
                onChangeText={props.onTitle}
                autoFocus
                placeholder="What needs doing?"
                placeholderTextColor={withAlpha(ink, 0.45)}
                accessibilityLabel="Title"
                onFocus={() => focus(true)}
                onBlur={() => focus(false)}
                style={{ fontSize: 19, color: ink, paddingVertical: 6, paddingHorizontal: 0 }}
              />
            )}
          </UnderlineField>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginTop: 18 }}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => {
                haptics.tap();
                setPicking('date');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Date, ${due ? dateLabel.format(due) : 'none'}. Change`}>
              <UnderlineField label="Date" ink={ink}>
                {() => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                    <Text style={{ flex: 1, fontSize: 19, color: due ? ink : withAlpha(ink, 0.45) }}>
                      {due ? dateLabel.format(due) : 'No date'}
                    </Text>
                    {due ? (
                      <Pressable
                        hitSlop={10}
                        onPress={() => {
                          haptics.tap();
                          props.onSchedule({ due_at: null, start_at: null });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Clear date">
                        <MaterialCommunityIcons name="close" size={20} color={withAlpha(ink, 0.7)} />
                      </Pressable>
                    ) : (
                      <MaterialCommunityIcons name="chevron-down" size={22} color={withAlpha(ink, 0.7)} />
                    )}
                  </View>
                )}
              </UnderlineField>
            </Pressable>
            <CalendarFab onPress={() => setPicking('date')} />
          </View>
        </Animated.View>

        {/* Body */}
        <View style={{ paddingHorizontal: 24, paddingTop: 26, gap: 26 }}>
          <View style={{ flexDirection: 'row', gap: 24 }}>
            <TimeColumn label="Start time" date={start} onPress={() => setPicking('start')} />
            <TimeColumn label="End time" date={end} onPress={() => setPicking('end')} />
          </View>
          {start ? (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -14 }}>
              <MaterialCommunityIcons name="timer-outline" size={16} color={colors.text2} />
              <Text style={{ flex: 1, fontSize: 14, color: colors.text2 }}>
                {minutes ? `${formatLength(minutes)} block` : ''}
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  haptics.tap();
                  props.onSchedule({ due_at: props.dueAt, start_at: null });
                }}
                accessibilityRole="button">
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>Clear times</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <AiAction icon="creation" label="Write with AI" onPress={props.ai.write} showLabel />
            <AiAction icon="microphone-outline" label="Dictate" onPress={props.ai.dictate} />
            <AiAction icon="camera-outline" label="Camera" onPress={props.ai.camera} />
            <AiAction icon="image-outline" label="Photo" onPress={props.ai.photo} />
          </View>
          <DescriptionField value={props.notes} onChange={props.onNotes} />

          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 16, color: colors.text2 }}>Category</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {props.lists.map((list, i) => (
                <CategoryChip
                  key={list.id}
                  label={list.name}
                  index={i}
                  selected={list.id === props.listId}
                  onPress={() => props.onList(list.id)}
                />
              ))}
              <CategoryChip label="More" icon="dots-horizontal" index={-1} selected={false} onPress={props.onMoreDestinations} />
            </View>
          </View>

          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 16, color: colors.text2 }}>Tags</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {props.tags.map((tag) => (
                <Pressable key={tag} onPress={props.onPickTags} accessibilityLabel={`Tag ${tag}, edit tags`}>
                  <View style={{ height: 32, paddingHorizontal: 14, borderRadius: 8, justifyContent: 'center', backgroundColor: colors.selectionBg }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSelectionBg }}>{tag}</Text>
                  </View>
                </Pressable>
              ))}
              <Pressable
                onPress={props.onPickTags}
                accessibilityRole="button"
                accessibilityLabel={props.tags.length ? 'Edit tags' : 'Add tags'}
                style={{ height: 32, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.gray2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialCommunityIcons name="tag-plus-outline" size={18} color={colors.accent} />
                <Text style={{ fontSize: 14, color: colors.text }}>{props.tags.length ? 'Edit' : 'Add tags'}</Text>
              </Pressable>
            </View>
          </View>

          {/* More options */}
          <Animated.View layout={expandLayout()} style={{ borderRadius: 28, backgroundColor: colors.bg3, overflow: 'hidden' }}>
            <Pressable
              onPress={() => {
                haptics.tap();
                setMore((v) => !v);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: more }}
              android_ripple={{ color: withAlpha(colors.text, 0.08) }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, minHeight: 60 }}>
              <MaterialCommunityIcons name="tune-variant" size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>More options</Text>
                <Text numberOfLines={1} style={{ fontSize: 13, color: colors.text2 }}>
                  Reminder, priority, checklist
                </Text>
              </View>
              <Turning open={more} />
            </Pressable>
            {more ? (
              <Animated.View entering={EXPAND_IN} exiting={COLLAPSE_OUT} style={{ paddingHorizontal: 20, paddingBottom: 18, gap: 18 }}>
                <DateField label="Reminder" iconName="bell-outline" value={props.reminderAt} onChange={props.onReminder} />
                {props.calendarChoice}
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <MaterialCommunityIcons name="signal-cellular-2" size={20} color={colors.accent} />
                    <Text className="text-sf-text text-base">Priority</Text>
                  </View>
                  <SegmentedChoice options={props.priorities} value={props.priority} onChange={props.onPriority} />
                </View>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text2 }}>Checklist</Text>
                  {props.checklist.map((item, index) => (
                    <Animated.View key={`${item}-${index}`} entering={FadeIn.duration(180)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
                      <MaterialCommunityIcons name="checkbox-blank-circle-outline" size={20} color={colors.gray2} style={{ width: 32 }} />
                      <Text style={{ flex: 1, fontSize: 16, color: colors.text }}>{item}</Text>
                      <Pressable hitSlop={10} onPress={() => props.onRemoveChecklist(index)} accessibilityRole="button" accessibilityLabel={`Remove ${item}`}>
                        <MaterialCommunityIcons name="close" size={18} color={colors.text3} />
                      </Pressable>
                    </Animated.View>
                  ))}
                  <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
                    <MaterialCommunityIcons name="plus" size={22} color={colors.accent} style={{ width: 32 }} />
                    <RNTextInput
                      value={props.checklistDraft}
                      onChangeText={props.onChecklistDraft}
                      onSubmitEditing={props.onAddChecklist}
                      submitBehavior="submit"
                      placeholder="Add checklist item"
                      placeholderTextColor={colors.text3}
                      returnKeyType="next"
                      accessibilityLabel="Add checklist item"
                      style={{ flex: 1, fontSize: 16, color: colors.text, paddingVertical: 8 }}
                    />
                  </View>
                </View>
              </Animated.View>
            ) : null}
          </Animated.View>
        </View>
      </KeyboardScrollView>

      {footer.marker}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: insets.bottom,
            paddingHorizontal: 24,
            paddingVertical: 12,
            backgroundColor: colors.bg,
          },
          footer.style,
        ]}>
        <CreateButton disabled={!props.canSubmit} submitting={props.submitting} onPress={props.onSubmit} />
      </Animated.View>

      {picking === 'date' ? (
        <DateTimePicker
          mode="date"
          presentation="dialog"
          accentColor={colors.accent}
          value={due ?? new Date()}
          onValueChange={(_e, selected) => {
            setPicking(null);
            haptics.selection();
            moveToDay(selected);
          }}
          onDismiss={() => setPicking(null)}
        />
      ) : null}
      {picking === 'start' || picking === 'end' ? (
        <DateTimePicker
          mode="time"
          presentation="dialog"
          accentColor={colors.accent}
          value={(picking === 'start' ? start : end) ?? new Date(new Date().setMinutes(0, 0, 0) + 3_600_000)}
          onValueChange={(_e, selected) => {
            const which = picking;
            setPicking(null);
            haptics.selection();
            setTime(which, selected);
          }}
          onDismiss={() => setPicking(null)}
        />
      ) : null}
    </View>
  );
}

type Selection = { start: number; end: number };

/** Markdown actions for the toolbar: wrap the selection, or start the current line. */
const FORMATS: { icon: IconName; label: string; wrap?: [string, string]; line?: string }[] = [
  { icon: 'format-header-pound', label: 'Heading', line: '## ' },
  { icon: 'format-bold', label: 'Bold', wrap: ['**', '**'] },
  { icon: 'format-italic', label: 'Italic', wrap: ['*', '*'] },
  { icon: 'format-list-bulleted', label: 'Bullet list', line: '- ' },
  { icon: 'checkbox-marked-outline', label: 'Checklist', line: '- [ ] ' },
  { icon: 'link-variant', label: 'Link', wrap: ['[', '](https://)'] },
  { icon: 'code-tags', label: 'Code', wrap: ['`', '`'] },
];

function applyFormat(text: string, sel: Selection, format: (typeof FORMATS)[number]): { text: string; sel: Selection } {
  if (format.wrap) {
    const [open, close] = format.wrap;
    const picked = text.slice(sel.start, sel.end);
    const next = text.slice(0, sel.start) + open + picked + close + text.slice(sel.end);
    const cursor = sel.start + open.length + picked.length;
    return { text: next, sel: { start: picked ? cursor + close.length : sel.start + open.length, end: picked ? cursor + close.length : sel.start + open.length } };
  }
  const prefix = format.line ?? '';
  const lineStart = text.lastIndexOf('\n', sel.start - 1) + 1;
  // Pressing it again on a line that already has it takes it off.
  if (text.startsWith(prefix, lineStart)) {
    const next = text.slice(0, lineStart) + text.slice(lineStart + prefix.length);
    const at = Math.max(lineStart, sel.start - prefix.length);
    return { text: next, sel: { start: at, end: at } };
  }
  const next = text.slice(0, lineStart) + prefix + text.slice(lineStart);
  return { text: next, sel: { start: sel.start + prefix.length, end: sel.end + prefix.length } };
}

/**
 * Markdown notes. Write shows the markdown styled as you type (headings grow,
 * bold goes bold, markers dim) with a formatting toolbar under it; Preview
 * shows it fully rendered.
 */
function DescriptionField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [sel, setSel] = useState<Selection>({ start: value.length, end: value.length });
  const [controlled, setControlled] = useState<Selection | undefined>(undefined);
  const input = useRef<RNTextInput>(null);
  const focused = useSharedValue(0);
  const line = useAnimatedStyle(() => ({ height: 1 + focused.value, opacity: 0.25 + 0.75 * focused.value }));

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 13, color: colors.text2 }}>Description</Text>
        <View style={{ flexDirection: 'row', borderRadius: 16, backgroundColor: colors.bg3, padding: 2 }}>
          {(['write', 'preview'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                haptics.selection();
                setMode(m);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              style={{ height: 28, paddingHorizontal: 12, borderRadius: 14, justifyContent: 'center', backgroundColor: mode === m ? colors.selectionBg : 'transparent' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: mode === m ? colors.onSelectionBg : colors.text2 }}>
                {m === 'write' ? 'Write' : 'Preview'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {mode === 'write' ? (
        <Animated.View key="write" entering={FadeIn.duration(160)} style={{ gap: 8 }}>
          <LiveMarkdownInput
            value={value}
            onChangeText={onChange}
            placeholder="Add notes, links, details. Markdown works."
            placeholderTextColor={colors.text3}
            accessibilityLabel="Description"
            ref={input}
            selection={controlled}
            onSelectionChange={(e) => {
              setSel(e.nativeEvent.selection);
              if (controlled) setControlled(undefined);
            }}
            onFocus={() => focused.set(withTiming(1, { duration: 180 }))}
            onBlur={() => focused.set(withTiming(0, { duration: 180 }))}
            style={{ minHeight: 52 }}
          />
          <Animated.View style={[{ backgroundColor: colors.text }, line]} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 4 }}>
            {FORMATS.map((format) => (
              <Pressable
                key={format.label}
                onPress={() => {
                  haptics.tap();
                  const next = applyFormat(value, sel, format);
                  onChange(next.text);
                  setSel(next.sel);
                  setControlled(next.sel);
                  // Typing carries on in the notes, after the new markers.
                  input.current?.focus();
                }}
                accessibilityRole="button"
                accessibilityLabel={format.label}
                android_ripple={{ color: withAlpha(colors.text, 0.1), borderless: true, radius: 20 }}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name={format.icon} size={20} color={colors.text2} />
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      ) : (
        <Animated.View key="preview" entering={FadeIn.duration(160)} style={{ minHeight: 52, borderRadius: 20, backgroundColor: colors.bg3, padding: 16 }}>
          {value.trim() ? (
            <MarkdownViewer markdown={value} />
          ) : (
            <Text style={{ fontSize: 15, color: colors.text3 }}>Nothing to preview yet.</Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

/** A label over a value with an underline that thickens and takes the ink colour on focus. */
function UnderlineField({
  label,
  ink,
  muted,
  style,
  children,
}: {
  label: string;
  ink: string;
  muted?: string;
  style?: object;
  children: (focus: (on: boolean) => void) => React.ReactNode;
}) {
  const focused = useSharedValue(0);
  const line = useAnimatedStyle(() => ({
    height: 1 + focused.value,
    opacity: 0.25 + 0.75 * focused.value,
  }));
  return (
    <View style={style}>
      <Text style={{ fontSize: 13, color: muted ?? withAlpha(ink, 0.65) }}>{label}</Text>
      {children((on) => focused.set(withTiming(on ? 1 : 0, { duration: 180 })))}
      <Animated.View style={[{ backgroundColor: ink }, line]} />
    </View>
  );
}

function TimeColumn({ label, date, onPress }: { label: string; date: Date | null; onPress: () => void }) {
  const { colors } = useTheme();
  const parts = date ? splitTime(date) : null;
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${date ? clock.format(date) : 'not set'}. Change`}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ fontSize: 13, color: colors.text2 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
        <Animated.Text
          key={parts?.time ?? 'none'}
          entering={FadeIn.duration(180)}
          style={{ flex: 1, fontSize: 22, fontWeight: '500', color: parts ? colors.text : colors.text3, fontVariant: ['tabular-nums'] }}>
          {parts?.time ?? '--:--'}
        </Animated.Text>
        {parts?.period ? <Text style={{ fontSize: 16, color: colors.text2, marginRight: 6 }}>{parts.period}</Text> : null}
        <MaterialCommunityIcons name="chevron-down" size={20} color={colors.text2} />
      </View>
      <View style={{ height: 1, backgroundColor: colors.separator }} />
    </Pressable>
  );
}

/** The round accent button beside the date. */
function CalendarFab({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const press = useElasticPress({ maxStretch: 0.1, maxTranslate: 2, pressedScale: 0.9 });
  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel="Pick a date"
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          overflow: 'hidden',
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 6px 14px ${withAlpha(colors.accent, 0.35)}`,
        }}>
        <PressGlow press={press} color={withAlpha('#FFFFFF', 0.25)} radius={32} />
        <MaterialCommunityIcons name="calendar-blank-outline" size={26} color={colors.onAccent} />
      </Pressable>
    </Animated.View>
  );
}

function RoundButton({ icon, label, ink, onPress }: { icon: IconName; label: string; ink: string; onPress: () => void }) {
  const press = useElasticPress({ maxStretch: 0.08, maxTranslate: 2, pressedScale: 0.9 });
  return (
    <Animated.View {...press.handlers} style={[press.style, { alignSelf: 'flex-start', marginLeft: -12 }]}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <PressGlow press={press} color={withAlpha(ink, 0.14)} radius={24} size={24} />
        <MaterialCommunityIcons name={icon} size={24} color={ink} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * M3 filter chip for a list. Chosen: filled in the list's colour with a check
 * that pops in; the chip's corners tighten as it's picked.
 */
function CategoryChip({
  label,
  index,
  selected,
  icon,
  onPress,
}: {
  label: string;
  index: number;
  selected: boolean;
  icon?: IconName;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const swatch = index >= 0 ? listTone(colors, scheme === 'dark', index) : null;
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.set(withSpring(selected ? 1 : 0, { ...PAISA.expand, ...REDUCE }));
  }, [selected, on]);
  const shape = useAnimatedStyle(() => ({ borderRadius: 20 - 8 * on.value }));
  const check = useAnimatedStyle(() => ({ width: 22 * on.value, opacity: on.value, transform: [{ scale: on.value }] }));
  const press = useElasticPress({ maxStretch: 0.06, maxTranslate: 1.5, pressedScale: 0.93 });
  const ink = selected && swatch ? swatch.ink : colors.text;
  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.selection();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={label}>
        <Animated.View
          style={[
            {
              height: 40,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              overflow: 'hidden',
              backgroundColor: selected && swatch ? swatch.fill : colors.bg3,
              borderWidth: selected ? 0 : 1,
              borderColor: colors.separator,
            },
            shape,
          ]}>
          <Animated.View style={[{ overflow: 'hidden' }, check]}>
            <MaterialCommunityIcons name="check" size={18} color={ink} />
          </Animated.View>
          {icon ? <MaterialCommunityIcons name={icon} size={18} color={colors.text2} style={{ marginRight: 4 }} /> : null}
          <Text style={{ fontSize: 14, fontWeight: '600', color: ink }}>{label}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function AiAction({ icon, label, onPress, showLabel }: { icon: IconName; label: string; onPress: () => void; showLabel?: boolean }) {
  const { colors } = useTheme();
  const ink = showLabel ? colors.onSelectionBg : colors.accent;
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => ({
        height: 40,
        minWidth: 40,
        paddingHorizontal: showLabel ? 14 : 0,
        borderRadius: pressed ? 12 : 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        overflow: 'hidden',
        backgroundColor: showLabel ? colors.selectionBg : colors.bg3,
      })}>
      <MaterialCommunityIcons name={icon} size={showLabel ? 18 : 22} color={ink} />
      {showLabel ? <Text style={{ fontSize: 14, fontWeight: '500', color: ink }}>{label}</Text> : null}
    </Pressable>
  );
}

function Turning({ open }: { open: boolean }) {
  const { colors } = useTheme();
  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    turn.set(withSpring(open ? 1 : 0, { ...PAISA.arrow, ...REDUCE }));
  }, [open, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));
  return (
    <Animated.View style={style}>
      <MaterialCommunityIcons name="chevron-down" size={22} color={colors.text2} />
    </Animated.View>
  );
}

/** The wide filled Create task button. Its corners tighten while held (M3 Expressive). */
function CreateButton({ disabled, submitting, onPress }: { disabled: boolean; submitting: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const press = useElasticPress({ maxStretch: 0.02, maxTranslate: 1.5, pressedScale: 0.97 });
  const corner = useAnimatedStyle(() => ({ borderRadius: 30 - 14 * press.glow.value }));
  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          if (disabled) return;
          haptics.impact('medium');
          onPress();
        }}
        onPressOut={press.release}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: submitting }}
        accessibilityLabel="Create task">
        <Animated.View
          style={[
            {
              height: 60,
              overflow: 'hidden',
              backgroundColor: colors.accent,
              opacity: disabled ? 0.45 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            },
            corner,
          ]}>
          <PressGlow press={press} color={withAlpha('#FFFFFF', 0.2)} radius={30} size={60} />
          {submitting ? <LoadingSpinner size={22} /> : null}
          <Text style={{ color: colors.onAccent, fontSize: 18, fontWeight: '700' }}>{submitting ? 'Creating…' : 'Create task'}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
