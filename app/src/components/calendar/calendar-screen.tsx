import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, type ScrollView as RNScrollView, View as RNView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  ReduceMotion,
  SlideInLeft,
  SlideInRight,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { M3MonthCard, type DayMark } from '@/components/calendar/m3-month';
import { useTheme } from '@/components/theme/context';
import { TaskCheckbox } from '@/components/tasks/task-checkbox';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { Frost, FrostTarget } from '@/components/ui/frost';
import { RiseIn } from '@/components/ui/motion';
import { haptics } from '@/lib/haptics';
import { expandLayout, PAISA } from '@/lib/motion';
import { listSwatch, swatchColors } from '@/lib/smart-lists';
import { withAlpha } from '@/lib/theme';
import { formatBlock, formatLength, formatTime, minuteOfDay, placeBlocks } from '@/lib/time-block';
import { dayKey } from '@/stores/pomodoro-store';
import { Text, View } from '@/tw';

import { type DayItem, keyToDate, useCalendarModel, weekOf } from './use-calendar-model';

const HOUR = 64;
const LABEL_WIDTH = 56;
const BAR_HEIGHT = 64;
const REDUCE = { reduceMotion: ReduceMotion.System } as const;

const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const dateLine = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' });
const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const hourLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });

/**
 * Android calendar: a day planner. Big day title with an Add task pill, a week
 * strip, the day's to-dos with no time as chips, then an hour timeline with
 * each time block as a soft pastel card in its list's colour, a red now line,
 * and a play button that starts the focus timer for the block. Tapping an
 * empty hour starts a new block there. The month picker opens from the month
 * name. The top bar is frosted glass over the page.
 */
export function CalendarScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const model = useCalendarModel();
  const { now, todayKey, selected, setSelected, selectedDate, mondayFirst, byDay, dayItems } = model;
  const target = useRef<RNView | null>(null);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [showMonth, setShowMonth] = useState(false);
  const [month, setMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const [direction, setDirection] = useState<1 | -1>(1);
  const [timelineY, setTimelineY] = useState<number | null>(null);

  const timed = dayItems.filter((it) => it.block);
  const untimed = dayItems.filter((it) => !it.block);
  const planned = timed.reduce(
    (sum, it) => sum + (it.task.start_at && it.block ? (it.block.end.getTime() - it.block.start.getTime()) / 60_000 : 0),
    0
  );
  const open = dayItems.filter((it) => !it.projected && !it.task.completed).length;

  // Bring the morning (or now, on today) into view when the day changes.
  useEffect(() => {
    if (timelineY == null) return;
    const firstHour = timed.length ? Math.min(...timed.map((it) => it.block!.start.getHours())) : 8;
    const hour = selected === todayKey ? Math.max(0, now.getHours() - 1) : Math.max(0, firstHour - 1);
    const frame = requestAnimationFrame(() =>
      (scrollRef.current as unknown as RNScrollView | null)?.scrollTo({ y: timelineY + hour * HOUR - 140, animated: true })
    );
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, timelineY]);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  const smallTitle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [50, 90], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [50, 90], [8, 0], Extrapolation.CLAMP) }],
  }));
  const hairline = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 24], [0, 1], Extrapolation.CLAMP),
  }));

  const marks = useMemo(() => {
    const out = new Map<string, DayMark[]>();
    for (const [key, items] of byDay) {
      out.set(key, items.map((it) => ({ kind: it.projected ? 'projected' : it.task.completed ? 'done' : 'open' })));
    }
    return out;
  }, [byDay]);

  const title = selected === todayKey ? 'Today' : weekdayLong.format(selectedDate);
  const select = (key: string) => {
    haptics.selection();
    setSelected(key);
    const date = keyToDate(key);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <FrostTarget target={target} style={{ flex: 1, backgroundColor: colors.bg }}>
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: insets.top + BAR_HEIGHT, paddingBottom: insets.bottom + 48 }}>
          {/* Title and Add task */}
          <RiseIn style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Animated.Text
                key={title}
                entering={FadeIn.duration(220)}
                style={{ fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1, color: colors.text }}>
                {title}
              </Animated.Text>
              <Text style={{ fontSize: 16, color: colors.text2, marginTop: 4 }}>
                {selected === todayKey ? `${dateLine.format(selectedDate)} · ` : ''}
                {open} open{planned > 0 ? ` · ${formatLength(Math.round(planned))} planned` : ''}
              </Text>
            </View>
            {model.canCreate ? <AddTaskPill onPress={() => model.create()} /> : null}
          </RiseIn>

          {/* Month name opens the month picker */}
          <Pressable
            onPress={() => {
              haptics.tap();
              setShowMonth((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: showMonth }}
            accessibilityLabel={`${monthTitle.format(selectedDate)}. ${showMonth ? 'Hide' : 'Show'} month`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 20, marginTop: 22, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 20, fontWeight: '500', color: colors.text }}>{monthTitle.format(selectedDate)}</Text>
            <Chevron open={showMonth} />
          </Pressable>
          {showMonth ? (
            <Animated.View entering={FadeIn.duration(200)} layout={expandLayout()} style={{ paddingHorizontal: 16, marginTop: 12 }}>
              <M3MonthCard
                month={month}
                direction={direction}
                mondayFirst={mondayFirst}
                selected={selected}
                todayKey={todayKey}
                marks={marks}
                onSelect={(key) => {
                  select(key);
                  setShowMonth(false);
                }}
                onShift={(months) => {
                  haptics.selection();
                  setDirection(months > 0 ? 1 : -1);
                  setMonth((m) => new Date(m.getFullYear(), m.getMonth() + months, 1));
                }}
                onJump={(next, selectKey) => {
                  setDirection(next.getTime() >= month.getTime() ? 1 : -1);
                  setMonth(next);
                  if (selectKey) select(selectKey);
                }}
              />
            </Animated.View>
          ) : null}

          <WeekStrip
            selected={selected}
            todayKey={todayKey}
            mondayFirst={mondayFirst}
            busy={(key) => (byDay.get(key)?.length ?? 0) > 0}
            onSelect={select}
          />

          {/* To-dos with no time of day */}
          {untimed.length ? (
            <Animated.View layout={expandLayout()} style={{ paddingHorizontal: 16, marginTop: 8, gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text2, paddingHorizontal: 4 }}>Anytime</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {untimed.map((item, i) => (
                  <RiseIn key={`${item.task.id}-${item.projected}`} index={i} rise={6}>
                    <AnytimeChip item={item} index={model.colorIndex.get(item.task.list_id) ?? 0} onOpen={model.open} onToggle={model.toggle} />
                  </RiseIn>
                ))}
              </View>
            </Animated.View>
          ) : null}

          <View onLayout={(e) => setTimelineY(e.nativeEvent.layout.y)} style={{ marginTop: 16 }}>
            <Timeline
              items={timed}
              isToday={selected === todayKey}
              now={now}
              colorIndex={model.colorIndex}
              runningUid={model.runningUid}
              onOpen={model.open}
              onToggle={model.toggle}
              onFocus={model.focus}
              onCreateAt={model.canCreate ? (hour) => model.create(hour) : undefined}
            />
          </View>
        </Animated.ScrollView>
      </FrostTarget>

      {/* Frosted top bar */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + BAR_HEIGHT, overflow: 'hidden' }}>
        <Frost target={target} />
        <View style={{ marginTop: insets.top, height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 }}>
          <RoundIcon icon="arrow-left" label="Back" onPress={() => router.back()} />
          <Animated.Text numberOfLines={1} style={[{ flex: 1, fontSize: 20, fontWeight: '600', color: colors.text }, smallTitle]}>
            {title}
          </Animated.Text>
          {selected !== todayKey ? (
            <Animated.View entering={FadeIn.duration(180)}>
              <RoundIcon icon="calendar-today" label="Go to today" onPress={() => select(todayKey)} />
            </Animated.View>
          ) : null}
        </View>
        <Animated.View
          style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: colors.separator }, hairline]}
        />
      </View>
    </View>
  );
}

function Chevron({ open }: { open: boolean }) {
  const { colors } = useTheme();
  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    turn.set(withSpring(open ? 1 : 0, { ...PAISA.arrow, ...REDUCE }));
  }, [open, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));
  return (
    <Animated.View style={style}>
      <MaterialCommunityIcons name="chevron-down" size={22} color={colors.text2} />
    </Animated.View>
  );
}

function RoundIcon({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const press = useElasticPress({ maxStretch: 0.08, maxTranslate: 2, pressedScale: 0.9 });
  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <PressGlow press={press} color={withAlpha(colors.text, 0.12)} radius={24} size={24} />
        <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
      </Pressable>
    </Animated.View>
  );
}

/** The filled "Add task" pill from the title row. Its plus turns a quarter on press. */
function AddTaskPill({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const press = useElasticPress({ maxStretch: 0.06, maxTranslate: 2, pressedScale: 0.94 });
  const plus = useAnimatedStyle(() => ({ transform: [{ rotate: `${press.glow.value * 90}deg` }] }));
  return (
    <Animated.View {...press.handlers} style={[press.style, { marginTop: 6 }]}>
      <Pressable
        onPress={onPress}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel="Add task"
        style={{
          height: 52,
          borderRadius: 26,
          paddingHorizontal: 22,
          overflow: 'hidden',
          backgroundColor: colors.accent,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          boxShadow: `0 6px 16px ${withAlpha(colors.accent, 0.3)}`,
        }}>
        <PressGlow press={press} color={withAlpha('#FFFFFF', 0.22)} radius={26} />
        <Animated.View style={plus}>
          <MaterialCommunityIcons name="plus" size={20} color={colors.onAccent} />
        </Animated.View>
        <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '700' }}>Add task</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Seven days, swipe for the next or previous week. The chosen day sits in a filled circle that pops in. */
function WeekStrip({
  selected,
  todayKey,
  mondayFirst,
  busy,
  onSelect,
}: {
  selected: string;
  todayKey: string;
  mondayFirst: boolean;
  busy: (key: string) => boolean;
  onSelect: (key: string) => void;
}) {
  const days = weekOf(keyToDate(selected), mondayFirst);
  const [direction, setDirection] = useState<1 | -1>(1);
  const shift = (weeks: number) => {
    setDirection(weeks > 0 ? 1 : -1);
    const next = keyToDate(selected);
    next.setDate(next.getDate() + weeks * 7);
    onSelect(dayKey(next));
  };
  const swipe = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .runOnJS(true)
    .onEnd((event) => {
      if (event.translationX < -50 || event.velocityX < -600) shift(1);
      else if (event.translationX > 50 || event.velocityX > 600) shift(-1);
    });
  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        key={dayKey(days[0])}
        entering={(direction > 0 ? SlideInRight : SlideInLeft)
          .springify()
          .damping(PAISA.expand.damping)
          .stiffness(PAISA.expand.stiffness)
          .reduceMotion(ReduceMotion.System)}
        style={{ flexDirection: 'row', paddingHorizontal: 10, marginTop: 14 }}>
        {days.map((date) => {
          const key = dayKey(date);
          return (
            <WeekDay
              key={key}
              date={date}
              selected={key === selected}
              today={key === todayKey}
              busy={busy(key)}
              onPress={() => onSelect(key)}
            />
          );
        })}
      </Animated.View>
    </GestureDetector>
  );
}

function WeekDay({
  date,
  selected,
  today,
  busy,
  onPress,
}: {
  date: Date;
  selected: boolean;
  today: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.set(selected ? withSequence(withTiming(0.6, { duration: 0 }), withSpring(1, { damping: 11, stiffness: 320, ...REDUCE })) : withTiming(0, { duration: 140 }));
  }, [selected, on]);
  const circle = useAnimatedStyle(() => ({ opacity: Math.min(1, on.value), transform: [{ scale: on.value }] }));
  const ink = selected ? colors.onAccent : today ? colors.accent : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${weekdayLong.format(date)} ${date.getDate()}${today ? ', today' : ''}`}
      style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 4 }}>
      <Text style={{ fontSize: 14, color: today ? colors.accent : colors.text2, fontWeight: today ? '600' : '400' }}>
        {weekdayShort.format(date)}
      </Text>
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={[
            { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent },
            circle,
          ]}
        />
        <Text style={{ fontSize: 18, fontWeight: '700', color: ink, fontVariant: ['tabular-nums'] }}>{date.getDate()}</Text>
      </View>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: busy && !selected ? colors.accent : 'transparent',
        }}
      />
    </Pressable>
  );
}

function AnytimeChip({
  item,
  index,
  onOpen,
  onToggle,
}: {
  item: DayItem;
  index: number;
  onOpen: (task: DayItem['task']) => void;
  onToggle: (task: DayItem['task']) => void;
}) {
  const { scheme } = useTheme();
  const { fill, ink } = swatchColors(listSwatch(index), scheme === 'dark');
  const { task, projected } = item;
  const done = task.completed && !projected;
  return (
    <Pressable
      onPress={() => onOpen(task)}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 16,
        minHeight: 44,
        borderRadius: 22,
        backgroundColor: projected ? 'transparent' : fill,
        borderWidth: projected ? 1.5 : 0,
        borderStyle: 'dashed',
        borderColor: fill,
        opacity: pressed ? 0.8 : done ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}>
      <View style={{ opacity: projected ? 0.4 : 1 }}>
        <TaskCheckbox
          checked={done}
          onToggle={() => {
            if (!projected) onToggle(task);
          }}
          label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
        />
      </View>
      <Text
        numberOfLines={1}
        style={{ maxWidth: 220, fontSize: 15, fontWeight: '600', color: projected ? undefined : ink, textDecorationLine: done ? 'line-through' : 'none' }}>
        {task.title}
      </Text>
    </Pressable>
  );
}

/** The day's hours with the time blocks laid over them. */
function Timeline({
  items,
  isToday,
  now,
  colorIndex,
  runningUid,
  onOpen,
  onToggle,
  onFocus,
  onCreateAt,
}: {
  items: DayItem[];
  isToday: boolean;
  now: Date;
  colorIndex: Map<string, number>;
  runningUid: string | null;
  onOpen: (task: DayItem['task']) => void;
  onToggle: (task: DayItem['task']) => void;
  onFocus: (task: DayItem['task']) => void;
  onCreateAt?: (hour: number) => void;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const placed = useMemo(
    () => placeBlocks(items.map((item) => ({ item, block: item.block! }))),
    [items]
  );
  const lane = width - LABEL_WIDTH - 16;
  const nowTop = (minuteOfDay(now) / 60) * HOUR;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HOUR * 24 + 16 }}>
      {/* Tapping an empty hour adds a block there. */}
      <Pressable
        disabled={!onCreateAt}
        onPress={(e) => onCreateAt?.(Math.min(23, Math.floor(e.nativeEvent.locationY / HOUR)))}
        accessibilityLabel="Add a to-do at this hour"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {Array.from({ length: 24 }, (_, h) => (
          <View key={h} style={{ position: 'absolute', top: h * HOUR, left: 0, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ width: LABEL_WIDTH, textAlign: 'right', fontSize: 12, color: colors.text3, fontVariant: ['tabular-nums'] }}>
              {h === 0 ? '' : hourLabel.format(new Date(2000, 0, 1, h))}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: withAlpha(colors.separator, 0.8) }} />
          </View>
        ))}
      </Pressable>

      {width > 0
        ? placed.map(({ item, block, lane: col, lanes }, i) => {
            const top = (minuteOfDay(block.start) / 60) * HOUR + 2;
            const height = Math.max(40, ((block.end.getTime() - block.start.getTime()) / 3_600_000) * HOUR - 4);
            const colWidth = lane / lanes;
            return (
              <RiseIn
                key={`${item.task.id}-${item.projected}-${i}`}
                index={i}
                rise={10}
                style={{ position: 'absolute', top, left: LABEL_WIDTH + 12 + col * colWidth, width: colWidth - 4, height }}>
                <TimeBlockCard
                  item={item}
                  height={height}
                  index={colorIndex.get(item.task.list_id) ?? 0}
                  running={!item.projected && runningUid === item.task.uid}
                  narrow={lanes > 1}
                  onOpen={onOpen}
                  onToggle={onToggle}
                  onFocus={onFocus}
                />
              </RiseIn>
            );
          })
        : null}

      {isToday ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: nowTop - 10, left: 0, right: 0, height: 20, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: LABEL_WIDTH + 4, alignItems: 'flex-end' }}>
            <View style={{ backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatTime(now)}</Text>
            </View>
          </View>
          <NowDot />
          <View style={{ flex: 1, height: 2, backgroundColor: colors.red, marginRight: 16 }} />
        </View>
      ) : null}
    </View>
  );
}

/** A dot on the now line that breathes. */
function NowDot() {
  const { colors } = useTheme();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(withRepeat(withSequence(withTiming(1.5, { duration: 900 }), withTiming(1, { duration: 900 })), -1, false));
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 1.6 - pulse.value }));
  return (
    <View style={{ width: 10, height: 10, marginLeft: 4, marginRight: -2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: withAlpha(colors.red, 0.35) }, ring]} />
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red }} />
    </View>
  );
}

function TimeBlockCard({
  item,
  height,
  index,
  running,
  narrow,
  onOpen,
  onToggle,
  onFocus,
}: {
  item: DayItem;
  height: number;
  index: number;
  running: boolean;
  narrow: boolean;
  onOpen: (task: DayItem['task']) => void;
  onToggle: (task: DayItem['task']) => void;
  onFocus: (task: DayItem['task']) => void;
}) {
  const { scheme } = useTheme();
  const dark = scheme === 'dark';
  const { fill, ink } = swatchColors(listSwatch(index), dark);
  const { task, projected, block } = item;
  const done = task.completed && !projected;
  const radius = Math.min(26, height / 2);
  const press = useElasticPress({ maxStretch: 0.02, maxTranslate: 1.5, pressedScale: 0.97, releaseOnDrag: true });
  const notes = task.markdown.replace(/[#*_>`-]/g, '').trim().split('\n').find(Boolean);
  const showTime = height >= 58;
  const showNotes = height >= 100 && !!notes && !narrow;

  // A block in focus breathes a ring of its own ink.
  const breathe = useSharedValue(0);
  useEffect(() => {
    breathe.set(running ? withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0.2, { duration: 1100 })), -1, false) : withTiming(0, { duration: 200 }));
  }, [running, breathe]);
  const ring = useAnimatedStyle(() => ({ borderWidth: 2.5 * breathe.value }));

  return (
    <Animated.View {...press.handlers} style={[press.style, { flex: 1 }]}>
      <Pressable
        onPress={() => onOpen(task)}
        onLongPress={() => {
          if (projected) return;
          haptics.impact('medium');
          onToggle(task);
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}, ${block ? formatBlock(block) : ''}${done ? ', done' : ''}${running ? ', in focus' : ''}`}
        accessibilityHint="Long press to tick it off"
        style={{ flex: 1 }}>
        <Animated.View
          style={[
            {
              flex: 1,
              borderRadius: radius,
              borderCurve: 'continuous',
              overflow: 'hidden',
              backgroundColor: projected ? withAlpha(fill, 0.25) : fill,
              borderColor: ink,
              paddingHorizontal: 16,
              paddingVertical: height < 58 ? 0 : 12,
              justifyContent: height < 58 ? 'center' : 'flex-start',
              opacity: done ? 0.55 : 1,
            },
            ring,
          ]}>
          <PressGlow press={press} color={withAlpha(ink, dark ? 0.14 : 0.1)} radius={radius} size={60} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={height < 58 ? 1 : 2}
                style={{ fontSize: 15, fontWeight: '700', color: ink, textDecorationLine: done ? 'line-through' : 'none' }}>
                {task.title}
              </Text>
              {showTime && block ? (
                <Text numberOfLines={1} style={{ fontSize: 13, color: withAlpha(ink, 0.7), marginTop: 2 }}>
                  {running ? 'In focus · ' : ''}
                  {formatBlock(block)}
                </Text>
              ) : null}
              {showNotes ? (
                <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: withAlpha(ink, 0.75), marginTop: 6 }}>
                  {notes}
                </Text>
              ) : null}
            </View>
            {!projected && !done ? <FocusButton ink={ink} running={running} onPress={() => onFocus(task)} /> : null}
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** Small round play button on a block: starts the focus timer for it. */
function FocusButton({ ink, running, onPress }: { ink: string; running: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <Pressable
        onPressIn={() => scale.set(withTiming(0.85, { duration: 80 }))}
        onPressOut={() => scale.set(withSpring(1, { damping: 8, stiffness: 320, ...REDUCE }))}
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={running ? 'Open the focus timer' : 'Start the focus timer for this block'}
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withAlpha('#FFFFFF', 0.55),
        }}>
        <MaterialCommunityIcons name={running ? 'timer-sand' : 'play'} size={17} color={ink} />
      </Pressable>
    </Animated.View>
  );
}
