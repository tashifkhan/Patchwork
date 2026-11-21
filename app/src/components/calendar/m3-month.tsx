import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';
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

import { useTheme } from '@/components/theme/context';
import { useElasticPress, PressGlow } from '@/components/ui/elastic';
import { TurningChevron, useSpringValue } from '@/components/ui/motion';
import { haptics } from '@/lib/haptics';
import { expandLayout, PAISA } from '@/lib/motion';
import { withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

/*
 * A Material 3 docked date picker, used as the month view
 * (m3.material.io/components/date-pickers): a surfaceContainerHigh card with
 * extra-large (28dp) corners; a header with the month and a dropdown arrow
 * that opens a month/year grid, plus previous/next icon buttons; weekday
 * labels; and 40dp full-round date containers in 48dp rows. Today is a 1dp
 * primary outline, the selected date is filled primary, pressing shows a
 * state layer. Dots under the number mark what's due.
 */

const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' });
const narrowDay = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

const DATE = 40;
const ROW = 48;

export interface DayMark {
  /** Open, done, or a future repeat. */
  kind: 'open' | 'done' | 'projected';
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}
export function keyOf(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function M3MonthCard({
  month,
  direction,
  mondayFirst,
  selected,
  todayKey,
  marks,
  onSelect,
  onShift,
  onJump,
}: {
  month: Date;
  direction: 1 | -1;
  mondayFirst: boolean;
  selected: string;
  todayKey: string;
  marks: Map<string, DayMark[]>;
  onSelect: (key: string) => void;
  onShift: (months: number) => void;
  /** Jump to a month (from the month/year grid or Today). */
  onJump: (month: Date, selectKey?: string) => void;
}) {
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? width / 7 : 0;
  const isCurrentMonth = keyOf(month).slice(0, 7) === todayKey.slice(0, 7);

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
    const base = new Date(2024, 0, mondayFirst ? 1 : 7);
    return Array.from({ length: 7 }, (_, i) => narrowDay.format(new Date(2024, 0, base.getDate() + i)));
  }, [mondayFirst]);

  const swipe = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .runOnJS(true)
    .onEnd((event) => {
      if (event.translationX < -50 || event.velocityX < -600) onShift(1);
      else if (event.translationX > 50 || event.velocityX > 600) onShift(-1);
    });

  return (
    // Grows and shrinks on Paisa's expand spring when switching days ↔ months.
    <Animated.View
      layout={expandLayout()}
      style={{
        backgroundColor: colors.bg3,
        borderRadius: 28,
        borderCurve: 'continuous',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 12,
      }}>
      {/* Header: month + dropdown on the left, Today and arrows on the right. */}
      <View className="flex-row items-center" style={{ height: 56, paddingLeft: 4 }}>
        <Pressable
          onPress={() => {
            haptics.tap();
            setPicking((value) => !value);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: picking }}
          accessibilityLabel={`${monthTitle.format(month)}, choose month and year`}
          android_ripple={{ color: withAlpha(colors.text, 0.1), borderless: false }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: 8, borderRadius: 20, overflow: 'hidden' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text2, letterSpacing: 0.1 }}>
            {monthTitle.format(month)}
          </Text>
          <TurningChevron expanded={picking} color={colors.text2} size={18} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {!isCurrentMonth && !picking ? (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
            <Pressable
              onPress={() => {
                haptics.tap();
                const now = new Date();
                onJump(new Date(now.getFullYear(), now.getMonth(), 1), todayKey);
              }}
              accessibilityRole="button"
              android_ripple={{ color: withAlpha(colors.accent, 0.12) }}
              style={{ height: 40, paddingHorizontal: 12, borderRadius: 20, justifyContent: 'center', overflow: 'hidden' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>Today</Text>
            </Pressable>
          </Animated.View>
        ) : null}
        {!picking ? (
          <>
            <StandardIcon icon="chevron-left" label="Previous month" onPress={() => onShift(-1)} />
            <StandardIcon icon="chevron-right" label="Next month" onPress={() => onShift(1)} />
          </>
        ) : null}
      </View>

      {picking ? (
        <Animated.View key="picker" entering={FadeIn.duration(180)} exiting={FadeOut.duration(100)}>
          <MonthYearGrid
            month={month}
            onPick={(next) => {
              haptics.selection();
              setPicking(false);
              onJump(next);
            }}
          />
        </Animated.View>
      ) : (
        <Animated.View key="days" entering={FadeIn.duration(180)} exiting={FadeOut.duration(100)}>
          <View className="flex-row" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
            {weekdays.map((name, i) => (
              <View key={i} style={{ flex: 1, height: ROW - 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.text }}>{name}</Text>
              </View>
            ))}
          </View>
          <GestureDetector gesture={swipe}>
            <Animated.View
              key={keyOf(month)}
              entering={(direction > 0 ? SlideInRight : SlideInLeft)
                .springify()
                .damping(PAISA.expand.damping)
                .stiffness(PAISA.expand.stiffness)
                .reduceMotion(ReduceMotion.System)}
              exiting={FadeOut.duration(90)}
              style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cell > 0
                ? cells.map((date, i) =>
                    date ? (
                      <DateCell
                        key={keyOf(date)}
                        width={cell}
                        day={date.getDate()}
                        label={date.toDateString()}
                        selected={keyOf(date) === selected}
                        today={keyOf(date) === todayKey}
                        marks={marks.get(keyOf(date)) ?? []}
                        onPress={() => {
                          haptics.selection();
                          onSelect(keyOf(date));
                        }}
                      />
                    ) : (
                      <View key={`e${i}`} style={{ width: cell, height: ROW }} />
                    )
                  )
                : null}
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** M3 standard icon button: 40dp, state layer on press, shape morph to 12dp. */
function StandardIcon({
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
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: withAlpha(colors.text, 0.12), borderless: true, radius: 20 }}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: pressed ? 12 : 24,
      })}>
      <MaterialCommunityIcons name={icon} size={24} color={colors.text2} />
    </Pressable>
  );
}

/**
 * One date: a 40dp container in a 48dp row. Selected fills with primary on
 * Paisa's expand spring (a little dip as it lands); today is a 1dp primary
 * ring; pressing shows the 10% state layer and the light under the finger.
 */
function DateCell({
  width,
  day,
  label,
  selected,
  today,
  marks,
  onPress,
}: {
  width: number;
  day: number;
  label: string;
  selected: boolean;
  today: boolean;
  marks: DayMark[];
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const on = useSpringValue(selected ? 1 : 0, 'expand');
  const press = useElasticPress({ maxStretch: 0.05, maxTranslate: 1, pressedScale: 0.92, releaseOnDrag: true });
  const [pressed, setPressed] = useState(false);
  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.get(), [0, 1], ['transparent', colors.accent]),
    transform: [{ scale: interpolate(on.get(), [0, 0.5, 1], [1, 0.88, 1]) }],
  }));
  const open = marks.filter((m) => m.kind === 'open').length;
  return (
    <Animated.View {...press.handlers} style={[{ width, height: ROW, alignItems: 'center', justifyContent: 'center' }, press.style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => {
          setPressed(false);
          press.release();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${label}${today ? ', today' : ''}${open ? `, ${open} due` : ''}`}>
        <Animated.View
          style={[
            {
              width: DATE,
              height: DATE,
              borderRadius: DATE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              borderWidth: today && !selected ? 1 : 0,
              borderColor: colors.accent,
            },
            fill,
          ]}>
          {pressed && !selected ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withAlpha(colors.text, 0.1) }} />
          ) : null}
          <PressGlow press={press} color={withAlpha(colors.accent, 0.18)} radius={DATE / 2} size={18} />
          <Text
            style={{
              fontSize: 14,
              fontWeight: selected || today ? '600' : '400',
              color: selected ? colors.onAccent : today ? colors.accent : colors.text,
              fontVariant: ['tabular-nums'],
              marginTop: marks.length ? -4 : 0,
            }}>
            {day}
          </Text>
          {marks.length ? (
            <View className="flex-row" style={{ position: 'absolute', bottom: 6, gap: 2 }}>
              {marks.slice(0, 3).map((mark, i) => (
                <View
                  key={i}
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: selected
                      ? colors.onAccent
                      : mark.kind === 'open'
                        ? colors.accent
                        : mark.kind === 'done'
                          ? colors.gray2
                          : 'transparent',
                    borderWidth: mark.kind === 'projected' && !selected ? 1 : 0,
                    borderColor: colors.accent,
                  }}
                />
              ))}
            </View>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** M3 year/month selection: a year header with arrows over a 3×4 grid of month pills. */
function MonthYearGrid({ month, onPick }: { month: Date; onPick: (month: Date) => void }) {
  const { colors } = useTheme();
  // Mounted fresh each time the grid opens, so it starts on the shown month's year.
  const [year, setYear] = useState(month.getFullYear());
  const now = new Date();
  return (
    <View style={{ paddingTop: 4, paddingBottom: 8 }}>
      <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 4, height: 48 }}>
        <StandardIcon icon="chevron-left" label="Previous year" onPress={() => setYear((y) => y - 1)} />
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{year}</Text>
        <StandardIcon icon="chevron-right" label="Next year" onPress={() => setYear((y) => y + 1)} />
      </View>
      <View className="flex-row flex-wrap" style={{ rowGap: 8 }}>
        {Array.from({ length: 12 }, (_, i) => {
          const active = year === month.getFullYear() && i === month.getMonth();
          const current = year === now.getFullYear() && i === now.getMonth();
          return (
            <View key={i} style={{ width: '33.33%', alignItems: 'center' }}>
              <Pressable
                onPress={() => onPick(new Date(year, i, 1))}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                android_ripple={{ color: withAlpha(colors.text, 0.1) }}
                style={{
                  width: 88,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  backgroundColor: active ? colors.accent : 'transparent',
                  borderWidth: current && !active ? 1 : 0,
                  borderColor: colors.accent,
                }}>
                <Text style={{ fontSize: 14, fontWeight: active ? '600' : '400', color: active ? colors.onAccent : current ? colors.accent : colors.text }}>
                  {monthShort.format(new Date(year, i, 1))}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
