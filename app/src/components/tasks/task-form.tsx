import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import type { TaskList } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { DateField } from '@/components/tasks/date-field';
import { MarkdownEditor } from '@/components/tasks/markdown-editor';
import { useDeviceCalendars } from '@/hooks/use-calendars';
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
  submitting?: boolean;
  submitLabel: string;
  listLabel?: string;
  showList?: boolean;
  notesLabel?: string;
  showTags?: boolean;
  showReminder?: boolean;
  showPriority?: boolean;
  showCalendar?: boolean;
  /** @deprecated Live preview is always on via MarkdownEditor. Kept for call-site compat. */
  showPreview?: boolean;
  onSubmit: (values: TaskFormValues) => void;
  onDelete?: () => void;
}

const PRIORITIES: { label: string; value: number | null }[] = [
  { label: 'None', value: null },
  { label: 'Low', value: 9 },
  { label: 'Medium', value: 5 },
  { label: 'High', value: 1 },
];

export function TaskForm({
  initial,
  lists,
  availableTags = [],
  submitting,
  submitLabel,
  listLabel = 'List',
  showList = true,
  notesLabel = 'Notes (Markdown)',
  showTags = true,
  showReminder = true,
  showPriority = true,
  showCalendar = true,
  showPreview: _showPreview = true,
  onSubmit,
  onDelete,
}: TaskFormProps) {
  const { colors } = useTheme();
  const textColor = colors.text2;
  const red = colors.red;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [markdown, setMarkdown] = useState(initial?.markdown ?? '');
  const [listId, setListId] = useState(initial?.list_id ?? lists[0]?.id ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [dueAt, setDueAt] = useState<string | null>(initial?.due_at ?? null);
  const [reminderAt, setReminderAt] = useState<string | null>(initial?.reminder_at ?? null);
  const [priority, setPriority] = useState<number | null>(initial?.priority ?? null);
  const [calendarId, setCalendarId] = useState<string | null>(initial?.calendar_id ?? null);
  const [showCalendarList, setShowCalendarList] = useState(false);

  const openTagPicker = useTagPickerStore((s) => s.open);

  const hasSchedule = Boolean(dueAt || reminderAt);
  const calendarsQuery = useDeviceCalendars(showCalendar && hasSchedule);
  const calendars = calendarsQuery.data ?? [];

  const canSubmit = title.trim().length > 0 && listId.length > 0 && !submitting;

  function pickTags() {
    const pool = [...new Set([...availableTags, ...tags])].sort();
    openTagPicker(pool, tags, setTags);
    router.push('/tags');
  }

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      markdown: markdown.trim(),
      list_id: listId,
      tags,
      due_at: dueAt,
      reminder_at: reminderAt,
      priority,
      calendar_id: hasSchedule ? calendarId : null,
    });
  }

  const selectedCalendarTitle = calendars.find((c) => c.id === calendarId)?.title ?? null;

  return (
    <View className="gap-5 px-4 py-4">
      <Field label="Title" icon="format-title">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="What needs doing?"
          placeholderTextColor={textColor as string}
          accessibilityLabel="Task title"
          className="text-sf-text bg-sf-bg-2 rounded-xl px-3 py-3 text-base"
          style={{ borderCurve: 'continuous' }}
        />
      </Field>

      {showList && lists.length > 1 ? (
        <Field label={listLabel} icon="format-list-bulleted">
          <View className="flex-row flex-wrap gap-2">
            {lists.map((list) => {
              const selected = list.id === listId;
              return (
                <Pressable
                  key={list.id}
                  onPress={() => setListId(list.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <View
                    className={`rounded-full px-3 py-1 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-2'}`}
                    style={{ borderCurve: 'continuous' }}>
                    <Text className={`text-sm ${selected ? 'text-sf-on-accent' : 'text-sf-text-2'}`}>
                      {list.name}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Field>
      ) : null}

      <Field label={notesLabel} icon="text-long">
        <MarkdownEditor
          value={markdown}
          onChangeText={setMarkdown}
          placeholder="Add details…  (# heading, **bold**, - list)"
          placeholderTextColor={textColor as string}
        />
      </Field>

      {showTags ? (
        <Field label="Tags" icon="tag-multiple-outline">
          <Pressable accessibilityRole="button" accessibilityLabel="Choose tags" onPress={pickTags} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <View
              className="bg-sf-bg-2 flex-row items-center justify-between rounded-xl px-3 py-3"
              style={{ borderCurve: 'continuous' }}>
              {tags.length > 0 ? (
                <View className="flex-1 flex-row flex-wrap gap-2">
                  {tags.map((tag) => (
                    <View
                      key={tag}
                      className="bg-sf-bg-3 flex-row items-center gap-1 rounded-full px-3 py-1"
                      style={{ borderCurve: 'continuous' }}>
                      <MaterialCommunityIcons name="tag-outline" size={13} color={textColor as string} />
                      <Text className="text-sf-text-2 text-sm">{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-sf-text-2 text-base">Add tags</Text>
              )}
              <MaterialCommunityIcons name="chevron-right" size={20} color={textColor as string} />
            </View>
          </Pressable>
        </Field>
      ) : null}

      <View className="bg-sf-bg-2 gap-3 rounded-xl px-3 py-3" style={{ borderCurve: 'continuous' }}>
        <DateField label="Due date" iconName="calendar" value={dueAt} onChange={setDueAt} />
        {showReminder ? (
          <>
            <View className="bg-sf-separator h-px" />
            <DateField label="Reminder" iconName="bell-outline" value={reminderAt} onChange={setReminderAt} />
          </>
        ) : null}
      </View>

      {showCalendar && hasSchedule ? (
        <Field label="Add to calendar" icon="calendar-plus">
          <View className="bg-sf-bg-2 rounded-xl" style={{ borderCurve: 'continuous' }}>
            <Pressable
              onPress={() => setShowCalendarList((prev) => !prev)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showCalendarList }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <View className="flex-row items-center justify-between px-3 py-3">
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
              <View className="border-sf-separator border-t">
                <CalendarRow
                  title="Don't add to calendar"
                  selected={calendarId == null}
                  color={null}
                  onPress={() => {
                    setCalendarId(null);
                    setShowCalendarList(false);
                  }}
                />
                {calendarsQuery.isLoading ? (
                  <Text className="text-sf-text-2 px-3 py-3 text-sm">Loading calendars…</Text>
                ) : null}
                {calendars.map((calendar) => (
                  <CalendarRow
                    key={calendar.id}
                    title={calendar.title}
                    color={calendar.color}
                    selected={calendar.id === calendarId}
                    onPress={() => {
                      setCalendarId(calendar.id);
                      setShowCalendarList(false);
                    }}
                  />
                ))}
                {!calendarsQuery.isLoading && calendars.length === 0 ? (
                  <Text className="text-sf-text-2 px-3 py-3 text-sm">
                    No writable calendars found.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </Field>
      ) : null}

      {showPriority ? (
        <Field label="Priority" icon="flag-outline">
          <SegmentedControl
            values={PRIORITIES.map((option) => option.label)}
            selectedIndex={Math.max(
              0,
              PRIORITIES.findIndex((option) => option.value === priority)
            )}
            tintColor={colors.accent}
            onChange={(event) =>
              setPriority(PRIORITIES[event.nativeEvent.selectedSegmentIndex]?.value ?? null)
            }
          />
        </Field>
      ) : null}

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        style={({ pressed }) => ({ opacity: !canSubmit ? 0.4 : pressed ? 0.8 : 1 })}>
        <View
          className="bg-sf-blue items-center rounded-xl py-3.5"
          style={{ borderCurve: 'continuous' }}>
          <Text className="text-sf-on-accent text-base font-semibold">{submitLabel}</Text>
        </View>
      </Pressable>

      {onDelete ? (
        <Pressable accessibilityRole="button" onPress={onDelete} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <View className="flex-row items-center justify-center gap-2 py-2">
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={red as string} />
            <Text className="text-sf-red text-base">Delete task</Text>
          </View>
        </Pressable>
      ) : null}
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
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <View className="flex-row items-center justify-between px-3 py-3">
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
        {icon ? <MaterialCommunityIcons name={icon} size={14} color={colors.text2} /> : null}
        <Text className="text-sf-text-2 text-xs font-semibold uppercase">{label}</Text>
      </View>
      {children}
    </View>
  );
}
