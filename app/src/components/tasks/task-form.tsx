import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable } from 'react-native';

import type { TaskList } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { DateField } from '@/components/tasks/date-field';
import { MarkdownEditor } from '@/components/tasks/markdown-editor';
import { Button } from '@/components/ui/button';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { useDeviceCalendars } from '@/hooks/use-calendars';
import { normalizeTags } from '@/lib/tags';
import { useTagPickerStore } from '@/stores/tag-picker-store';
import { Text, TextInput, View } from '@/tw';

export interface TaskFormValues {
  title: string;
  markdown: string;
  list_id: string;
  tags: string[];
  due_at: string | null;
  reminder_at: string | null;
  priority: number | null;
  /** Device calendar to mirror this task into. UI-only; not stored on the CalDAV task. */
  calendar_id: string | null;
}

interface TaskFormProps {
  initial?: Partial<TaskFormValues>;
  lists: TaskList[];
  availableTags?: string[];
  availableTagsLoading?: boolean;
  availableTagsError?: boolean;
  onRetryTags?: () => void;
  submitting?: boolean;
  submitLabel: string;
  listLabel?: string;
  showList?: boolean;
  notesLabel?: string;
  showTags?: boolean;
  showReminder?: boolean;
  showPriority?: boolean;
  showCalendar?: boolean;
  /** @deprecated Preview is available via the Write/Preview toggle on MarkdownEditor. */
  showPreview?: boolean;
  /** Reports the complete draft as it changes, so a screen can hand it off elsewhere. */
  onDraftChange?: (draft: TaskFormValues) => void;
  onSubmit: (values: TaskFormValues) => void;
  onDelete?: () => void;
}

const PRIORITIES: { label: string; value: number | null }[] = [
  { label: 'None', value: null },
  { label: 'Low', value: 9 },
  { label: 'Medium', value: 5 },
  { label: 'High', value: 1 },
];

/**
 * Snaps an arbitrary CalDAV PRIORITY (0–9, per RFC 5545) onto the bucket this
 * control offers. Without it a task another client saved as e.g. `PRIORITY:3`
 * matched no segment and silently displayed as "None".
 */
function toPriorityBucket(priority: number | null | undefined): number | null {
  if (priority == null || priority === 0) return null;
  if (priority <= 4) return 1;
  if (priority === 5) return 5;
  return 9;
}

export function TaskForm({
  initial,
  lists,
  availableTags = [],
  availableTagsLoading = false,
  availableTagsError = false,
  onRetryTags,
  submitting,
  submitLabel,
  listLabel = 'List',
  showList = true,
  notesLabel = 'Notes',
  showTags = true,
  showReminder = true,
  showPriority = true,
  showCalendar = true,
  showPreview: _showPreview = true,
  onDraftChange,
  onSubmit,
  onDelete,
}: TaskFormProps) {
  const { colors } = useTheme();
  const textColor = colors.text2;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [markdown, setMarkdown] = useState(initial?.markdown ?? '');
  const [listId, setListId] = useState(initial?.list_id ?? lists[0]?.id ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [dueAt, setDueAt] = useState<string | null>(initial?.due_at ?? null);
  const [reminderAt, setReminderAt] = useState<string | null>(initial?.reminder_at ?? null);
  const [priority, setPriority] = useState<number | null>(toPriorityBucket(initial?.priority));
  const [calendarId, setCalendarId] = useState<string | null>(initial?.calendar_id ?? null);
  const [showCalendarList, setShowCalendarList] = useState(false);
  const draftRef = useRef<TaskFormValues>({
    title: initial?.title ?? '',
    markdown: initial?.markdown ?? '',
    list_id: initial?.list_id ?? lists[0]?.id ?? '',
    tags: initial?.tags ?? [],
    due_at: initial?.due_at ?? null,
    reminder_at: initial?.reminder_at ?? null,
    priority: toPriorityBucket(initial?.priority),
    calendar_id: initial?.calendar_id ?? null,
  });

  const openTagPicker = useTagPickerStore((s) => s.open);

  const hasSchedule = Boolean(dueAt || reminderAt);
  // Listing calendars requests OS permission. Wait until the user explicitly
  // expands the selector rather than prompting as soon as they set a due date.
  const calendarsQuery = useDeviceCalendars(showCalendar && hasSchedule && showCalendarList);
  const calendars = calendarsQuery.data ?? [];

  const canSubmit = title.trim().length > 0 && listId.length > 0 && !submitting;

  function reportDraft(patch: Partial<TaskFormValues>) {
    draftRef.current = { ...draftRef.current, ...patch };
    onDraftChange?.(draftRef.current);
  }

  function changeTitle(value: string) {
    setTitle(value);
    reportDraft({ title: value });
  }

  function changeMarkdown(value: string) {
    setMarkdown(value);
    reportDraft({ markdown: value });
  }

  function changeList(value: string) {
    setListId(value);
    reportDraft({ list_id: value });
  }

  function changeTags(value: string[]) {
    const normalized = normalizeTags(value);
    setTags(normalized);
    reportDraft({ tags: normalized });
  }

  function changeDueAt(value: string | null) {
    setDueAt(value);
    reportDraft({ due_at: value });
  }

  function changeReminderAt(value: string | null) {
    setReminderAt(value);
    reportDraft({ reminder_at: value });
  }

  function changePriority(value: number | null) {
    setPriority(value);
    reportDraft({ priority: value });
  }

  function changeCalendar(value: string | null) {
    setCalendarId(value);
    reportDraft({ calendar_id: value });
  }

  function pickTags() {
    if (availableTagsLoading) return;
    if (availableTagsError) {
      onRetryTags?.();
      return;
    }
    const pool = normalizeTags([...availableTags, ...tags]).sort((a, b) => a.localeCompare(b));
    openTagPicker(pool, tags, changeTags);
    router.push('/tags');
  }

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      markdown: markdown.trim(),
      list_id: listId,
      tags: normalizeTags(tags),
      due_at: dueAt,
      reminder_at: reminderAt,
      priority,
      calendar_id: hasSchedule ? calendarId : null,
    });
  }

  const selectedCalendarTitle = calendars.find((c) => c.id === calendarId)?.title ?? null;
  const accountIds = new Set(lists.map((list) => list.account_id).filter(Boolean));
  const showAccountNames = accountIds.size > 1;

  return (
    <View className="gap-4 px-5 py-3">
      {/* Title — hero field (Paisa amount/title pattern) */}
      <SheetFieldCard>
        <Text
          className="text-sf-text-2"
          style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.2, marginBottom: 6 }}>
          TITLE
        </Text>
        <TextInput
          value={title}
          onChangeText={changeTitle}
          placeholder="What needs doing?"
          placeholderTextColor={textColor as string}
          accessibilityLabel="Task title"
          className="text-sf-text text-base"
          style={{
            minHeight: 44,
            paddingVertical: 4,
            fontSize: 17,
            fontWeight: '500',
          }}
        />
      </SheetFieldCard>

      {showList && lists.length > 1 ? (
        <Field label={listLabel} icon="format-list-bulleted">
          <View className="flex-row flex-wrap gap-2">
            {lists.map((list) => (
              <ToggleChip
                key={list.id}
                label={
                  showAccountNames && list.account_name
                    ? `${list.name} · ${list.account_name}`
                    : list.name
                }
                selected={list.id === listId}
                onPress={() => changeList(list.id)}
              />
            ))}
          </View>
        </Field>
      ) : null}

      <Field label={notesLabel} icon="text-long">
        <MarkdownEditor
          value={markdown}
          onChangeText={changeMarkdown}
          placeholder="Add details… (# heading, **bold**, - list)"
          placeholderTextColor={textColor as string}
          minHeight={120}
        />
      </Field>

      {showTags ? (
        <Field label="Tags" icon="tag-multiple-outline">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose tags"
            accessibilityState={{ disabled: availableTagsLoading }}
            disabled={availableTagsLoading}
            onPress={pickTags}
            style={({ pressed }) => ({
              opacity: availableTagsLoading ? 0.6 : pressed ? 0.7 : 1,
            })}>
            <SheetFieldCard>
              <View className="flex-row items-center justify-between" style={{ minHeight: 40 }}>
                {tags.length > 0 ? (
                  <View className="flex-1 flex-row flex-wrap gap-2">
                    {tags.map((tag) => (
                      <View
                        key={tag}
                        className="flex-row items-center gap-1 rounded-full px-3 py-1"
                        style={{
                          backgroundColor: colors.bg3,
                          borderCurve: 'continuous',
                        }}>
                        <MaterialCommunityIcons
                          name="tag-outline"
                          size={13}
                          color={textColor as string}
                        />
                        <Text className="text-sf-text-2 text-sm">{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text className="text-sf-text-2 text-base">
                    {availableTagsLoading
                      ? 'Loading tags…'
                      : availableTagsError
                        ? 'Could not load tags — tap to retry'
                        : 'Add tags'}
                  </Text>
                )}
                <MaterialCommunityIcons
                  name={availableTagsError ? 'refresh' : 'chevron-right'}
                  size={20}
                  color={textColor as string}
                />
              </View>
            </SheetFieldCard>
          </Pressable>
        </Field>
      ) : null}

      {/* Due / Reminder card — Paisa SheetFieldCard row pattern */}
      <SheetFieldCard>
        <DateField label="Due date" iconName="calendar" value={dueAt} onChange={changeDueAt} />
        {showReminder ? (
          <>
            <View style={{ height: 1, backgroundColor: colors.separator, marginVertical: 4 }} />
            <DateField
              label="Reminder"
              iconName="bell-outline"
              value={reminderAt}
              onChange={changeReminderAt}
            />
          </>
        ) : null}
      </SheetFieldCard>

      {showCalendar && hasSchedule ? (
        <Field label="Add to calendar" icon="calendar-plus">
          <SheetFieldCard padded={false}>
            <Pressable
              onPress={() => setShowCalendarList((prev) => !prev)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showCalendarList }}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <View
                className="flex-row items-center justify-between px-4 py-3"
                style={{ minHeight: 52 }}>
                <View className="flex-row items-center gap-3">
                  <MaterialCommunityIcons name="calendar-plus" size={20} color={colors.accent} />
                  <Text className="text-sf-text text-base">
                    {selectedCalendarTitle ?? "Don't add to calendar"}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={showCalendarList ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={textColor as string}
                />
              </View>
            </Pressable>

            {showCalendarList ? (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
                <CalendarRow
                  title="Don't add to calendar"
                  selected={calendarId == null}
                  color={null}
                  onPress={() => {
                    changeCalendar(null);
                    setShowCalendarList(false);
                  }}
                />
                {calendarsQuery.isLoading ? (
                  <Text className="text-sf-text-2 px-4 py-3 text-sm">Loading calendars…</Text>
                ) : null}
                {calendars.map((calendar) => (
                  <CalendarRow
                    key={calendar.id}
                    title={calendar.title}
                    color={calendar.color}
                    selected={calendar.id === calendarId}
                    onPress={() => {
                      changeCalendar(calendar.id);
                      setShowCalendarList(false);
                    }}
                  />
                ))}
                {!calendarsQuery.isLoading && calendars.length === 0 ? (
                  <Text className="text-sf-text-2 px-4 py-3 text-sm">
                    No writable calendars found.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </SheetFieldCard>
        </Field>
      ) : null}

      {showPriority ? (
        <Field label="Priority" icon="flag-outline">
          <SegmentedChoice
            options={PRIORITIES}
            value={priority}
            onChange={changePriority}
          />
        </Field>
      ) : null}

      <View style={{ paddingTop: 8 }}>
        <Button
          label={submitLabel}
          onPress={submit}
          disabled={!canSubmit}
          loading={submitting}
          minHeight={52}
        />
      </View>

      {onDelete ? (
        <Button
          variant="danger"
          label="Delete"
          icon="trash-can-outline"
          onPress={onDelete}
          accessibilityLabel="Delete"
          minHeight={52}
        />
      ) : null}
    </View>
  );
}

/** Paisa-style surfaceContainerLow card with extra-large corners. */
function SheetFieldCard({
  children,
  padded = true,
}: {
  children: React.ReactNode;
  padded?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.bg3,
        borderRadius: 20,
        borderCurve: 'continuous',
        paddingHorizontal: padded ? 16 : 0,
        paddingVertical: padded ? 12 : 0,
        overflow: 'hidden',
      }}>
      {children}
    </View>
  );
}

function CalendarRow({
  title,
  color,
  selected,
  onPress,
}: {
  title: string;
  color: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <View className="flex-row items-center justify-between px-4 py-3" style={{ minHeight: 48 }}>
        <View className="flex-row items-center gap-3">
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              backgroundColor: color ?? colors.gray,
            }}
          />
          <Text className="text-sf-text text-base">{title}</Text>
        </View>
        {selected ? (
          <MaterialCommunityIcons name="check" size={20} color={colors.accent} />
        ) : null}
      </View>
    </Pressable>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-1.5 px-1">
        {icon ? <MaterialCommunityIcons name={icon} size={14} color={colors.accent} /> : null}
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: colors.accent,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}>
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}
