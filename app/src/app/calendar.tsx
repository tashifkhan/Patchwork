import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  ReduceMotion,
  SlideInLeft,
  SlideInRight,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { ElasticPressable, RiseIn, useSpringValue } from '@/components/ui/motion';

import type { Task } from '@/api/types';
import { TaskCheckbox } from '@/components/tasks/task-checkbox';
import { useTheme } from '@/components/theme/context';
import { useCreateTask, useTaskLists, useTasks, useUpdateTask } from '@/hooks/use-tasks';
import { playSound } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { DURATION, PAISA } from '@/lib/motion';
import { parseQuickAdd } from '@/lib/quick-add';
import { describeRrule, nextDue } from '@/lib/recurrence';
import { togglePatch } from '@/lib/task-actions';
import { flattenTasks } from '@/lib/task-buckets';
import { atDay } from '@/lib/when';
import { dayKey } from '@/stores/pomodoro-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayTitle = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const narrowDay = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

/** Upcoming repeats are drawn too, so a weekly to-do shows on every week. */
const REPEAT_PREVIEW = 60;

/**
 * A month of due dates. Tap a day to see its to-dos,
 * tick them off, or add one due that day (quick-add shorthand works here too).
 */
export default function CalendarScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const mondayFirst = useSettingsStore((s) => s.weekStartsMonday);
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const selectedListId = useUiStore((s) => s.selectedListId);
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(() => dayKey(today));
  const [draft, setDraft] = useState('');
  /** Which way the last month change went, so the grid slides that way. */
  const [direction, setDirection] = useState<1 | -1>(1);

  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);
  const targetList = lists.find((l) => l.id === selectedListId) ?? lists[0];

  // Due dates by day, plus where repeating to-dos will land next.
  const byDay = useMemo(() => {
    const map = new Map<string, { task: Task; projected: boolean }[]>();
    const add = (key: string, task: Task, projected: boolean) => map.set(key, [...(map.get(key) ?? []), { task, projected }]);
    const horizon = new Date(month.getFullYear(), month.getMonth() + 2, 0).getTime();
    for (const task of flattenTasks(tasksQuery.data ?? [])) {
      if (!task.due_at) continue;
      add(dayKey(new Date(task.due_at)), task, false);
      if (task.rrule && !task.completed) {
        let at: string | null = task.due_at;
        for (let i = 0; i < REPEAT_PREVIEW; i += 1) {
          at = nextDue(at, task.rrule, new Date(at));
          if (!at || new Date(at).getTime() > horizon) break;
          add(dayKey(new Date(at)), task, true);
        }
      }
    }
    return map;
  }, [month, tasksQuery.data]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() - (mondayFirst ? 1 : 0) + 7) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= days; d += 1) out.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (out.length % 7) out.push(null);
    return out;
  }, [month, mondayFirst]);

  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, mondayFirst ? 1 : 7); // a Monday / a Sunday
    return Array.from({ length: 7 }, (_, i) => narrowDay.format(new Date(base.getFullYear(), 0, base.getDate() + i)));
  }, [mondayFirst]);

  // Swipe the grid sideways to change month, like a pager.
  const swipe = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .runOnJS(true)
    .onEnd((event) => {
      if (event.translationX < -50 || event.velocityX < -600) shift(1);
      else if (event.translationX > 50 || event.velocityX > 600) shift(-1);
    });

  const cell = Math.floor((Math.min(width, 640) - 32) / 7);
  const todayKey = dayKey(today);
  const dayItems = byDay.get(selected) ?? [];
  const [y, m, d] = selected.split('-').map(Number);
  const selectedDate = new Date(y, m - 1, d);

  function shift(months: number) {
    haptics.selection();
    setDirection(months > 0 ? 1 : -1);
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + months, 1));
  }

  async function addForDay() {
    const quick = parseQuickAdd(draft);
    if (!targetList || !draft.trim()) return;
    setDraft('');
    if (quick.kind === 'list') return;
    const due = quick.due_at && /@\d{4}/.test(draft)
      ? (() => {
          const at = new Date(quick.due_at);
          const day = new Date(selectedDate);
          day.setHours(at.getHours(), at.getMinutes(), 0, 0);
          return day.toISOString();
        })()
      : atDay(selectedDate);
    try {
      await createTask.mutateAsync({ list_id: targetList.id, title: quick.title, tags: quick.tags, rrule: quick.rrule, due_at: due });
      haptics.success();
      playSound('add');
    } catch {
      // The list shows nothing new; the user can try again.
    }
  }

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      {/* The month is named on the page, under the arrows; the bar just says where you are. */}
      <Stack.Screen options={{ title: 'Calendar' }} />
      <View className="flex-row items-center justify-between" style={{ paddingVertical: 8 }}>
        <IconButton icon="chevron-left" label="Previous month" onPress={() => shift(-1)} />
        <Pressable
          onPress={() => {
            setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            setSelected(todayKey);
          }}
          accessibilityRole="button"
          accessibilityLabel="Go to today">
          <Text className="text-sf-text text-lg font-semibold">{monthTitle.format(month)}</Text>
        </Pressable>
        <IconButton icon="chevron-right" label="Next month" onPress={() => shift(1)} />
      </View>

      <View className="flex-row">
        {weekdays.map((name, i) => (
          <Text key={i} className="text-sf-text-3 text-center text-xs font-semibold" style={{ width: cell }}>
            {name}
          </Text>
        ))}
      </View>
      <GestureDetector gesture={swipe}>
      <Animated.View
        key={`${month.getFullYear()}-${month.getMonth()}`}
        entering={(direction > 0 ? SlideInRight : SlideInLeft)
          .springify()
          .damping(PAISA.expand.damping)
          .stiffness(PAISA.expand.stiffness)
          .reduceMotion(ReduceMotion.System)}
        exiting={FadeOut.duration(90)}
        style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
        {cells.map((date, i) => {
          if (!date) return <View key={`e${i}`} style={{ width: cell, height: cell }} />;
          const key = dayKey(date);
          const items = byDay.get(key) ?? [];
          const open = items.filter((it) => !it.task.completed).length;
          const isSelected = key === selected;
          const isToday = key === todayKey;
          return (
            <Pressable
              key={key}
              onPress={() => {
                haptics.selection();
                setSelected(key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${dayTitle.format(date)}, ${open} open`}
              style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' }}>
              <DayFace
                size={cell - 8}
                day={date.getDate()}
                selected={isSelected}
                today={isToday}
                dots={items.slice(0, 3).map((it) =>
                  it.task.completed ? colors.gray2 : it.projected ? colors.text3 : colors.accent
                )}
              />
            </Pressable>
          );
        })}
      </Animated.View>
      </GestureDetector>

      <Animated.View key={selected} entering={FadeIn.duration(DURATION.short4)} style={{ marginTop: 20, gap: 4 }}>
        <Text
          style={{
            fontSize: Platform.OS === 'ios' ? 17 : 16,
            fontWeight: '700',
            color: colors.accent,
            paddingBottom: 6,
          }}>
          {selected === todayKey ? 'Today' : dayTitle.format(selectedDate)}
        </Text>
        {dayItems.length === 0 ? (
          <Text className="text-sf-text-3 py-2 text-sm">Nothing due.</Text>
        ) : (
          dayItems.map(({ task, projected }, index) => (
            <RiseIn key={`${task.id}-${projected}`} index={index}>
            <View className="flex-row items-center" style={{ minHeight: 48 }}>
              <View style={{ marginLeft: -11, opacity: projected ? 0.4 : 1 }}>
                <TaskCheckbox
                  checked={!projected && task.completed}
                  onToggle={() => {
                    if (projected) return;
                    const { patch } = togglePatch(task);
                    if (!task.completed) playSound('complete');
                    updateTask.mutate({ taskId: task.id, accountId: task.account_id, patch });
                  }}
                  label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
                />
              </View>
              <Pressable
                style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
                onPress={() => router.push({ pathname: '/task/[uid]', params: { uid: task.uid } })}
                accessibilityRole="button">
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: 17,
                    color: task.completed && !projected ? colors.text3 : colors.text,
                    textDecorationLine: task.completed && !projected ? 'line-through' : 'none',
                  }}>
                  {task.title}
                </Text>
                <Text style={{ fontSize: 13, color: colors.text3 }} numberOfLines={1}>
                  {[projected ? describeRrule(task.rrule) : null, task.list_name].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
            </View>
            </RiseIn>
          ))
        )}
        {targetList ? (
          <View className="flex-row items-center gap-2" style={{ minHeight: 48 }}>
            <MaterialCommunityIcons name="plus" size={22} color={colors.accent} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => void addForDay()}
              submitBehavior="submit"
              returnKeyType="done"
              placeholder={`Add to ${targetList.name} on this day`}
              placeholderTextColor={colors.text3}
              accessibilityLabel="New to-do due this day"
              className="text-sf-text flex-1"
              style={{ fontSize: 17, paddingVertical: 10 }}
            />
          </View>
        ) : null}
      </Animated.View>
    </ScrollView>
  );
}

/**
 * One day of the grid. Selecting it morphs the shape from a rounded square
 * to a circle and fills it, on Paisa's expand spring; today is tonal.
 */
function DayFace({
  size,
  day,
  selected,
  today,
  dots,
}: {
  size: number;
  day: number;
  selected: boolean;
  today: boolean;
  dots: string[];
}) {
  const { colors } = useTheme();
  const on = useSpringValue(selected ? 1 : 0, 'expand');
  const face = useAnimatedStyle(() => ({
    borderRadius: interpolate(on.get(), [0, 1], [12, size / 2]),
    backgroundColor: interpolateColor(on.get(), [0, 1], [today ? colors.selectionBg : 'transparent', colors.accent]),
    transform: [{ scale: interpolate(on.get(), [0, 0.5, 1], [1, 0.9, 1]) }],
  }));
  return (
    <Animated.View
      style={[{ width: size, height: size, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' }, face]}>
      <Text
        style={{
          fontSize: 16,
          fontWeight: today || selected ? '700' : '400',
          color: selected ? colors.onAccent : today ? colors.onSelectionBg : colors.text,
          fontVariant: ['tabular-nums'],
        }}>
        {day}
      </Text>
      <View className="flex-row" style={{ gap: 3, height: 5, marginTop: 2 }}>
        {dots.map((color, n) => (
          <View key={n} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: selected ? colors.onAccent : color }} />
        ))}
      </View>
    </Animated.View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <ElasticPressable
      variant="button"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.separator, borderless: true, radius: 22 }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed && Platform.OS === 'ios' ? 0.5 : 1,
      })}>
      <MaterialCommunityIcons name={icon} size={26} color={colors.text2} />
    </ElasticPressable>
  );
}
