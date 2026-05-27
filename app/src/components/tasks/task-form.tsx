import SegmentedControl from '@expo/ui/community/segmented-control';
import { useState } from 'react';
import { Pressable } from 'react-native';

import type { TaskList } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { DateField } from '@/components/tasks/date-field';
import { Icon } from '@/components/ui/icon';
import { Text, TextInput, View } from '@/tw';

export interface TaskFormValues {
  title: string;
  markdown: string;
  list_id: string;
  tags: string[];
  due_at: string | null;
  reminder_at: string | null;
  priority: number | null;
}

interface TaskFormProps {
  initial?: Partial<TaskFormValues>;
  lists: TaskList[];
  submitting?: boolean;
  submitLabel: string;
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
  submitting,
  submitLabel,
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
  const [tagDraft, setTagDraft] = useState('');
  const [dueAt, setDueAt] = useState<string | null>(initial?.due_at ?? null);
  const [reminderAt, setReminderAt] = useState<string | null>(initial?.reminder_at ?? null);
  const [priority, setPriority] = useState<number | null>(initial?.priority ?? null);

  const canSubmit = title.trim().length > 0 && listId.length > 0 && !submitting;

  function addTag() {
    const next = tagDraft.trim();
    if (next && !tags.includes(next)) setTags((prev) => [...prev, next]);
    setTagDraft('');
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
    });
  }

  return (
    <View className="gap-5 px-4 py-4">
      <Field label="Title">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="What needs doing?"
          placeholderTextColor={textColor as string}
          className="text-sf-text bg-sf-bg-2 rounded-xl px-3 py-3 text-base"
          style={{ borderCurve: 'continuous' }}
        />
      </Field>

      {lists.length > 1 ? (
        <Field label="List">
          <View className="flex-row flex-wrap gap-2">
            {lists.map((list) => {
              const selected = list.id === listId;
              return (
                <Pressable
                  key={list.id}
                  onPress={() => setListId(list.id)}
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

      <Field label="Notes (Markdown)">
        <TextInput
          value={markdown}
          onChangeText={setMarkdown}
          placeholder="Add details…"
          placeholderTextColor={textColor as string}
          multiline
          className="text-sf-text bg-sf-bg-2 min-h-24 rounded-xl px-3 py-3 text-base"
          style={{ borderCurve: 'continuous', textAlignVertical: 'top' }}
        />
      </Field>

      <Field label="Tags">
        <View className="gap-2">
          <TextInput
            value={tagDraft}
            onChangeText={setTagDraft}
            onSubmitEditing={addTag}
            placeholder="Add a tag and press return"
            placeholderTextColor={textColor as string}
            returnKeyType="done"
            className="text-sf-text bg-sf-bg-2 rounded-xl px-3 py-3 text-base"
            style={{ borderCurve: 'continuous' }}
          />
          {tags.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {tags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => setTags((prev) => prev.filter((t) => t !== tag))}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <View
                    className="bg-sf-bg-2 flex-row items-center gap-1 rounded-full px-3 py-1"
                    style={{ borderCurve: 'continuous' }}>
                    <Text className="text-sf-text-2 text-sm">{tag}</Text>
                    <Icon name="xmark.circle.fill" size={14} color={textColor as string} />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </Field>

      <View className="bg-sf-bg-2 gap-3 rounded-xl px-3 py-3" style={{ borderCurve: 'continuous' }}>
        <DateField label="Due date" iconName="calendar" value={dueAt} onChange={setDueAt} />
        <View className="bg-sf-separator h-px" />
        <DateField label="Reminder" iconName="bell" value={reminderAt} onChange={setReminderAt} />
      </View>

      <Field label="Priority">
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

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        style={({ pressed }) => ({ opacity: !canSubmit ? 0.4 : pressed ? 0.8 : 1 })}>
        <View
          className="bg-sf-blue items-center rounded-xl py-3.5"
          style={{ borderCurve: 'continuous' }}>
          <Text className="text-sf-on-accent text-base font-semibold">{submitLabel}</Text>
        </View>
      </Pressable>

      {onDelete ? (
        <Pressable
          onPress={onDelete}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <View className="flex-row items-center justify-center gap-2 py-2">
            <Icon name="trash" size={18} color={red as string} />
            <Text className="text-sf-red text-base">Delete task</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">{label}</Text>
      {children}
    </View>
  );
}
