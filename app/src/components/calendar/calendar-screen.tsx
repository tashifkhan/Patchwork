import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, type ScrollView as RNScrollView } from 'react-native';
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
import { TaskCheckbox } from '@/features/tasks/task-checkbox';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { FabMenu } from '@/components/ui/fab-menu';
import { NativeAlert } from '@/components/ui/native-alert';
import { RiseIn } from '@/components/ui/motion';
import { haptics } from '@/lib/haptics';
import { expandLayout, PAISA } from '@/lib/motion';
import { listTone } from '@/lib/smart-lists';
import { useTabBarContentPadding } from '@/lib/tab-bar';
import { withAlpha } from '@/lib/theme';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { formatBlock, formatTime, minuteOfDay, placeBlocks } from '@/lib/time-block';
import { dayKey } from '@/stores/pomodoro-store';
import { Text, View } from '@/tw';

import { eventTone } from './calendar-tones';
import { type CalendarModel, type DayItem, keyToDate, useCalendarModel, weekOf } from './use-calendar-model';
import { WeekCalendar } from './week-calendar';

const HOUR = 64;
const LABEL_WIDTH = 56;
/** Room above midnight so the first hour line isn't flush with the edge. */
const TIMELINE_PAD = 12;
const REDUCE = { reduceMotion: ReduceMotion.System } as const;

const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const hourLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });

/**
 * Android calendar: a month picker, a week strip, the day's to-dos with no
 * time as chips, then an hour timeline with
 * each time block as a soft pastel card in its list's colour, a red now line,
 * and a play button that starts the focus timer for the block. Tapping an
 * empty hour starts a new block there. The month picker opens from the month
 * name. The header stays put; only the hours scroll, opening on the now line.
 */
export function CalendarScreen() {
  const model = useCalendarModel();
  const { twoPane } = useAdaptiveLayout();
  // Tablets, unfolded foldables and landscape get the whole week as columns.
  return twoPane ? <WeekCalendar model={model} /> : <DayCalendar model={model} />;
}

function DayCalendar({ model }: { model: CalendarModel }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const timelineBottom = useTabBarContentPadding(model.createItems.length ? 84 : 24);
  const { now, todayKey, selected, setSelected, selectedDate, mondayFirst, byDay, dayItems } = model;
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const [showMonth, setShowMonth] = useState(false);
  const [month, setMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const [direction, setDirection] = useState<1 | -1>(1);
  /** Height of the scrolling timeline, to place the now line a third of the way down. */
  const [viewport, setViewport] = useState(0);
  /** Bumped on every day tap, so tapping the current day still recenters. */
  const [recenter, setRecenter] = useState(0);

  const timed = dayItems.filter((it) => it.block);
  const untimed = dayItems.filter((it) => !it.block);
  // Only the timeline scrolls, and it holds the whole day so earlier events
  // are a scroll up. On today, the now line sits a third of the way down;
  // other days open at their first block, or 8 am.
  const firstMinute = timed.length ? Math.min(...timed.map((it) => minuteOfDay(it.block!.start))) : 8 * 60;
  const focusMinute = selected === todayKey ? minuteOfDay(now) : firstMinute;
  const placed = useRef(false);
  useEffect(() => {
    if (!viewport) return;
    const y = Math.max(0, (focusMinute / 60) * HOUR + TIMELINE_PAD - (selected === todayKey ? viewport / 3 : 24));
    const animated = placed.current;
    placed.current = true;
    const frame = requestAnimationFrame(() =>
      (scrollRef.current as unknown as RNScrollView | null)?.scrollTo({ y, animated })
    );
    return () => cancelAnimationFrame(frame);
    // Recenter on a new day, a tap on a day, or once the size is known; not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, recenter, viewport]);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  // A hairline over the timeline once it scrolls under the header.
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

  const monthLabel = monthTitle.format(selectedDate);
  const select = (key: string) => {
    haptics.selection();
    setSelected(key);
    setRecenter((n) => n + 1);
    const date = keyToDate(key);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, paddingRight: 8 }}>
          <Pressable
            onPress={() => {
              haptics.tap();
              setShowMonth((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: showMonth }}
            accessibilityLabel={`${monthLabel}. ${showMonth ? 'Hide' : 'Show'} month`}
            style={{ minHeight: 48, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 20 }}>
            <Text style={{ flexShrink: 1, fontSize: 20, fontWeight: '500', color: colors.text }}>{monthLabel}</Text>
            <Chevron open={showMonth} />
          </Pressable>
          {selected !== todayKey ? (
            <Animated.View entering={FadeIn.duration(180)}>
              <RoundIcon icon="calendar-today" label="Go to today" onPress={() => select(todayKey)} />
            </Animated.View>
          ) : null}
        </View>
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
            {/* One row that scrolls sideways, so the timeline keeps its room. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -16 }}>
              <View style={{ width: 8 }} />
              {untimed.map((item, i) => (
                <RiseIn key={`${item.task.id}-${item.projected}`} index={i} rise={6}>
                  <AnytimeChip item={item} index={model.colorIndex.get(item.task.list_id) ?? 0} onOpen={model.open} onToggle={model.toggle} />
                </RiseIn>
              ))}
              <View style={{ width: 8 }} />
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>

      {/* Only the hours scroll. */}
      <View style={{ flex: 1, marginTop: 8 }} onLayout={(e) => setViewport(e.nativeEvent.layout.height)}>
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: TIMELINE_PAD, paddingBottom: timelineBottom }}>
          <Timeline
            startHour={0}
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
        </Animated.ScrollView>
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: colors.separator }, hairline]}
        />
      </View>
      {model.createItems.length ? <FabMenu items={model.createItems} accessibilityLabel="Add task or event" /> : null}
      <NativeAlert
        visible={model.eventError != null}
        title="New event"
        message={model.eventError ?? ''}
        onDismiss={model.clearEventError}
      />
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
  const { colors, scheme } = useTheme();
  const { fill, ink } = item.event ? eventTone(colors, scheme === 'dark', item.event.color) : listTone(colors, scheme === 'dark', index);
  const { task, projected } = item;
  const done = task.completed && !projected;
  return (
    <Pressable
      onPress={() => onOpen(task)}
      accessibilityRole="button"
      accessibilityLabel={item.event ? `${task.title}, ${item.event.calendarTitle}, all day` : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: item.event ? 14 : 0,
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
      {item.event ? (
        <MaterialCommunityIcons name="calendar-blank-outline" size={16} color={ink} style={{ marginRight: 8 }} />
      ) : (
        <View style={{ opacity: projected ? 0.4 : 1 }}>
          <TaskCheckbox
            checked={done}
            onToggle={() => {
              if (!projected) onToggle(task);
            }}
            label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
          />
        </View>
      )}
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
  startHour,
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
  startHour: number;
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
  // Blocks sit on the grid: from just past the hour labels to the lines' end.
  const left = LABEL_WIDTH + 12;
  const lane = width - left - 16;
  const offset = startHour * 60;
  const hours = 24 - startHour;
  const nowTop = ((minuteOfDay(now) - offset) / 60) * HOUR;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HOUR * hours + 16, marginTop: 8 }}>
      {/* Tapping an empty hour adds a block there. */}
      <Pressable
        disabled={!onCreateAt}
        onPress={(e) => onCreateAt?.(Math.min(23, startHour + Math.floor(e.nativeEvent.locationY / HOUR)))}
        accessibilityLabel="Add a to-do at this hour"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {Array.from({ length: hours }, (_, i) => {
          const h = startHour + i;
          return (
          <View key={h} style={{ position: 'absolute', top: i * HOUR - 8, left: 0, right: 16, height: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ width: LABEL_WIDTH, textAlign: 'right', fontSize: 12, color: colors.text3, fontVariant: ['tabular-nums'] }}>
              {h === 0 ? '' : hourLabel.format(new Date(2000, 0, 1, h))}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: withAlpha(colors.separator, 0.8) }} />
          </View>
          );
        })}
      </Pressable>

      {width > 0
        ? placed.map(({ item, block, lane: col, lanes }, i) => {
            const top = ((minuteOfDay(block.start) - offset) / 60) * HOUR + 2;
            const height = Math.max(40, ((block.end.getTime() - block.start.getTime()) / 3_600_000) * HOUR - 4);
            const colWidth = lane / lanes;
            return (
              <RiseIn
                key={`${item.task.id}-${item.projected}-${i}`}
                index={i}
                rise={10}
                style={{ position: 'absolute', top, left: left + col * colWidth, width: colWidth - (lanes > 1 ? 4 : 0), height }}>
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
              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {formatTime(now).replace(/\s?[AP]M$/i, '')}
              </Text>
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
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { fill, ink } = item.event ? eventTone(colors, dark, item.event.color) : listTone(colors, dark, index);
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
          if (projected || item.event) return;
          haptics.impact('medium');
          onToggle(task);
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={
          item.event
            ? `${task.title}, ${block ? formatBlock(block) : ''}, ${item.event.calendarTitle}`
            : `${task.title}, ${block ? formatBlock(block) : ''}${done ? ', done' : ''}${running ? ', in focus' : ''}`
        }
        accessibilityHint={item.event ? 'Opens in your calendar app' : 'Long press to tick it off'}
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
                  {item.event ? ` · ${item.event.calendarTitle}` : ''}
                </Text>
              ) : null}
              {showNotes ? (
                <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: withAlpha(ink, 0.75), marginTop: 6 }}>
                  {notes}
                </Text>
              ) : null}
            </View>
            {item.event ? (
              <MaterialCommunityIcons name="calendar-blank-outline" size={18} color={withAlpha(ink, 0.8)} />
            ) : !projected && !done ? (
              <FocusButton ink={ink} running={running} onPress={() => onFocus(task)} />
            ) : null}
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
