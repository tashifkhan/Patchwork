import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Platform, Pressable } from 'react-native';

import type { Task } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { formatRelativeDue } from '@/lib/format';
import { useFocusStore } from '@/stores/focus-store';
import { Text, View } from '@/tw';
import { endFocus, startFocus } from '@/widgets/focus';

const DEFAULT_FOCUS_SECONDS = 25 * 60;

interface TaskItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  depth?: number;
  /** Render nested children inline (list view). Off in the detail subtask list. */
  showChildren?: boolean;
}

function TaskItemComponent({ task, onToggle, onOpen, depth = 0, showChildren = true }: TaskItemProps) {
  const { colors } = useTheme();
  const due = formatRelativeDue(task.due_at);
  const excerpt = task.markdown
    .replace(/[`*_>#\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const childCount = task.children.length;
  const showList = !task.parent_uid && Boolean(task.list_name);
  const focusUid = useFocusStore((s) => s.taskUid);
  const isFocused = focusUid === task.uid;
  const focusEnabled = Platform.OS === 'ios' && !task.completed;

  return (
    <View>
      <View className="flex-row items-start gap-3 py-2" style={{ paddingLeft: depth * 28 }}>
        <Pressable
          onPress={() => onToggle(task)}
          accessibilityRole="checkbox"
          accessibilityLabel={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
          accessibilityState={{ checked: task.completed }}
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
          accessibilityRole="button"
          accessibilityLabel={`${task.title}${due.label ? `, ${due.label}` : ''}`}
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

            {excerpt ? (
              <Text numberOfLines={2} className="text-sf-text-2 text-sm" selectable={false}>
                {excerpt}
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

        {focusEnabled ? (
          <Pressable
            onPress={() => {
              if (isFocused) endFocus();
              else startFocus(task.uid, task.title, DEFAULT_FOCUS_SECONDS);
            }}
            hitSlop={8}
            accessibilityLabel={isFocused ? 'End focus session' : 'Start 25-minute focus session'}
            accessibilityRole="button"
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingTop: 1 })}>
            <MaterialCommunityIcons
              name={isFocused ? 'timer-off-outline' : 'timer-outline'}
              size={22}
              color={isFocused ? colors.accent : colors.text2}
            />
          </Pressable>
        ) : null}
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
