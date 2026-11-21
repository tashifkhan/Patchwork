import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { type LayoutChangeEvent, Pressable } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { withAlpha } from '@/lib/theme';
import { useElasticPress } from '@/components/ui/elastic';
import { haptics } from '@/lib/haptics';
import { Text, View } from '@/tw';

/*
 * Expressive Clock's control row (StopwatchControls / TimerControls): idle,
 * one Start pill sized to its label; on start, the pill grows to the full
 * row, and only once it has arrived does it split into three. Same height
 * in both states, so nothing below the face ever moves.
 */

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface PillAction {
  label: string;
  icon?: IconName;
  onPress: () => void;
  tone: 'primary' | 'tertiary' | 'tonal' | 'outlined';
}

const ROW_HEIGHT = 56;
const GAP = 6;
/** How long the pill has to finish growing before the row divides. */
const EXPAND_LEAD_MS = 95;
const SPLIT_MS = 150;
const LABEL_FADE_MS = 70;
const REDUCE = { reduceMotion: ReduceMotion.System } as const;

export function MorphControls({
  expanded,
  start,
  actions,
}: {
  expanded: boolean;
  /** The lone idle pill. */
  start: PillAction;
  /** The three pills it splits into. */
  actions: [PillAction, PillAction, PillAction];
}) {
  const [width, setWidth] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const expand = useSharedValue(expanded ? 1 : 0);
  const split = useSharedValue(expanded ? 1 : 0);
  const label = useSharedValue(expanded ? 0 : 1);

  useEffect(() => {
    // Critically damped, so the pill arrives instead of ringing around full width.
    expand.set(withSpring(expanded ? 1 : 0, { damping: 40, stiffness: 800, ...REDUCE }));
    label.set(withTiming(expanded ? 0 : 1, { duration: LABEL_FADE_MS, ...REDUCE }));
    split.set(
      withDelay(
        expanded ? EXPAND_LEAD_MS : 0,
        withTiming(expanded ? 1 : 0, { duration: SPLIT_MS, easing: Easing.out(Easing.quad), ...REDUCE })
      )
    );
  }, [expand, expanded, label, split]);

  const single = useAnimatedStyle(() => {
    const e = Math.min(1, Math.max(0, expand.get()));
    const w = startWidth ? interpolate(e, [0, 1], [startWidth, width]) : undefined;
    return {
      width: w,
      left: w != null ? (width - w) / 2 : undefined,
      opacity: 1 - split.get(),
    };
  });
  const singleLabel = useAnimatedStyle(() => ({ opacity: label.get() }));
  const trio = useAnimatedStyle(() => ({ opacity: split.get(), gap: GAP * split.get() }));

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: ROW_HEIGHT, alignSelf: 'stretch' }}>
      {/* Measures the idle pill at its natural width. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', opacity: 0, flexDirection: 'row' }}
        onLayout={(event) => setStartWidth(event.nativeEvent.layout.width)}>
        <PillBody action={start} />
      </View>
      <Animated.View
        pointerEvents={expanded ? 'none' : 'auto'}
        style={[{ position: 'absolute', top: 0, height: ROW_HEIGHT }, single]}>
        <Pill action={start} fill labelStyle={singleLabel} />
      </Animated.View>
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: ROW_HEIGHT, flexDirection: 'row' }, trio]}>
        {actions.map((action) => (
          <View key={action.label} style={{ flex: 1 }}>
            <Pill action={action} fill />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

function useTone(tone: PillAction['tone']) {
  const { colors } = useTheme();
  switch (tone) {
    case 'primary':
      return { bg: colors.primaryContainer, ink: colors.onPrimaryContainer, border: undefined };
    case 'tertiary':
      return { bg: colors.selectionBg, ink: colors.onSelectionBg, border: undefined };
    case 'tonal':
      return { bg: colors.gray3, ink: colors.text, border: undefined };
    case 'outlined':
      return { bg: 'transparent', ink: colors.text, border: colors.gray2 };
  }
}

function PillBody({ action, labelStyle }: { action: PillAction; labelStyle?: ReturnType<typeof useAnimatedStyle> }) {
  const tone = useTone(action.tone);
  return (
    <Animated.View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 28, height: ROW_HEIGHT },
        labelStyle,
      ]}>
      {action.icon ? <MaterialCommunityIcons name={action.icon} size={22} color={tone.ink} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: tone.ink }}>
        {action.label}
      </Text>
    </Animated.View>
  );
}

function Pill({
  action,
  fill,
  labelStyle,
}: {
  action: PillAction;
  fill?: boolean;
  labelStyle?: ReturnType<typeof useAnimatedStyle>;
}) {
  const tone = useTone(action.tone);
  const press = useElasticPress({ maxStretch: 0.06, maxTranslate: 1.8, pressedScale: 0.95, releaseOnDrag: true });
  return (
    <Animated.View {...press.handlers} style={[{ flex: fill ? 1 : undefined }, press.style]}>
      <Pressable
        onPress={() => {
          haptics.tap();
          action.onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        style={({ pressed }) => ({
          flex: 1,
          height: ROW_HEIGHT,
          // Fully round, squaring off a little while held.
          borderRadius: pressed ? 18 : ROW_HEIGHT / 2,
          backgroundColor: tone.bg,
          borderWidth: tone.border ? 1 : 0,
          borderColor: tone.border,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        })}>
        <PillBody action={action} labelStyle={labelStyle} />
      </Pressable>
    </Animated.View>
  );
}

/** Expressive Clock's preset pills: outlined in the accent, the chosen one filled. */
export function PresetPills({
  values,
  selected,
  format,
  onSelect,
}: {
  values: number[];
  selected: number;
  format: (value: number) => string;
  onSelect: (value: number) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-2">
      <Text style={{ fontSize: 13, color: colors.text2 }}>Presets</Text>
      <View className="flex-row" style={{ gap: 6 }}>
        {values.map((value) => {
          const active = value === selected;
          return (
            <Pressable
              key={value}
              onPress={() => {
                haptics.selection();
                onSelect(value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              style={({ pressed }) => ({
                flex: 1,
                height: 44,
                borderRadius: pressed ? 14 : 27,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? colors.primaryContainer : withAlpha(colors.accent, 0.08),
                borderWidth: 1.25,
                borderColor: active ? colors.primaryContainer : withAlpha(colors.accent, 0.28),
              })}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: active ? colors.onPrimaryContainer : colors.accent }}>
                {format(value)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
