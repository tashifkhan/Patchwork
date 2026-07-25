import { memo } from 'react';
import { Pressable } from 'react-native';

import type { AiGeneratedTask, TaskList } from '@/api/types';
import { DateField } from '@/components/tasks/date-field';
import { MarkdownEditor } from '@/components/tasks/markdown-editor';
import { Icon } from '@/components/ui/icon';
import { Text, TextInput, View, useCSSVariable } from '@/tw';

interface StagedTaskCardProps {
  index: number;
  task: AiGeneratedTask;
  lists: TaskList[];
  onChange: (index: number, patch: Partial<AiGeneratedTask>) => void;
  onRemove: (index: number) => void;
}

function StagedTaskCardComponent({ index, task, lists, onChange, onRemove }: StagedTaskCardProps) {
  const textSecondary = useCSSVariable('--sf-text-2');
  const red = useCSSVariable('--sf-red');

  return (
    <View
      className="bg-sf-bg-2 gap-3 rounded-2xl p-3"
      style={{ borderCurve: 'continuous' }}>
      <View className="flex-row items-start gap-2">
        <TextInput
          value={task.title}
          onChangeText={(title) => onChange(index, { title })}
          placeholder="Task title"
          placeholderTextColor={textSecondary as string}
          className="text-sf-text bg-sf-bg-3 flex-1 rounded-lg px-3 py-2 text-base"
          style={{ borderCurve: 'continuous' }}
        />
        <Pressable
          onPress={() => onRemove(index)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${task.title || 'draft task'}`}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingTop: 6 })}>
          <Icon name="trash" size={18} color={red as string} />
        </Pressable>
      </View>

      <MarkdownEditor
        value={task.description ?? ''}
        onChangeText={(description) => onChange(index, { description })}
        placeholder="Description (optional, Markdown)"
        placeholderTextColor={textSecondary as string}
        compact
        minHeight={64}
        className="text-sf-text bg-sf-bg-3 min-h-16 rounded-lg px-3 py-2 text-sm"
      />

      {lists.length > 1 ? (
        <View className="flex-row flex-wrap gap-2">
          {lists.map((list) => {
            const selected = list.id === task.list_id;
            return (
              <Pressable
                key={list.id}
                onPress={() => onChange(index, { list_id: list.id })}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <View
                  className={`rounded-full px-3 py-1 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-3'}`}
                  style={{ borderCurve: 'continuous' }}>
                  <Text className={`text-xs ${selected ? 'text-sf-on-accent' : 'text-sf-text-2'}`}>
                    {list.name}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {task.tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-1">
          {task.tags.map((tag) => (
            <Text key={tag} className="text-sf-text-2 text-xs">
              #{tag}
            </Text>
          ))}
        </View>
      ) : null}

      <TextInput
        value={task.tags.join(', ')}
        onChangeText={(value) => onChange(index, {
          tags: [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))],
        })}
        placeholder="Tags, separated by commas"
        placeholderTextColor={textSecondary as string}
        accessibilityLabel="Tags separated by commas"
        className="text-sf-text bg-sf-bg-3 rounded-lg px-3 py-2 text-sm"
        style={{ borderCurve: 'continuous' }}
      />

      <DateField
        label="Due date"
        iconName="calendar"
        value={task.due_at ?? null}
        onChange={(due_at) => onChange(index, { due_at })}
      />

      <DateField
        label="Reminder"
        iconName="bell-outline"
        value={task.reminder_at ?? null}
        onChange={(reminder_at) => onChange(index, { reminder_at })}
      />

      <View className="gap-2">
        <Text className="text-sf-text-2 text-xs font-semibold uppercase">Priority</Text>
        <View className="flex-row flex-wrap gap-2">
          {[
            { label: 'None', value: null },
            { label: 'Low', value: 9 },
            { label: 'Medium', value: 5 },
            { label: 'High', value: 1 },
          ].map((option) => {
            const selected = task.priority === option.value;
            return (
              <Pressable
                key={option.label}
                onPress={() => onChange(index, { priority: option.value })}
                accessibilityRole="radio"
                accessibilityState={{ selected }}>
                <View className={`rounded-full px-3 py-1 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-3'}`}>
                  <Text className={`text-xs ${selected ? 'text-sf-on-accent' : 'text-sf-text-2'}`}>
                    {option.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="border-sf-separator gap-2 border-t pt-2">
        <Text className="text-sf-text-2 text-xs font-semibold uppercase">Subtasks</Text>
        {task.subtasks.length > 0 ? (
          task.subtasks.map((sub, subIndex) => (
            <View key={subIndex} className="flex-row items-center gap-2">
              <Icon name="arrow.turn.down.right" size={12} color={textSecondary as string} />
              <TextInput
                value={sub.title}
                onChangeText={(title) => onChange(index, {
                  subtasks: task.subtasks.map((entry, entryIndex) =>
                    entryIndex === subIndex ? { ...entry, title } : entry
                  ),
                })}
                placeholder="Subtask title"
                placeholderTextColor={textSecondary as string}
                className="text-sf-text bg-sf-bg-3 flex-1 rounded-lg px-2 py-1.5 text-sm"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove subtask ${sub.title}`}
                onPress={() => onChange(index, {
                  subtasks: task.subtasks.filter((_, entryIndex) => entryIndex !== subIndex),
                })}
                hitSlop={8}>
                <Icon name="xmark.circle.fill" size={16} color={textSecondary as string} />
              </Pressable>
            </View>
          ))
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(index, {
            subtasks: [...task.subtasks, { title: '', description: null }],
          })}>
          <Text className="text-sf-blue text-sm font-semibold">Add subtask</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const StagedTaskCard = memo(StagedTaskCardComponent);
