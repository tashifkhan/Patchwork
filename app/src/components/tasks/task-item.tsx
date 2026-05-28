import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable } from 'react-native';

import type { Task } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { formatRelativeDue } from '@/lib/format';
import { Text, View } from '@/tw';

interface TaskItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  depth?: number;
  /** Render nested children inline (list view). Off in the detail subtask list. */
  showChildren?: boolean;
}

function firstLine(markdown: string): string {
  const line = markdown
    .split('\n')
    .map((l) => l.replace(/^[\s>#*\-+\d.]+/, '').trim())
    .find((l) => l.length > 0);
  return line ?? '';
}

function TaskItemComponent({ task, onToggle, onOpen, depth = 0, showChildren = true }: TaskItemProps) {
  const { colors } = useTheme();
  const due = formatRelativeDue(task.due_at);
  const preview = firstLine(task.markdown);
  const childCount = task.children.length;
  const showList = !task.parent_uid && Boolean(task.list_name);

  return (
    <View>
      <View className="flex-row items-start gap-3 py-2" style={{ paddingLeft: depth * 28 }}>
        <Pressable
          onPress={() => onToggle(task)}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingTop: 1 })}>
          <MaterialCommunityIcons
            name={task.completed ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={24}
            color={task.completed ? colors.accent : colors.gray}
          />
        </Pressable>

        <Pressable
          onPress={() => onOpen(task)}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flex: 1 })}>
          <View className="flex-1 gap-1.5">
            <View className="flex-row items-start justify-between gap-2">
              <Text
                numberOfLines={2}
                className={`flex-1 text-base ${task.completed ? 'text-sf-text-3 line-through' : 'text-sf-text'}`}>
                {task.title}
              </Text>
              {due.label ? (
                <Text className={`text-xs ${due.overdue && !task.completed ? 'text-sf-orange' : 'text-sf-text-2'}`}>
                  {due.label}
                </Text>
              ) : null}
            </View>

            {preview ? (
              <Text numberOfLines={2} className="text-sf-text-2 text-sm">
                {preview}
              </Text>
            ) : null}

            {(showList || task.tags.length > 0 || childCount > 0) ? (
              <View className="flex-row flex-wrap items-center gap-1.5 pt-0.5">
                {childCount > 0 ? (
                  <Chip
                    icon="format-list-checks"
                    label={`${childCount} subtask${childCount > 1 ? 's' : ''}`}
                    color={colors.text2}
                    bg={colors.bg2}
                  />
                ) : null}
                {showList ? (
                  <Chip
                    icon="format-list-bulleted"
                    label={task.list_name}
                    color={colors.text2}
                    bg={colors.bg2}
                  />
                ) : null}
                {task.tags.map((tag) => (
                  <Chip key={tag} icon="tag-outline" label={tag} color={colors.text2} bg={colors.bg2} />
                ))}
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>

      {showChildren && childCount > 0 ? (
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
    </View>
  );
}

function Chip({
  icon,
  label,
  color,
  bg,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <View
      className="flex-row items-center gap-1 rounded-md px-2 py-1"
      style={{ backgroundColor: bg, borderCurve: 'continuous' }}>
      <MaterialCommunityIcons name={icon} size={13} color={color} />
      <Text className="text-sf-text-2 text-xs">{label}</Text>
    </View>
  );
}

export const TaskItem = memo(TaskItemComponent);
