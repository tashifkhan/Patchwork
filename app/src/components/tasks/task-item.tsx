import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Platform, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { Task } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { TaskCheckbox } from '@/components/tasks/task-checkbox';
import { MIN_TOUCH_TARGET } from '@/components/ui/touchable-row';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING } from '@/lib/motion';
import { describeWhen } from '@/lib/when';
import { useFocusStore } from '@/stores/focus-store';
import { Text, View } from '@/tw';
import { endFocus, startFocus } from '@/widgets/focus';

const DEFAULT_FOCUS_SECONDS = 25 * 60;

interface TaskItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  onOpen: (task: Task) => void;
  depth?: number;
  /** Render nested children as rows. The Things-style list shows them in the card instead. */
  showChildren?: boolean;
  /** Show which list the task lives in (useful when viewing all lists). */
  showList?: boolean;
  /** Fade the row back while another to-do is open in place. */
  dimmed?: boolean;
  /** Open in the split view's detail pane: tinted like a selected list row. */
  selected?: boolean;
}

/**
 * Things-style row: checkbox, title, then small glyphs for whatever extra the
 * to-do carries (notes, tags, checklist). Dates and the list name sit on a
 * quiet second line only when they exist.
 */
function TaskItemComponent({
  task,
  onToggle,
  onOpen,
  depth = 0,
  showChildren = false,
  showList = true,
  dimmed = false,
  selected = false,
}: TaskItemProps) {
  const { colors } = useTheme();
  const when = describeWhen(task.due_at);
  const hasNotes = task.markdown.trim().length > 0;
  const childCount = task.children.length;
  const doneChildren = task.children.filter((c) => c.completed).length;
  const listLabel = showList && depth === 0 ? task.list_name : '';
  const focusUid = useFocusStore((s) => s.taskUid);
  const isFocused = focusUid === task.uid;
  const focusEnabled = Platform.OS === 'ios' && !task.completed;
  const pending = task.pending_sync === true;
  const showMeta = Boolean(when || listLabel || pending);

  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.medium1).easing(EASING.emphasizedDecelerate)}
      exiting={FadeOut.duration(DURATION.short4).easing(EASING.emphasizedAccelerate)}
      layout={LinearTransition.duration(DURATION.medium2).easing(EASING.emphasized)}>
      {/* Dimming lives on an inner view: the layout animation owns the outer opacity. */}
      <View
        className="flex-row items-center"
        accessibilityState={selected ? { selected: true } : undefined}
        style={{
          paddingLeft: depth * 28,
          minHeight: 48,
          opacity: dimmed ? 0.38 : 1,
          // Selection reaches into the page margin so the tint reads as a row.
          ...(selected
            ? {
                backgroundColor: colors.selectionBg,
                borderRadius: 14,
                marginHorizontal: -8,
                paddingRight: 8,
                paddingLeft: depth * 28 + 8,
              }
            : null),
        }}>
        <View style={{ marginLeft: -11 }}>
          <TaskCheckbox
            checked={task.completed}
            onToggle={() => onToggle(task)}
            label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
          />
        </View>

        <Pressable
          onPress={() => {
            haptics.tap();
            onOpen(task);
          }}
          accessibilityRole="button"
          accessibilityHint="Opens the to-do in place"
          accessibilityLabel={`${task.title}${when ? `, due ${when.label}` : ''}`}
          android_ripple={{ color: colors.separator }}
          style={({ pressed }) => ({
            opacity: pressed && Platform.OS === 'ios' ? 0.6 : 1,
            flex: 1,
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: 'center',
            paddingVertical: showMeta ? 7 : 10,
            paddingRight: 4,
          })}>
          <View className="flex-row items-center gap-1.5">
            <Text
              numberOfLines={2}
              style={{
                flexShrink: 1,
                fontSize: 17,
                color: task.completed ? colors.text3 : colors.text,
                textDecorationLine: task.completed ? 'line-through' : 'none',
              }}>
              {task.title}
            </Text>
            {hasNotes ? (
              <MaterialCommunityIcons name="file-document-outline" size={15} color={colors.text3} />
            ) : null}
            {task.tags.length > 0 ? (
              <MaterialCommunityIcons name="tag-outline" size={15} color={colors.text3} />
            ) : null}
            {childCount > 0 ? (
              <View className="flex-row items-center gap-0.5">
                <MaterialCommunityIcons name="format-list-checks" size={15} color={colors.text3} />
                <Text style={{ fontSize: 12, color: colors.text3 }}>
                  {doneChildren}/{childCount}
                </Text>
              </View>
            ) : null}
          </View>

          {showMeta ? (
            <View className="flex-row items-center gap-2" style={{ marginTop: 2 }}>
              {when ? (
                <View className="flex-row items-center gap-1">
                  <MaterialCommunityIcons
                    name={when.isToday ? 'star' : 'flag-variant'}
                    size={13}
                    color={
                      when.isToday ? '#F5C400' : when.overdue && !task.completed ? colors.red : colors.text2
                    }
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      color: when.overdue && !task.completed ? colors.red : colors.text2,
                    }}>
                    {when.hint && !when.overdue ? `${when.label} · ${when.hint}` : when.label}
                  </Text>
                </View>
              ) : null}
              {listLabel ? (
                <Text numberOfLines={1} style={{ fontSize: 13, color: colors.text3, flexShrink: 1 }}>
                  {listLabel}
                </Text>
              ) : null}
              {pending ? (
                <View
                  className="flex-row items-center gap-1"
                  accessibilityLabel="Saved on this device, waiting to sync">
                  <MaterialCommunityIcons name="cloud-upload-outline" size={13} color={colors.text3} />
                  <Text style={{ fontSize: 13, color: colors.text3 }}>Waiting to sync</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Pressable>

        {focusEnabled ? (
          <Pressable
            onPress={() => {
              haptics.impact(isFocused ? 'light' : 'medium');
              if (isFocused) endFocus();
              else startFocus(task.uid, task.title, DEFAULT_FOCUS_SECONDS);
            }}
            hitSlop={8}
            accessibilityLabel={isFocused ? 'End focus session' : 'Start 25-minute focus session'}
            accessibilityRole="button"
            style={({ pressed }) => ({
              opacity: pressed ? 0.5 : 1,
              width: MIN_TOUCH_TARGET,
              height: MIN_TOUCH_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
            })}>
            <MaterialCommunityIcons
              name={isFocused ? 'timer-off-outline' : 'timer-outline'}
              size={22}
              color={isFocused ? colors.accent : colors.text3}
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
              showChildren
            />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

export const TaskItem = memo(TaskItemComponent);
