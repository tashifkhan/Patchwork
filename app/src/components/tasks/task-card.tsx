import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { router } from 'expo-router';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  Platform,
  Pressable,
  View as RNViewBase,
  type TextInput as RNTextInput,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Task, TaskCreate, TaskList, TaskUpdate } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { MarkdownNotes } from '@/components/tasks/markdown-notes';
import { TaskCheckbox } from '@/components/tasks/task-checkbox';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING, SPRING } from '@/lib/motion';
import { normalizeTags } from '@/lib/tags';
import { atDay, describeWhen, quickWhen, type QuickWhen } from '@/lib/when';
import { useTagPickerStore } from '@/stores/tag-picker-store';
import { Text, TextInput, View } from '@/tw';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** What the card hands back when it closes. The screen owns the mutations. */
export type TaskCardResult =
  | { kind: 'create'; payload: TaskCreate; checklist: string[] }
  | { kind: 'update'; task: Task; patch: TaskUpdate }
  | { kind: 'none' };

export interface TaskCardHandle {
  /** Save whatever changed and close. Safe to call more than once. */
  commit: () => void;
  /** Close without saving (new to-do discard). */
  discard: () => void;
  /** Current destination list, for the floating Move control. */
  listId: () => string;
  setListId: (listId: string) => void;
  /** Current field values, for handing a new to-do off to the full editor. */
  draft: () => {
    title: string;
    notes: string;
    tags: string[];
    due: string | null;
    listId: string;
    checklist: string[];
  };
}

interface TaskCardProps {
  ref?: Ref<TaskCardHandle>;
  /** `null` creates a new to-do. */
  task: Task | null;
  lists: TaskList[];
  defaultListId: string;
  defaultTags?: string[];
  availableTags: string[];
  onClose: (result: TaskCardResult) => void;
  onToggleComplete?: (task: Task) => void;
  onToggleChild?: (child: Task) => void;
  onAddChild?: (task: Task, title: string) => void;
  /** Reports the card's on-screen top and bottom so the list can scroll it into view. */
  onPlaced?: (top: number, bottom: number) => void;
  /** New to-dos only: open the full add dialog (AI and photo import live there). */
  onOpenAi?: () => void;
}

const SPATIAL = LinearTransition.springify()
  .damping(SPRING.spatialSlow.damping)
  .stiffness(SPRING.spatialSlow.stiffness);

/** Card lifts out of the row: fades in while springing up from 94%. */
function cardEntering() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.94 }] },
    animations: {
      opacity: withTiming(1, { duration: DURATION.short4 }),
      transform: [{ scale: withSpring(1, SPRING.spatial) }],
    },
  };
}

/**
 * Things 3's signature interaction: tapping a to-do opens it in place as a
 * raised card instead of navigating away. Title and notes are editable inline,
 * the checklist, tags and date appear only once they have a value, and the
 * footer offers buttons for whatever is still unset.
 *
 * Styled as an M3 Expressive container: a 28dp-radius elevated surface that
 * springs open, with tonal chips and an expressive checkbox.
 */
export function TaskCard({
  ref,
  task,
  lists,
  defaultListId,
  defaultTags = [],
  availableTags,
  onClose,
  onToggleComplete,
  onToggleChild,
  onAddChild,
  onPlaced,
  onOpenAi,
}: TaskCardProps) {
  const { colors, scheme } = useTheme();
  const isNew = task == null;

  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.markdown ?? '');
  const [tags, setTags] = useState<string[]>(task?.tags ?? defaultTags);
  const [due, setDue] = useState<string | null>(task?.due_at ?? null);
  const [listId, setListId] = useState(task?.list_id ?? defaultListId);
  const [draftChecklist, setDraftChecklist] = useState<string[]>([]);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState('');
  const [whenOpen, setWhenOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const closed = useRef(false);
  const checklistInput = useRef<RNTextInput>(null);
  const cardView = useRef<RNViewBase>(null);
  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (placeTimer.current) clearTimeout(placeTimer.current);
    },
    []
  );

  const openTagPicker = useTagPickerStore((s) => s.open);

  function buildResult(): TaskCardResult {
    const trimmed = title.trim();
    const cleanTags = normalizeTags(tags);
    const pendingItem = checklistDraft.trim();
    const checklist = pendingItem ? [...draftChecklist, pendingItem] : draftChecklist;
    if (isNew) {
      if (!trimmed) return { kind: 'none' };
      return {
        kind: 'create',
        payload: {
          list_id: listId,
          title: trimmed,
          markdown: notes.trim() || undefined,
          tags: cleanTags,
          due_at: due,
        },
        checklist,
      };
    }
    const patch: TaskUpdate = {};
    if (trimmed && trimmed !== task.title) patch.title = trimmed;
    if (notes !== task.markdown) patch.markdown = notes;
    if (cleanTags.join('\u0000') !== normalizeTags(task.tags).join('\u0000')) patch.tags = cleanTags;
    if (due !== task.due_at) patch.due_at = due;
    if (listId !== task.list_id) patch.list_id = listId;
    if (pendingItem && onAddChild) onAddChild(task, pendingItem);
    if (Object.keys(patch).length === 0) return { kind: 'none' };
    return { kind: 'update', task, patch: { ...patch, etag: task.etag } };
  }

  function commit() {
    if (closed.current) return;
    closed.current = true;
    onClose(buildResult());
  }

  function discard() {
    if (closed.current) return;
    closed.current = true;
    onClose({ kind: 'none' });
  }

  useImperativeHandle(ref, () => ({
    commit,
    discard,
    listId: () => listId,
    setListId,
    draft: () => ({ title, notes, tags, due, listId, checklist: draftChecklist }),
  }));

  function chooseTags() {
    haptics.tap();
    const pool = normalizeTags([...availableTags, ...tags]).sort((a, b) => a.localeCompare(b));
    openTagPicker(pool, tags, setTags);
    router.push('/tags');
  }

  function chooseWhen(kind: QuickWhen) {
    haptics.selection();
    setDue(quickWhen(kind, due));
    setWhenOpen(false);
  }

  function addChecklistItem() {
    const value = checklistDraft.trim();
    if (!value) return;
    haptics.tap();
    setChecklistDraft('');
    if (task && onAddChild) onAddChild(task, value);
    else setDraftChecklist((items) => [...items, value]);
    // Keep the field focused so items can be typed in a row, like Things.
    requestAnimationFrame(() => checklistInput.current?.focus());
  }

  const when = describeWhen(due);
  const children = task?.children ?? [];
  const showChecklist = checklistOpen || children.length > 0 || draftChecklist.length > 0;
  const listName = lists.find((l) => l.id === listId)?.name ?? task?.list_name ?? 'List';
  // Tags follow the Material You accent (tonal selection color) rather than a
  // fixed hue, so they match the filter chips and the wallpaper palette.
  const tagTint = colors.selectionBg;
  const tagInk = colors.onSelectionBg;

  return (
    <Animated.View
      entering={cardEntering}
      exiting={FadeOut.duration(DURATION.short3).easing(EASING.emphasizedAccelerate)}
      layout={SPATIAL}
      // Swallow touches on the card's own padding so they don't reach the
      // screen-level "tap outside to close" handler behind it.
      onStartShouldSetResponder={() => true}
      style={{
        marginHorizontal: -6,
        marginVertical: 10,
        paddingHorizontal: 6,
        paddingTop: 6,
        paddingBottom: 10,
        borderRadius: 28,
        borderCurve: 'continuous',
        backgroundColor: colors.bg3,
        boxShadow:
          scheme === 'dark'
            ? '0 10px 28px rgba(0,0,0,0.55)'
            : '0 10px 30px rgba(20,20,40,0.14), 0 2px 6px rgba(20,20,40,0.06)',
      }}>
      {/* Plain view that fills the card, used only to measure it. Layout-animated
          views don't fire onLayout reliably, so this does it for them. */}
      <RNViewBase
        ref={cardView}
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        onLayout={() => {
          // Runs on open and whenever the card grows (date chips, checklist
          // items). The screen only scrolls when part of the card is hidden.
          if (!onPlaced) return;
          if (placeTimer.current) clearTimeout(placeTimer.current);
          // Wait for the spring so we measure the settled frame.
          placeTimer.current = setTimeout(() => {
            cardView.current?.measureInWindow((_x, y, _w, h) => onPlaced(y, y + h));
          }, DURATION.medium2);
        }}
      />
      {/* Title row */}
      <View className="flex-row items-center">
        <TaskCheckbox
          checked={task?.completed ?? false}
          onToggle={() => {
            if (!task || !onToggleComplete) return;
            // Completing moves the row to another section and remounts it,
            // so save what was typed before the toggle reshuffles the list.
            commit();
            onToggleComplete(task);
          }}
          label={task?.completed ? 'Mark incomplete' : 'Mark complete'}
        />
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="New To-Do"
          placeholderTextColor={colors.text3}
          autoFocus={isNew}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={isNew ? commit : undefined}
          accessibilityLabel="Title"
          className="text-sf-text flex-1 pr-4"
          style={{ fontSize: 18, fontWeight: '600', paddingVertical: 8 }}
        />
      </View>

      {/* Notes: rendered Markdown, tap to edit */}
      <MarkdownNotes
        value={notes}
        onChangeText={setNotes}
        style={{ marginLeft: 44, marginRight: 16 }}
        inputStyle={{ fontSize: 16, lineHeight: 22 }}
      />

      {/* Checklist */}
      {showChecklist ? (
        <Animated.View
          entering={FadeIn.duration(DURATION.medium1)}
          layout={SPATIAL}
          style={{ marginLeft: 44, marginRight: 12, marginTop: 8 }}>
          {children.map((child) => (
            <ChecklistRow
              key={child.id}
              title={child.title}
              checked={child.completed}
              onToggle={() => onToggleChild?.(child)}
            />
          ))}
          {draftChecklist.map((item, index) => (
            <ChecklistRow
              key={`${item}-${index}`}
              title={item}
              checked={false}
              onRemove={() => setDraftChecklist((items) => items.filter((_, i) => i !== index))}
            />
          ))}
          <View
            className="flex-row items-center"
            style={{ minHeight: 44 }}>
            <MaterialCommunityIcons name="plus" size={20} color={colors.accent} style={{ width: 28 }} />
            <TextInput
              ref={checklistInput}
              value={checklistDraft}
              onChangeText={setChecklistDraft}
              onSubmitEditing={addChecklistItem}
              submitBehavior="submit"
              autoFocus={checklistOpen && children.length === 0 && draftChecklist.length === 0}
              placeholder="Add checklist item"
              placeholderTextColor={colors.text3}
              returnKeyType="next"
              accessibilityLabel="Add checklist item"
              className="text-sf-text flex-1"
              style={{ fontSize: 16, paddingVertical: 10 }}
            />
          </View>
        </Animated.View>
      ) : null}

      {/* Tags */}
      {tags.length > 0 ? (
        <Animated.View
          entering={FadeIn.duration(DURATION.medium1)}
          layout={SPATIAL}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginLeft: 44,
            marginRight: 12,
            marginTop: 12,
          }}>
          {tags.map((tag) => (
            <Pressable
              key={tag}
              onPress={chooseTags}
              accessibilityRole="button"
              accessibilityLabel={`Tag ${tag}, edit tags`}>
              <View
                style={{
                  backgroundColor: tagTint,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 999,
                }}>
                <Text style={{ color: tagInk, fontSize: 14, fontWeight: '600' }}>{tag}</Text>
              </View>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}

      {/* When / deadline */}
      {when ? (
        <Animated.View entering={FadeIn.duration(DURATION.medium1)} layout={SPATIAL}>
          <Pressable
            onPress={() => {
              haptics.tap();
              setWhenOpen((open) => !open);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Due ${when.label}${when.hint ? `, ${when.hint}` : ''}. Change date`}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <View
              className="flex-row items-center gap-2.5"
              style={{ marginLeft: 44, marginRight: 12, marginTop: 14, minHeight: 32 }}>
              <MaterialCommunityIcons
                name={when.isToday ? 'star' : when.overdue ? 'flag' : 'flag-variant'}
                size={20}
                color={when.isToday ? '#F5C400' : when.overdue ? colors.red : colors.text}
              />
              <Text className="text-sf-text" style={{ fontSize: 16, fontWeight: '500' }}>
                {when.label}
              </Text>
              {when.hint ? (
                <Text style={{ fontSize: 15, color: when.overdue ? colors.red : colors.text2 }}>
                  {when.hint}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      ) : null}

      {whenOpen ? (
        <Animated.View
          entering={FadeIn.duration(DURATION.short4)}
          exiting={FadeOut.duration(DURATION.short3)}
          layout={SPATIAL}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginLeft: 44,
            marginRight: 12,
            marginTop: 10,
          }}>
          <WhenChip icon="star" iconColor="#F5C400" label="Today" onPress={() => chooseWhen('today')} />
          <WhenChip icon="weather-sunset-up" label="Tomorrow" onPress={() => chooseWhen('tomorrow')} />
          <WhenChip icon="calendar-arrow-right" label="Next week" onPress={() => chooseWhen('next-week')} />
          <WhenChip
            icon="calendar-month-outline"
            label="Pick date"
            onPress={() => {
              haptics.tap();
              setPickerOpen(true);
            }}
          />
          {due ? (
            <WhenChip
              icon="close"
              label="Clear"
              iconColor={colors.red}
              onPress={() => {
                haptics.selection();
                setDue(null);
                setWhenOpen(false);
              }}
            />
          ) : null}
        </Animated.View>
      ) : null}

      {pickerOpen ? (
        <View style={{ marginTop: 8, paddingHorizontal: 8 }}>
          <DateTimePicker
            mode="date"
            presentation={Platform.OS === 'android' ? 'dialog' : undefined}
            display={Platform.OS === 'ios' ? 'inline' : undefined}
            accentColor={colors.accent}
            value={due ? new Date(due) : new Date()}
            onValueChange={(_event, selected) => {
              setDue(atDay(selected, due));
              setPickerOpen(false);
              setWhenOpen(false);
            }}
            onDismiss={() => setPickerOpen(false)}
          />
        </View>
      ) : null}

      {/* Footer: list on the left, buttons for unset attributes on the right */}
      <Animated.View
        layout={SPATIAL}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 14,
          paddingLeft: 44,
          paddingRight: 4,
        }}>
        <View className="flex-row items-center gap-1.5" style={{ flexShrink: 1 }}>
          <MaterialCommunityIcons name="format-list-bulleted" size={16} color={colors.text2} />
          <Text numberOfLines={1} className="text-sf-text-2" style={{ fontSize: 14 }}>
            {listName}
          </Text>
        </View>
        <View className="flex-row items-center">
          {tags.length === 0 ? (
            <FooterButton icon="tag-outline" label="Add tags" onPress={chooseTags} />
          ) : null}
          {isNew && onOpenAi ? (
            <FooterButton
              icon="creation"
              label="Write with AI or import a photo"
              onPress={() => {
                haptics.tap();
                onOpenAi();
              }}
            />
          ) : null}
          {!showChecklist ? (
            <FooterButton
              icon="format-list-checks"
              label="Add checklist"
              onPress={() => {
                haptics.tap();
                setChecklistOpen(true);
              }}
            />
          ) : null}
          {!when ? (
            <FooterButton
              icon="flag-outline"
              label="Set date"
              onPress={() => {
                haptics.tap();
                setWhenOpen((open) => !open);
              }}
            />
          ) : null}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function ChecklistRow({
  title,
  checked,
  onToggle,
  onRemove,
}: {
  title: string;
  checked: boolean;
  onToggle?: () => void;
  onRemove?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.medium1)}
      layout={SPATIAL}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 46,
      }}>
      <View style={{ marginLeft: -12 }}>
        <TaskCheckbox
          checked={checked}
          onToggle={() => onToggle?.()}
          label={`${checked ? 'Uncheck' : 'Check'} ${title}`}
          size={20}
          variant="circle"
        />
      </View>
      <Text
        numberOfLines={2}
        className={checked ? 'text-sf-text-3 flex-1' : 'text-sf-text flex-1'}
        style={{ fontSize: 16, textDecorationLine: checked ? 'line-through' : 'none' }}>
        {title}
      </Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${title}`}>
          <MaterialCommunityIcons name="close" size={18} color={colors.text3} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function WhenChip({
  icon,
  label,
  iconColor,
  onPress,
}: {
  icon: IconName;
  label: string;
  iconColor?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.separator, borderless: false }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 8,
        paddingRight: 14,
        height: 32,
        // M3 assist chip: 8dp corners that round out while pressed (the
        // Expressive shape-morph cue).
        borderRadius: pressed ? 16 : 8,
        borderCurve: 'continuous',
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.gray2,
        overflow: 'hidden',
      })}>
      <MaterialCommunityIcons name={icon} size={17} color={iconColor ?? colors.accent} />
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

function FooterButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      android_ripple={{ color: colors.separator, borderless: true, radius: 22 }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed && Platform.OS === 'ios' ? 0.5 : 1,
      })}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.text2} />
    </Pressable>
  );
}
