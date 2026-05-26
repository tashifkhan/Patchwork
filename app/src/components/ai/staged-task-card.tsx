import { memo } from 'react';
import { Pressable } from 'react-native';

import type { AiGeneratedTask, TaskList } from '@/api/types';
import { DateField } from '@/components/tasks/date-field';
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
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingTop: 6 })}>
          <Icon name="trash" size={18} color={red as string} />
        </Pressable>
      </View>

      {lists.length > 1 ? (
        <View className="flex-row flex-wrap gap-2">
          {lists.map((list) => {
            const selected = list.id === task.list_id;
            return (
              <Pressable
                key={list.id}
                onPress={() => onChange(index, { list_id: list.id })}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <View
                  className={`rounded-full px-3 py-1 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-3'}`}
                  style={{ borderCurve: 'continuous' }}>
                  <Text className={`text-xs ${selected ? 'text-white' : 'text-sf-text-2'}`}>
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

      <DateField
        label="Due date"
        iconName="calendar"
        value={task.due_at ?? null}
        onChange={(due_at) => onChange(index, { due_at })}
      />

      {task.subtasks.length > 0 ? (
        <View className="border-sf-separator gap-1 border-t pt-2">
          {task.subtasks.map((sub, subIndex) => (
            <View key={subIndex} className="flex-row items-center gap-2">
              <Icon name="arrow.turn.down.right" size={12} color={textSecondary as string} />
              <Text className="text-sf-text-2 flex-1 text-sm">{sub.title}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const StagedTaskCard = memo(StagedTaskCardComponent);
