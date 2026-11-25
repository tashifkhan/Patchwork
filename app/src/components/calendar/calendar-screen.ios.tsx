import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
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
import { useHeaderHeight } from 'expo-router/react-navigation';

import { useTheme } from '@/components/theme/context';
import { GlassIconButton, GlassPillButton } from '@/components/ui/glass-button';
import { haptics } from '@/lib/haptics';
import { PAISA } from '@/lib/motion';
import { mixHex, withAlpha } from '@/lib/theme';
import { formatBlock, formatTime, minuteOfDay, placeBlocks } from '@/lib/time-block';
import { dayKey } from '@/stores/pomodoro-store';
import { Text, View } from '@/tw';

import { type DayItem, keyToDate, useCalendarModel, weekOf } from './use-calendar-model';

const HOUR = 52;
const LABEL_WIDTH = 50;
const REDUCE = { reduceMotion: ReduceMotion.System } as const;
/** Apple Calendar's palette, handed to lists in order. */
const CALENDAR_COLORS = ['#FF3B30', '#FF9500', '#34C759', '#007AFF', '#AF52DE', '#FFCC00', '#A2845E', '#FF2D55'];

const monthName = new Intl.DateTimeFormat(undefined, { month: 'long' });
const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const fullDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const narrowDay = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
const hourLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });

function calendarColor(index: number) {
  return CALENDAR_COLORS[index % CALENDAR_COLORS.length];
}

/** A to-do's list colour, or a phone event's own calendar colour. */
function itemColor(item: DayItem, colorIndex: Map<string, number>) {
  return item.event?.color ?? calendarColor(colorIndex.get(item.task.list_id) ?? 0);
}

/**
 * iOS calendar, in the shape of Apple Calendar's day view: the month as the
 * bar title, a week strip pinned under the bar, an all-day row, then the hour
 * grid with each to-do's block tinted in its list colour with a solid edge,
 * and the red now line. Reminders-style circles tick to-dos off. The bar's
 * buttons and the floating Today pill are Liquid Glass.
 */
export function CalendarScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const model = useCalendarModel();
  const { now, todayKey, selected, setSelected, selectedDate, mondayFirst, byDay, dayItems } = model;
  const scrollRef = useRef<ScrollView>(null);
  const headerHeight = useHeaderHeight();
  const [showMonth, setShowMonth] = useState(false);
  const [timelineY, setTimelineY] = useState<number | null>(null);
  const timed = dayItems.filter((it) => it.block);
  const allDay = dayItems.filter((it) => !it.block);

  useEffect(() => {
    if (timelineY == null) return;
    const firstHour = timed.length ? Math.min(...timed.map((it) => it.block!.start.getHours())) : 8;
    const hour = selected === todayKey ? Math.max(0, now.getHours() - 1) : Math.max(0, firstHour - 1);
    // A day with only all-day items stays at the top, so the all-day row is in view.
    const y = selected !== todayKey && !timed.length && allDay.length ? 0 : timelineY + hour * HOUR - 8;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: true }));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, timelineY]);

  const select = (key: string) => {
    haptics.selection();
    setSelected(key);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: monthName.format(selectedDate),
          headerLargeTitle: false,
          headerShadowVisible: false,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <HeaderSymbol
                sf={showMonth ? 'calendar.circle.fill' : 'calendar'}
                label={showMonth ? 'Hide month' : 'Show month'}
                onPress={() => setShowMonth((v) => !v)}
              />
              {model.canCreate ? <HeaderSymbol sf="plus" label="New to-do" onPress={() => model.create()} /> : null}
            </View>
          ),
        }}
      />
      {/* Pinned under the bar, like Calendar's week row. */}
      <View style={{ marginTop: headerHeight, backgroundColor: colors.bg, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: colors.separator }}>
          {showMonth ? (
            <MonthGrid
              selected={selected}
              todayKey={todayKey}
              mondayFirst={mondayFirst}
              busy={(key) => (byDay.get(key)?.length ?? 0) > 0}
              onSelect={(key) => {
                select(key);
                setShowMonth(false);
              }}
            />
          ) : (
            <WeekStrip
              selected={selected}
              todayKey={todayKey}
              mondayFirst={mondayFirst}
              busy={(key) => (byDay.get(key)?.length ?? 0) > 0}
              onSelect={select}
            />
          )}
      </View>
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>

        {allDay.length ? (
          <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.separator }}>
            <Text style={{ width: LABEL_WIDTH, textAlign: 'right', fontSize: 11, color: colors.text3, paddingTop: 6 }}>all-day</Text>
            <View style={{ flex: 1, gap: 3, paddingLeft: 8, paddingRight: 12 }}>
              {allDay.map((item, i) => (
                <Animated.View key={`${item.task.id}-${item.projected}`} entering={FadeIn.delay(i * 30).duration(200)}>
                  <AllDayCapsule item={item} color={itemColor(item, model.colorIndex)} onOpen={model.open} onToggle={model.toggle} />
                </Animated.View>
              ))}
            </View>
          </View>
        ) : null}

        <View onLayout={(e) => setTimelineY(e.nativeEvent.layout.y)} style={{ paddingTop: 10 }}>
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
      </ScrollView>

      {/* Calendar's bottom-left Today button, as floating Liquid Glass. */}
      <View style={{ position: 'absolute', left: 16, bottom: insets.bottom + 8 }}>
        <GlassPillButton label="Today" height={44} onPress={() => select(todayKey)} disabled={selected === todayKey} />
      </View>
    </View>
  );
}

/** A bar button: iOS 26 draws the glass around it. */
function HeaderSymbol({ sf, label, onPress }: { sf: React.ComponentProps<typeof SymbolView>['name']; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
      <SymbolView name={sf} size={20} weight="medium" tintColor={colors.text} />
    </Pressable>
  );
}

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
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .runOnJS(true)
    .onEnd((event) => {
      if (event.translationX < -40 || event.velocityX < -500) shift(1);
      else if (event.translationX > 40 || event.velocityX > 500) shift(-1);
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
        style={{ flexDirection: 'row', paddingHorizontal: 8 }}>
        {days.map((date) => {
          const key = dayKey(date);
          return <DayCell key={key} date={date} selected={key === selected} today={key === todayKey} busy={busy(key)} onPress={() => onSelect(key)} />;
        })}
      </Animated.View>
    </GestureDetector>
  );
}

/** Calendar's day cell: red for today, a filled circle for the chosen day (red when it's today). */
function DayCell({
  date,
  selected,
  today,
  busy,
  onPress,
  showWeekday = true,
}: {
  date: Date;
  selected: boolean;
  today: boolean;
  busy: boolean;
  onPress: () => void;
  showWeekday?: boolean;
}) {
  const { colors } = useTheme();
  const red = colors.red;
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.set(selected ? withSpring(1, { damping: 13, stiffness: 340, ...REDUCE }) : withTiming(0, { duration: 120 }));
  }, [selected, on]);
  const circle = useAnimatedStyle(() => ({ opacity: Math.min(1, on.value), transform: [{ scale: 0.6 + 0.4 * on.value }] }));
  const fill = today ? red : colors.text;
  const ink = selected ? colors.bg : today ? red : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${fullDate.format(date)}${today ? ', today' : ''}`}
      style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 }}>
      {showWeekday ? (
        <Text style={{ fontSize: 11, fontWeight: '600', color: today ? red : colors.text3 }}>{narrowDay.format(date)}</Text>
      ) : null}
      <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: fill }, circle]} />
        <Text style={{ fontSize: 19, fontWeight: selected || today ? '600' : '400', color: ink, fontVariant: ['tabular-nums'] }}>
          {date.getDate()}
        </Text>
      </View>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: busy ? colors.text3 : 'transparent' }} />
    </Pressable>
  );
}

/** The month as Calendar draws it, opened from the bar's calendar button. */
function MonthGrid({
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
  const { colors } = useTheme();
  const [month, setMonth] = useState(() => {
    const d = keyToDate(selected);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const cells = useMemo(() => {
    const offset = (month.getDay() - (mondayFirst ? 1 : 0) + 7) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= days; d += 1) out.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (out.length % 7) out.push(null);
    return out;
  }, [month, mondayFirst]);
  const weekdays = weekOf(new Date(2024, 0, 10), mondayFirst);
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={{ paddingHorizontal: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: colors.text }}>{monthYear.format(month)}</Text>
        <GlassIconButton sf="chevron.left" label="Previous month" size={36} onPress={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} />
        <View style={{ width: 8 }} />
        <GlassIconButton sf="chevron.right" label="Next month" size={36} onPress={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {weekdays.map((d, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: colors.text3 }}>
            {narrowDay.format(d)}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((date, i) => (
          <View key={date ? dayKey(date) : `e${i}`} style={{ width: `${100 / 7}%` }}>
            {date ? (
              <DayCell
                date={date}
                showWeekday={false}
                selected={dayKey(date) === selected}
                today={dayKey(date) === todayKey}
                busy={busy(dayKey(date))}
                onPress={() => onSelect(dayKey(date))}
              />
            ) : null}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

/** Reminders-style circle that fills with a check. */
function CheckCircle({ done, color, onPress, label }: { done: boolean; color: string; onPress: () => void; label: string }) {
  const pop = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Pressable
      onPress={() => {
        pop.set(withSequence(withTiming(1.3, { duration: 90, ...REDUCE }), withSpring(1, { damping: 9, stiffness: 300, ...REDUCE })));
        onPress();
      }}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={label}>
      <Animated.View style={style}>
        <SymbolView name={done ? 'checkmark.circle.fill' : 'circle'} size={16} weight="medium" tintColor={color} />
      </Animated.View>
    </Pressable>
  );
}

function AllDayCapsule({
  item,
  color,
  onOpen,
  onToggle,
}: {
  item: DayItem;
  color: string;
  onOpen: (task: DayItem['task']) => void;
  onToggle: (task: DayItem['task']) => void;
}) {
  const { colors, scheme } = useTheme();
  const { task, projected } = item;
  const done = task.completed && !projected;
  const ink = scheme === 'dark' ? mixHex(color, '#FFFFFF', 0.35) : mixHex(color, '#000000', 0.35);
  return (
    <Pressable
      onPress={() => onOpen(task)}
      accessibilityRole="button"
      accessibilityLabel={item.event ? `${task.title}, ${item.event.calendarTitle}, all day` : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 26,
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: withAlpha(color, pressed ? 0.32 : scheme === 'dark' ? 0.28 : 0.18),
        opacity: done || projected ? 0.55 : 1,
      })}>
      {item.event ? (
        <View style={{ width: 3, alignSelf: 'stretch', marginVertical: 5, borderRadius: 2, backgroundColor: color }} />
      ) : !projected ? (
        <CheckCircle done={done} color={ink} onPress={() => onToggle(task)} label={`${done ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`} />
      ) : (
        <SymbolView name="repeat" size={12} tintColor={ink} />
      )}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: done ? colors.text3 : ink, textDecorationLine: done ? 'line-through' : 'none' }}>
        {task.title}
      </Text>
    </Pressable>
  );
}

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
  const placed = useMemo(() => placeBlocks(items.map((item) => ({ item, block: item.block! }))), [items]);
  const lane = width - LABEL_WIDTH - 14;
  const nowTop = (minuteOfDay(now) / 60) * HOUR;
  const nowHour = now.getHours();
  const nearHour = isToday && (now.getMinutes() < 12 || now.getMinutes() > 48);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HOUR * 24 + 8 }}>
      <Pressable
        disabled={!onCreateAt}
        onPress={(e) => onCreateAt?.(Math.min(23, Math.floor(e.nativeEvent.locationY / HOUR)))}
        accessibilityLabel="Add a to-do at this hour"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {Array.from({ length: 25 }, (_, h) => {
          // The now label replaces the hour it would crowd, as in Calendar.
          const hidden = nearHour && (h === nowHour || h === nowHour + 1) && Math.abs(h * 60 - minuteOfDay(now)) < 14;
          return (
            <View key={h} style={{ position: 'absolute', top: h * HOUR - 7, left: 0, right: 0, height: 14, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ width: LABEL_WIDTH, textAlign: 'right', fontSize: 11, color: colors.text3, opacity: hidden ? 0 : 1, fontVariant: ['tabular-nums'] }}>
                {hourLabel.format(new Date(2000, 0, 1, h % 24))}
              </Text>
              <View style={{ flex: 1, height: 0.5, marginLeft: 8, backgroundColor: colors.separator }} />
            </View>
          );
        })}
      </Pressable>

      {width > 0
        ? placed.map(({ item, block, lane: col, lanes }, i) => {
            const top = (minuteOfDay(block.start) / 60) * HOUR + 1;
            const height = Math.max(22, ((block.end.getTime() - block.start.getTime()) / 3_600_000) * HOUR - 2);
            const colWidth = lane / lanes;
            return (
              <Animated.View
                key={`${item.task.id}-${item.projected}-${i}`}
                entering={FadeIn.delay(Math.min(i * 30, 240)).duration(220)}
                style={{ position: 'absolute', top, left: LABEL_WIDTH + 8 + col * colWidth, width: colWidth - 2, height }}>
                <EventBlock
                  item={item}
                  height={height}
                  color={itemColor(item, colorIndex)}
                  running={!item.projected && runningUid === item.task.uid}
                  onOpen={onOpen}
                  onToggle={onToggle}
                  onFocus={onFocus}
                />
              </Animated.View>
            );
          })
        : null}

      {isToday ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: nowTop - 7, left: 0, right: 0, height: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ width: LABEL_WIDTH, textAlign: 'right', fontSize: 11, fontWeight: '700', color: colors.red, fontVariant: ['tabular-nums'] }}>
            {formatTime(now).replace(/\s?[AP]M$/i, '')}
          </Text>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.red, marginLeft: 5 }} />
          <View style={{ flex: 1, height: 1.5, backgroundColor: colors.red }} />
        </View>
      ) : null}
    </View>
  );
}

/** Calendar's event: a tinted block with a solid leading edge in the list colour. */
function EventBlock({
  item,
  height,
  color,
  running,
  onOpen,
  onToggle,
  onFocus,
}: {
  item: DayItem;
  height: number;
  color: string;
  running: boolean;
  onOpen: (task: DayItem['task']) => void;
  onToggle: (task: DayItem['task']) => void;
  onFocus: (task: DayItem['task']) => void;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { task, projected, block } = item;
  const done = task.completed && !projected;
  const ink = dark ? mixHex(color, '#FFFFFF', 0.4) : mixHex(color, '#000000', 0.4);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.set(running ? withRepeat(withSequence(withTiming(1, { duration: 1000 }), withTiming(0.3, { duration: 1000 })), -1, false) : withTiming(0, { duration: 200 }));
  }, [running, glow]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], borderWidth: 1.5 * glow.value }));
  const compact = height < 40;

  return (
    <Pressable
      onPress={() => onOpen(task)}
      onPressIn={() => scale.set(withTiming(0.97, { duration: 90 }))}
      onPressOut={() => scale.set(withSpring(1, { damping: 14, stiffness: 380, ...REDUCE }))}
      accessibilityRole="button"
      accessibilityLabel={
        item.event
          ? `${task.title}, ${block ? formatBlock(block) : ''}, ${item.event.calendarTitle}`
          : `${task.title}, ${block ? formatBlock(block) : ''}${done ? ', done' : ''}${running ? ', in focus' : ''}`
      }
      accessibilityHint={item.event ? 'Opens in Calendar' : undefined}
      style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            flex: 1,
            flexDirection: 'row',
            borderRadius: 6,
            borderCurve: 'continuous',
            overflow: 'hidden',
            borderColor: color,
            backgroundColor: withAlpha(color, projected ? 0.1 : dark ? 0.3 : 0.18),
            opacity: done ? 0.55 : 1,
          },
          style,
        ]}>
        <View style={{ width: 4, backgroundColor: color, opacity: projected ? 0.5 : 1 }} />
        <View style={{ flex: 1, paddingHorizontal: 6, paddingVertical: compact ? 0 : 4, justifyContent: compact ? 'center' : 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: compact ? 'center' : 'flex-start', gap: 5 }}>
            {!projected && !item.event ? (
              <View style={{ paddingTop: compact ? 0 : 1 }}>
                <CheckCircle done={done} color={ink} onPress={() => onToggle(task)} label={`${done ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`} />
              </View>
            ) : null}
            <Text
              numberOfLines={compact ? 1 : Math.max(1, Math.floor((height - 22) / 17))}
              style={{ flex: 1, fontSize: 13, fontWeight: '600', color: done ? colors.text3 : ink, textDecorationLine: done ? 'line-through' : 'none' }}>
              {task.title}
              {compact && block ? <Text style={{ fontWeight: '400' }}>{`  ${formatTime(block.start)}`}</Text> : null}
            </Text>
            {!projected && !done && !item.event ? (
              <Pressable
                onPress={() => onFocus(task)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={running ? 'Open the focus timer' : 'Start the focus timer for this block'}>
                <SymbolView name={running ? 'timer' : 'play.circle.fill'} size={compact ? 15 : 18} tintColor={ink} />
              </Pressable>
            ) : null}
          </View>
          {!compact && block ? (
            <Text numberOfLines={1} style={{ fontSize: 12, color: withAlpha(ink, 0.8), marginTop: 1, marginLeft: item.event ? 0 : 21 }}>
              {running ? 'In focus · ' : ''}
              {formatBlock(block)}
              {item.event?.location ? ` · ${item.event.location}` : ''}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}
