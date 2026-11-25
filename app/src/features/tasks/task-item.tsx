import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Platform, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import type { Task } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { TaskCheckbox } from '@/features/tasks/task-checkbox';
import { MIN_TOUCH_TARGET } from '@/components/ui/touchable-row';
import { haptics } from '@/lib/haptics';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { withAlpha } from '@/lib/theme';
import { DURATION, EASING, listPlacement, PAISA } from '@/lib/motion';
import { describeWhen } from '@/features/tasks/when';
import { router } from 'expo-router';

import { describeRrule } from '@/lib/recurrence';
import { formatMinutes, usePomodoroStore } from '@/stores/pomodoro-store';
import { Text, View } from '@/tw';

const ROW_ELASTIC = Platform.OS === 'android';

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
  /** Show the timer button. On by default; a running session always shows it. */
  showFocus?: boolean;
  /** Multi-select mode: the checkbox selects instead of completing. */
  selecting?: boolean;
  checked?: boolean;
  onLongPress?: (task: Task) => void;
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
  showFocus = true,
  selecting = false,
  checked = false,
  onLongPress,
}: TaskItemProps) {
  const { colors } = useTheme();
  // Paisa's elasticCard: the whole row dips under the finger, lets go on scroll.
  const press = useElasticPress({ maxStretch: 0.012, maxTranslate: 1, pressedScale: 0.98, releaseOnDrag: true });
  const when = describeWhen(task.due_at);
  const hasNotes = task.markdown.trim().length > 0;
  const childCount = task.children.length;
  const doneChildren = task.children.filter((c) => c.completed).length;
  const listLabel = showList && depth === 0 ? task.list_name : '';
  const focusUid = usePomodoroStore((s) => (s.phase === 'idle' ? null : s.taskUid));
  const isFocused = focusUid === task.uid;
  // Minutes logged against this to-do, from pomodoros, stopwatches and manual entries.
  const loggedMinutes = usePomodoroStore((s) => {
    let total = 0;
    for (const session of s.sessions) if (session.taskUid === task.uid) total += session.minutes;
    return Math.round(total);
  });
  const focusEnabled = process.env.EXPO_OS !== 'web' && !task.completed && (isFocused || showFocus);
  const pending = task.pending_sync === true;
  const repeat = task.rrule ? describeRrule(task.rrule) : null;
  const showMeta = Boolean(when || listLabel || pending || repeat || loggedMinutes > 0);

  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.medium1).easing(EASING.emphasizedDecelerate)}
      exiting={FadeOut.duration(DURATION.short4).easing(EASING.emphasizedAccelerate)}
      // Paisa: rows glide to their new place and settle with a small bounce.
      layout={listPlacement()}>
      {/* Dimming lives on an inner view: the layout animation owns the outer opacity. */}
      {/* Android rows dip like Paisa's cards; iOS rows keep the system highlight, as in Things. */}
      <Animated.View {...(ROW_ELASTIC ? press.handlers : null)} style={ROW_ELASTIC ? press.style : undefined}>
      {ROW_ELASTIC ? <PressGlow press={press} color={withAlpha(colors.accent, 0.1)} radius={16} size={56} /> : null}
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
          {selecting ? (
            <Pressable
              onPress={() => {
                haptics.toggle(!checked);
                onOpen(task);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`Select ${task.title}`}
              style={{ width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View key={checked ? 'on' : 'off'} entering={ZoomIn.springify().damping(PAISA.arrow.damping).stiffness(PAISA.arrow.stiffness)}>
                <MaterialCommunityIcons
                  name={checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                  size={24}
                  color={checked ? colors.accent : colors.text3}
                />
              </Animated.View>
            </Pressable>
          ) : (
            <TaskCheckbox
              checked={task.completed}
              onToggle={() => onToggle(task)}
              label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
            />
          )}
        </View>

        <Pressable
          onPress={() => {
            haptics.tap();
            onOpen(task);
          }}
          onPressOut={press.release}
          onLongPress={
            onLongPress
              ? () => {
                  haptics.longPress();
                  onLongPress(task);
                }
              : undefined
          }
          accessibilityRole="button"
          accessibilityHint={selecting ? 'Selects the to-do' : 'Opens the to-do in place'}
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
            {task.pinned ? (
              <MaterialCommunityIcons name="pin" size={15} color={colors.accent} accessibilityLabel="Pinned" />
            ) : null}
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
            {task.attachments?.length ? (
              <MaterialCommunityIcons
                name="paperclip"
                size={15}
                color={colors.text3}
                accessibilityLabel={`${task.attachments.length} attachment${task.attachments.length === 1 ? '' : 's'}`}
              />
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
              {repeat ? (
                <View className="flex-row items-center gap-1" accessibilityLabel={repeat}>
                  <MaterialCommunityIcons name="repeat" size={13} color={colors.text2} />
                  {when ? null : <Text style={{ fontSize: 13, color: colors.text2 }}>{repeat}</Text>}
                </View>
              ) : null}
              {loggedMinutes > 0 ? (
                <View className="flex-row items-center gap-1" accessibilityLabel={`${formatMinutes(loggedMinutes)} logged`}>
                  <MaterialCommunityIcons name="timer-outline" size={13} color={colors.text2} />
                  <Text style={{ fontSize: 13, color: colors.text2 }}>{formatMinutes(loggedMinutes)}</Text>
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
              haptics.tap();
              // Opens the timer on this to-do; pick a pomodoro or the stopwatch there.
              if (!isFocused) usePomodoroStore.getState().selectTask({ uid: task.uid, title: task.title });
              router.push('/pomodoro');
            }}
            hitSlop={8}
            accessibilityLabel={isFocused ? 'Open the running timer' : 'Time this to-do with a pomodoro or stopwatch'}
            accessibilityRole="button"
            style={({ pressed }) => ({
              opacity: pressed ? 0.5 : 1,
              width: MIN_TOUCH_TARGET,
              height: MIN_TOUCH_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
            })}>
            <MaterialCommunityIcons
              name={isFocused ? 'timer-sand' : 'timer-outline'}
              size={22}
              color={isFocused ? colors.accent : colors.text3}
            />
          </Pressable>
        ) : null}
      </View>
      </Animated.View>

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
