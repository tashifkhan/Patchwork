import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  SlideInLeft,
  SlideInRight,
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
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { FabMenu } from '@/components/ui/fab-menu';
import { RiseIn } from '@/components/ui/motion';
import { NativeAlert } from '@/components/ui/native-alert';
import { TaskCheckbox } from '@/features/tasks/task-checkbox';
import { NAVIGATION_RAIL_WIDTH, useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { haptics } from '@/lib/haptics';
import { PAISA } from '@/lib/motion';
import { listTone } from '@/lib/smart-lists';
import { useTabBarContentPadding } from '@/lib/tab-bar';
import { withAlpha } from '@/lib/theme';
import { formatBlock, formatTime, minuteOfDay, placeBlocks } from '@/lib/time-block';
import { dayKey } from '@/stores/pomodoro-store';
import { Text, View } from '@/tw';

import { eventTone } from './calendar-tones';
import { type CalendarModel, type DayItem, keyToDate, weekOf } from './use-calendar-model';

const HOUR = 56;
const GUTTER = 64;
/** Room above midnight so the first hour label isn't clipped. */
const GRID_PAD = 10;
/** The month and the day's agenda get their own pane from this content width. */
const SIDE_PANE_MIN = 1000;
const SIDE_PANE_WIDTH = 344;
/** All-day chips shown per day before "+N more". */
const ALL_DAY_ROWS = 2;
const REDUCE = { reduceMotion: ReduceMotion.System } as const;

const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const dayTitle = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const hourLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });

/** "November 2026", or "Nov – Dec 2026" when the week spans two months. */
function weekTitle(days: Date[]) {
  const first = days[0];
  const last = days[6];
  if (first.getMonth() === last.getMonth()) return monthTitle.format(first);
  const short = new Intl.DateTimeFormat(undefined, { month: 'short' });
  return first.getFullYear() === last.getFullYear()
    ? `${short.format(first)} – ${short.format(last)} ${last.getFullYear()}`
    : `${short.format(first)} ${first.getFullYear()} – ${short.format(last)} ${last.getFullYear()}`;
}

/**
 * The calendar on a tablet, unfolded foldable or landscape window: the whole
 * week as seven columns over one hour grid, an all-day row on top, and the now
 * line across today. On the widest windows the month card and the selected
 * day's agenda sit in a pane on the leading side; otherwise the month opens
 * from the title. Tapping an empty hour in any column starts a to-do there.
 */
export function WeekCalendar({ model }: { model: CalendarModel }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, navigationRail } = useAdaptiveLayout();
  const sidePane = width - (navigationRail ? NAVIGATION_RAIL_WIDTH : 0) >= SIDE_PANE_MIN;
  const { todayKey, selected, setSelected, selectedDate, mondayFirst, byDay } = model;
  const [showMonth, setShowMonth] = useState(false);
  const [month, setMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const [monthDirection, setMonthDirection] = useState<1 | -1>(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const days = useMemo(() => weekOf(keyToDate(selected), mondayFirst), [selected, mondayFirst]);
  const weekKey = dayKey(days[0]);

  const marks = useMemo(() => {
    const out = new Map<string, DayMark[]>();
    for (const [key, items] of byDay) {
      out.set(key, items.map((it) => ({ kind: it.projected ? 'projected' : it.task.completed ? 'done' : 'open' })));
    }
    return out;
  }, [byDay]);

  const select = (key: string) => {
    haptics.selection();
    const date = keyToDate(key);
    setDirection(date.getTime() >= selectedDate.getTime() ? 1 : -1);
    setSelected(key);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };
  const shiftWeek = (weeks: number) => {
    const next = keyToDate(selected);
    next.setDate(next.getDate() + weeks * 7);
    select(dayKey(next));
  };

  const monthCard = (
    <M3MonthCard
      month={month}
      direction={monthDirection}
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
        setMonthDirection(months > 0 ? 1 : -1);
        setMonth((m) => new Date(m.getFullYear(), m.getMonth() + months, 1));
      }}
      onJump={(next, selectKey) => {
        setMonthDirection(next.getTime() >= month.getTime() ? 1 : -1);
        setMonth(next);
        if (selectKey) select(selectKey);
      }}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {/* Title, then Today and the week arrows on the trailing side. */}
      <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12, paddingRight: 16 }}>
        <Pressable
          disabled={sidePane}
          onPress={() => {
            haptics.tap();
            setShowMonth((v) => !v);
          }}
          accessibilityRole={sidePane ? 'header' : 'button'}
          accessibilityState={sidePane ? undefined : { expanded: showMonth }}
          android_ripple={sidePane ? undefined : { color: withAlpha(colors.text, 0.1) }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 48, paddingHorizontal: 12, borderRadius: 24, overflow: 'hidden' }}>
          <Text style={{ fontSize: 22, fontWeight: '500', color: colors.text }}>{weekTitle(days)}</Text>
          {sidePane ? null : <MaterialCommunityIcons name={showMonth ? 'chevron-up' : 'chevron-down'} size={22} color={colors.text2} />}
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          disabled={selected === todayKey}
          onPress={() => {
            haptics.tap();
            select(todayKey);
          }}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
          android_ripple={{ color: withAlpha(colors.accent, 0.12) }}
          style={{
            height: 40,
            paddingHorizontal: 20,
            borderRadius: 20,
            justifyContent: 'center',
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.separator,
            opacity: selected === todayKey ? 0.5 : 1,
            marginRight: 8,
          }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>Today</Text>
        </Pressable>
        <IconButton icon="chevron-left" label="Previous week" onPress={() => shiftWeek(-1)} />
        <IconButton icon="chevron-right" label="Next week" onPress={() => shiftWeek(1)} />
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {sidePane ? (
          <ScrollView
            style={{ width: SIDE_PANE_WIDTH, flexGrow: 0 }}
            contentContainerStyle={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 120, gap: 20 }}
            showsVerticalScrollIndicator={false}>
            {monthCard}
            <DayAgenda model={model} />
          </ScrollView>
        ) : null}

        <WeekGrid model={model} days={days} weekKey={weekKey} direction={direction} onShiftWeek={shiftWeek} onSelectDay={select} />

        {/* Narrower windows: the month drops down from the title over the grid. */}
        {!sidePane && showMonth ? (
          <>
            <Pressable
              onPress={() => setShowMonth(false)}
              accessibilityLabel="Close month"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(120)}
              style={{ position: 'absolute', top: 0, left: 16, width: 360, borderRadius: 28, elevation: 3, backgroundColor: colors.bg3 }}>
              {monthCard}
            </Animated.View>
          </>
        ) : null}
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
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: withAlpha(colors.text, 0.12), borderless: true, radius: 24 }}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
    </Pressable>
  );
}

function WeekGrid({
  model,
  days,
  weekKey,
  direction,
  onShiftWeek,
  onSelectDay,
}: {
  model: CalendarModel;
  days: Date[];
  weekKey: string;
  direction: 1 | -1;
  onShiftWeek: (weeks: number) => void;
  onSelectDay: (key: string) => void;
}) {
  const { colors } = useTheme();
  const { now, todayKey, selected, byDay } = model;
  const bottom = useTabBarContentPadding(model.createItems.length ? 96 : 24);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [width, setWidth] = useState(0);
  const [viewport, setViewport] = useState(0);
  const column = width > 0 ? (width - GUTTER - 16) / 7 : 0;
  const keys = days.map(dayKey);
  const todayIndex = keys.indexOf(todayKey);

  const week = useMemo(
    () =>
      keys.map((key) => {
        const items = byDay.get(key) ?? [];
        const timed = items.filter((it) => it.block);
        return {
          key,
          allDay: items.filter((it) => !it.block),
          placed: placeBlocks(timed.map((item) => ({ item, block: item.block! }))),
        };
      }),
    // keys is derived from weekKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekKey, byDay]
  );
  const allDayRows = Math.min(ALL_DAY_ROWS + 1, Math.max(0, ...week.map((d) => d.allDay.length)));

  // Open on the now line a third of the way down, or the week's first block, or 8 am.
  const placedOnce = useRef(false);
  useEffect(() => {
    if (!viewport) return;
    const starts = week.flatMap((d) => d.placed.map((p) => minuteOfDay(p.block.start)));
    const minute = todayIndex >= 0 ? minuteOfDay(now) : starts.length ? Math.min(...starts) : 8 * 60;
    const y = Math.max(0, (minute / 60) * HOUR + GRID_PAD - (todayIndex >= 0 ? viewport / 3 : 24));
    const animated = placedOnce.current;
    placedOnce.current = true;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated }));
    return () => cancelAnimationFrame(frame);
    // Only when the week or the size changes, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey, viewport]);

  const swipe = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .runOnJS(true)
    .onEnd((event) => {
      if (event.translationX < -50 || event.velocityX < -600) onShiftWeek(1);
      else if (event.translationX > 50 || event.velocityX > 600) onShiftWeek(-1);
    });
  const slide = (direction > 0 ? SlideInRight : SlideInLeft)
    .springify()
    .damping(PAISA.expand.damping)
    .stiffness(PAISA.expand.stiffness)
    .reduceMotion(ReduceMotion.System);

  const nowTop = (minuteOfDay(now) / 60) * HOUR;

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Day headers and the all-day row; swipe them for another week. */}
      <GestureDetector gesture={swipe}>
        <Animated.View key={weekKey} entering={slide} style={{ paddingRight: 16 }}>
          <View style={{ flexDirection: 'row', paddingLeft: GUTTER }}>
            {days.map((date, i) => (
              <DayHeader
                key={keys[i]}
                date={date}
                selected={keys[i] === selected}
                today={keys[i] === todayKey}
                onPress={() => onSelectDay(keys[i])}
              />
            ))}
          </View>
          {allDayRows > 0 ? (
            <View style={{ flexDirection: 'row', paddingTop: 6, paddingBottom: 8 }}>
              <Text style={{ width: GUTTER, paddingRight: 8, paddingTop: 4, textAlign: 'right', fontSize: 11, color: colors.text3 }}>
                All day
              </Text>
              {week.map((day) => (
                <View key={day.key} style={{ flex: 1, gap: 4, paddingHorizontal: 2 }}>
                  {day.allDay.slice(0, day.allDay.length > ALL_DAY_ROWS + 1 ? ALL_DAY_ROWS : ALL_DAY_ROWS + 1).map((item, i) => (
                    <AllDayChip key={`${item.task.id}-${item.projected}-${i}`} item={item} index={model.colorIndex.get(item.task.list_id) ?? 0} onOpen={model.open} />
                  ))}
                  {day.allDay.length > ALL_DAY_ROWS + 1 ? (
                    <Pressable
                      onPress={() => onSelectDay(day.key)}
                      accessibilityRole="button"
                      accessibilityLabel={`${day.allDay.length - ALL_DAY_ROWS} more on this day`}
                      style={{ height: 24, justifyContent: 'center', paddingHorizontal: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text2 }}>+{day.allDay.length - ALL_DAY_ROWS} more</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>
      <View style={{ height: 1, backgroundColor: colors.separator }} />

      <View style={{ flex: 1 }} onLayout={(e) => setViewport(e.nativeEvent.layout.height)}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingTop: GRID_PAD, paddingBottom: bottom }}>
          <View style={{ height: HOUR * 24 + 8 }}>
            {/* Hour lines across the week. */}
            {Array.from({ length: 24 }, (_, h) => (
              <View
                key={h}
                pointerEvents="none"
                style={{ position: 'absolute', top: h * HOUR - 8, left: 0, right: 16, height: 16, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ width: GUTTER - 8, marginRight: 8, textAlign: 'right', fontSize: 11, color: colors.text3, fontVariant: ['tabular-nums'] }}>
                  {h === 0 ? '' : hourLabel.format(new Date(2000, 0, 1, h))}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: withAlpha(colors.separator, 0.7) }} />
              </View>
            ))}

            {/* One column per day: a divider, a tint on the chosen day, and tap-to-add. */}
            <Animated.View key={weekKey} entering={FadeIn.duration(180)} style={{ position: 'absolute', top: 0, bottom: 0, left: GUTTER, right: 16, flexDirection: 'row' }}>
              {week.map((day, i) => (
                <View key={day.key} style={{ flex: 1 }}>
                  <Pressable
                    disabled={!model.canCreate}
                    onPress={(e) => model.create(Math.min(23, Math.floor(e.nativeEvent.locationY / HOUR)), days[i])}
                    accessibilityLabel={`Add a to-do on ${weekdayLong.format(days[i])}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      right: 0,
                      borderLeftWidth: 1,
                      borderColor: withAlpha(colors.separator, 0.7),
                      backgroundColor: day.key === selected ? withAlpha(colors.accent, 0.05) : 'transparent',
                    }}
                  />
                  {column > 0
                    ? day.placed.map(({ item, block, lane, lanes }, j) => {
                        const top = (minuteOfDay(block.start) / 60) * HOUR + 1;
                        const height = Math.max(24, ((block.end.getTime() - block.start.getTime()) / 3_600_000) * HOUR - 2);
                        const laneWidth = (column - 6) / lanes;
                        return (
                          <RiseIn
                            key={`${item.task.id}-${item.projected}-${j}`}
                            index={j}
                            rise={6}
                            style={{ position: 'absolute', top, height, left: 3 + lane * laneWidth, width: laneWidth - (lanes > 1 ? 2 : 0) }}>
                            <WeekBlock
                              item={item}
                              height={height}
                              index={model.colorIndex.get(item.task.list_id) ?? 0}
                              running={!item.projected && model.runningUid === item.task.uid}
                              onOpen={model.open}
                              onToggle={model.toggle}
                            />
                          </RiseIn>
                        );
                      })
                    : null}
                </View>
              ))}
            </Animated.View>

            {/* The now line: faint across the week, solid through today. */}
            {todayIndex >= 0 && column > 0 ? (
              <View pointerEvents="none" style={{ position: 'absolute', top: nowTop - 10, left: 0, right: 16, height: 20, justifyContent: 'center' }}>
                <View style={{ position: 'absolute', left: GUTTER, right: 0, height: 1, backgroundColor: withAlpha(colors.red, 0.35) }} />
                <View style={{ position: 'absolute', left: GUTTER + todayIndex * column, width: column, height: 2, backgroundColor: colors.red }} />
                <View style={{ position: 'absolute', left: GUTTER + todayIndex * column - 5 }}>
                  <NowDot />
                </View>
                <View style={{ position: 'absolute', left: 0, width: GUTTER - 6, alignItems: 'flex-end' }}>
                  <View style={{ backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                      {formatTime(now).replace(/\s?[AP]M$/i, '')}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

/** A weekday over its date. The chosen day is a filled circle; today is an outlined one. */
function DayHeader({ date, selected, today, onPress }: { date: Date; selected: boolean; today: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.set(selected ? withSpring(1, { damping: 12, stiffness: 320, ...REDUCE }) : withTiming(0, { duration: 140 }));
  }, [selected, on]);
  const fill = useAnimatedStyle(() => ({ opacity: Math.min(1, on.value), transform: [{ scale: 0.6 + 0.4 * on.value }] }));
  const ink = selected ? colors.onAccent : today ? colors.accent : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${weekdayLong.format(date)} ${date.getDate()}${today ? ', today' : ''}`}
      style={{ flex: 1, alignItems: 'center', gap: 4, paddingBottom: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: today ? '700' : '500', letterSpacing: 0.4, color: today ? colors.accent : colors.text2 }}>
        {weekdayShort.format(date).toUpperCase()}
      </Text>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: today && !selected ? 1 : 0,
          borderColor: colors.accent,
        }}>
        <Animated.View style={[{ position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent }, fill]} />
        <Text style={{ fontSize: 18, fontWeight: '600', color: ink, fontVariant: ['tabular-nums'] }}>{date.getDate()}</Text>
      </View>
    </Pressable>
  );
}

function AllDayChip({ item, index, onOpen }: { item: DayItem; index: number; onOpen: (task: DayItem['task']) => void }) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { fill, ink } = item.event ? eventTone(colors, dark, item.event.color) : listTone(colors, dark, index);
  const done = item.task.completed && !item.projected;
  return (
    <Pressable
      onPress={() => onOpen(item.task)}
      accessibilityRole="button"
      accessibilityLabel={`${item.task.title}, all day${done ? ', done' : ''}`}
      style={({ pressed }) => ({
        height: 24,
        borderRadius: 8,
        paddingHorizontal: 8,
        justifyContent: 'center',
        backgroundColor: item.projected ? 'transparent' : fill,
        borderWidth: item.projected ? 1 : 0,
        borderStyle: 'dashed',
        borderColor: fill,
        opacity: pressed ? 0.75 : done ? 0.55 : 1,
      })}>
      <Text
        numberOfLines={1}
        style={{ fontSize: 12, fontWeight: '600', color: item.projected ? colors.text2 : ink, textDecorationLine: done ? 'line-through' : 'none' }}>
        {item.task.title}
      </Text>
    </Pressable>
  );
}

/**
 * A block in a day column. Columns are narrow, so it keeps to a title and the
 * time; long press ticks a to-do off, and a block in focus wears a ring.
 */
function WeekBlock({
  item,
  height,
  index,
  running,
  onOpen,
  onToggle,
}: {
  item: DayItem;
  height: number;
  index: number;
  running: boolean;
  onOpen: (task: DayItem['task']) => void;
  onToggle: (task: DayItem['task']) => void;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { fill, ink } = item.event ? eventTone(colors, dark, item.event.color) : listTone(colors, dark, index);
  const { task, projected, block } = item;
  const done = task.completed && !projected;
  const press = useElasticPress({ maxStretch: 0.02, maxTranslate: 1, pressedScale: 0.97, releaseOnDrag: true });
  const roomy = height >= 44;
  const titleLines = Math.max(1, Math.floor((height - (roomy ? 30 : 6)) / 17));
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
        accessibilityLabel={`${task.title}, ${block ? formatBlock(block) : ''}${item.event ? `, ${item.event.calendarTitle}` : done ? ', done' : ''}${running ? ', in focus' : ''}`}
        accessibilityHint={item.event ? 'Opens in your calendar app' : 'Long press to tick it off'}
        style={{
          flex: 1,
          borderRadius: 12,
          borderCurve: 'continuous',
          overflow: 'hidden',
          paddingHorizontal: 8,
          paddingVertical: roomy ? 6 : 0,
          justifyContent: roomy ? 'flex-start' : 'center',
          backgroundColor: projected ? withAlpha(fill, 0.3) : fill,
          borderWidth: running ? 2 : projected ? 1 : 0,
          borderStyle: projected && !running ? 'dashed' : 'solid',
          borderColor: running ? ink : fill,
          opacity: done ? 0.55 : 1,
        }}>
        <PressGlow press={press} color={withAlpha(ink, dark ? 0.14 : 0.1)} radius={12} size={40} />
        <Text
          numberOfLines={titleLines}
          style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: ink, textDecorationLine: done ? 'line-through' : 'none' }}>
          {task.title}
        </Text>
        {roomy && block ? (
          <Text numberOfLines={1} style={{ fontSize: 11, color: withAlpha(ink, 0.75), marginTop: 2, fontVariant: ['tabular-nums'] }}>
            {formatBlock(block)}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** The selected day's to-dos and events as a list, under the month in the side pane. */
function DayAgenda({ model }: { model: CalendarModel }) {
  const { colors } = useTheme();
  const items = [...model.dayItems].sort((a, b) => {
    if (!a.block || !b.block) return a.block ? 1 : b.block ? -1 : 0;
    return a.block.start.getTime() - b.block.start.getTime();
  });
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, paddingHorizontal: 8 }}>
        {model.selected === model.todayKey ? 'Today' : dayTitle.format(model.selectedDate)}
      </Text>
      {items.length === 0 ? (
        <Text style={{ fontSize: 14, color: colors.text2, paddingHorizontal: 8, lineHeight: 20 }}>
          Nothing planned. Tap an hour in the week to add a to-do there.
        </Text>
      ) : (
        <Animated.View key={model.selected} entering={FadeIn.duration(160)} style={{ gap: 6 }}>
          {items.map((item, i) => (
            <AgendaRow key={`${item.task.id}-${item.projected}-${i}`} item={item} model={model} />
          ))}
        </Animated.View>
      )}
    </View>
  );
}

function AgendaRow({ item, model }: { item: DayItem; model: CalendarModel }) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { fill } = item.event
    ? eventTone(colors, dark, item.event.color)
    : listTone(colors, dark, model.colorIndex.get(item.task.list_id) ?? 0);
  const { task, projected, block } = item;
  const done = task.completed && !projected;
  const when = block ? formatBlock(block) : 'All day';
  const source = item.event ? item.event.calendarTitle : task.list_name;
  return (
    <Pressable
      onPress={() => model.open(task)}
      accessibilityRole="button"
      android_ripple={{ color: withAlpha(colors.text, 0.08) }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 56,
        paddingVertical: 8,
        paddingLeft: 12,
        paddingRight: 16,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: colors.surfaceContainerLow,
        opacity: done ? 0.6 : 1,
      }}>
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: fill }} />
      {item.event ? (
        <MaterialCommunityIcons name="calendar-blank-outline" size={20} color={colors.text2} />
      ) : (
        <View style={{ opacity: projected ? 0.4 : 1 }}>
          <TaskCheckbox
            checked={done}
            onToggle={() => {
              if (!projected) model.toggle(task);
            }}
            label={`${task.completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
          />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '500', color: colors.text, textDecorationLine: done ? 'line-through' : 'none' }}>
          {task.title}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.text2, marginTop: 2 }}>
          {projected ? 'Repeats · ' : ''}
          {when}
          {source ? ` · ${source}` : ''}
        </Text>
      </View>
    </Pressable>
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
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: withAlpha(colors.red, 0.35) }, ring]} />
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red }} />
    </View>
  );
}
