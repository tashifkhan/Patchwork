import { memo, useState } from 'react';
import { Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { Task } from '@/api/types';
import { Icon } from '@/components/ui/icon';
import { formatRelativeDue } from '@/lib/format';
import { Text, View, useCSSVariable } from '@/tw';

interface TaskItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  depth?: number;
}

function TaskItemComponent({ task, onToggle, onOpen, depth = 0 }: TaskItemProps) {
  const [expanded, setExpanded] = useState(true);
  const green = useCSSVariable('--sf-green');
  const gray = useCSSVariable('--sf-gray');
  const textSecondary = useCSSVariable('--sf-text-2');
  const orange = useCSSVariable('--sf-orange');

  const due = formatRelativeDue(task.due_at);
  const hasChildren = task.children.length > 0;

  return (
    <Animated.View layout={LinearTransition} entering={FadeIn} exiting={FadeOut}>
      <View
        className="flex-row items-center gap-3 py-2.5"
        style={{ paddingLeft: depth * 24 }}>
        <Pressable
          onPress={() => onToggle(task)}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Icon
            name={task.completed ? 'checkmark.circle.fill' : 'circle'}
            size={24}
            color={(task.completed ? green : gray) as string}
          />
        </Pressable>

        <Pressable
          onPress={() => onOpen(task)}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flex: 1 })}>
          <View className="flex-1 gap-1">
            <Text
              numberOfLines={2}
              className={`text-base ${task.completed ? 'text-sf-text-3 line-through' : 'text-sf-text'}`}>
              {task.title}
            </Text>

            {(due.label || task.tags.length > 0) ? (
              <View className="flex-row flex-wrap items-center gap-2">
                {due.label ? (
                  <View className="flex-row items-center gap-1">
                    <Icon
                      name="calendar"
                      size={12}
                      color={(due.overdue ? orange : textSecondary) as string}
                    />
                    <Text className={`text-xs ${due.overdue ? 'text-sf-orange' : 'text-sf-text-2'}`}>
                      {due.label}
                    </Text>
                  </View>
                ) : null}
                {task.tags.slice(0, 3).map((tag) => (
                  <Text key={tag} className="text-sf-text-2 text-xs">
                    #{tag}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </Pressable>

        {hasChildren ? (
          <Pressable
            onPress={() => setExpanded((prev) => !prev)}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Icon
              name={expanded ? 'chevron.down' : 'chevron.right'}
              size={14}
              color={textSecondary as string}
            />
          </Pressable>
        ) : null}
      </View>

      {hasChildren && expanded ? (
        <View>
          {task.children.map((child) => (
            <TaskItem
              key={child.id}
              task={child}
              onToggle={onToggle}
              onOpen={onOpen}
              depth={depth + 1}
            />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

export const TaskItem = memo(TaskItemComponent);
