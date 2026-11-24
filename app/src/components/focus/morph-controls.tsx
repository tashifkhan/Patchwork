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
import { CLOCK_FONT } from '@/components/focus/clock-style';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
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
          <Pill key={action.label} action={action} fill compact grow />
        ))}
      </Animated.View>
    </View>
  );
}

/** M3 button roles: filled (primary), tonal (secondary container), outlined. */
function useTone(tone: PillAction['tone']) {
  const { colors } = useTheme();
  switch (tone) {
    case 'primary':
      return { bg: colors.accent, ink: colors.onAccent, border: undefined, glow: 'rgba(255,255,255,0.22)' };
    case 'tertiary':
      return { bg: colors.accent, ink: colors.onAccent, border: undefined, glow: 'rgba(255,255,255,0.22)' };
    case 'tonal':
      return { bg: colors.selectionBg, ink: colors.onSelectionBg, border: undefined, glow: withAlpha(colors.accent, 0.16) };
    case 'outlined':
      return { bg: 'transparent', ink: colors.accent, border: colors.gray2, glow: withAlpha(colors.accent, 0.14) };
  }
}

function PillBody({
  action,
  labelStyle,
  compact = false,
}: {
  action: PillAction;
  labelStyle?: ReturnType<typeof useAnimatedStyle>;
  /** Three abreast: tighter padding. */
  compact?: boolean;
}) {
  const tone = useTone(action.tone);
  return (
    <Animated.View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: compact ? 10 : 28, height: ROW_HEIGHT },
        labelStyle,
      ]}>
      {action.icon ? <MaterialCommunityIcons name={action.icon} size={24} color={tone.ink} /> : null}
      <Text
        numberOfLines={1}
        style={{ fontSize: 16, fontFamily: CLOCK_FONT.title, fontWeight: CLOCK_FONT.title ? undefined : '600', color: tone.ink }}>
        {action.label}
      </Text>
    </Animated.View>
  );
}

/** M3 Expressive spatial spring (fast): shape and width changes under the finger. */
const SHAPE_SPRING = { damping: 2 * 0.6 * Math.sqrt(800), stiffness: 800, mass: 1, reduceMotion: ReduceMotion.System };

/**
 * An M3 Expressive button: fully round at rest, squaring off to 16dp while
 * held (the shape morph), and, inside a button group, widening while held so
 * its neighbours give way. Keeps the elastic lean and the light under the finger.
 */
function Pill({
  action,
  fill,
  labelStyle,
  compact,
  grow = false,
}: {
  action: PillAction;
  fill?: boolean;
  labelStyle?: ReturnType<typeof useAnimatedStyle>;
  compact?: boolean;
  /** In a group: widen while pressed. */
  grow?: boolean;
}) {
  const tone = useTone(action.tone);
  const press = useElasticPress({ maxStretch: 0.06, maxTranslate: 1.6, pressedScale: 0.97, releaseOnDrag: true });
  const held = useSharedValue(0);
  const shape = useAnimatedStyle(() => ({
    borderRadius: ROW_HEIGHT / 2 - (ROW_HEIGHT / 2 - 16) * held.get(),
  }));
  const width = useAnimatedStyle(() => (fill ? { flexGrow: 1 + (grow ? 0.22 : 0) * held.get() } : {}));
  return (
    <Animated.View {...press.handlers} style={[{ flexBasis: 0 }, fill ? { flexGrow: 1 } : null, width, press.style]}>
      <Pressable
        onPress={() => {
          haptics.tap();
          action.onPress();
        }}
        onPressIn={() => held.set(withSpring(1, SHAPE_SPRING))}
        onPressOut={() => {
          held.set(withSpring(0, SHAPE_SPRING));
          press.release();
        }}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        style={{ flex: 1, height: ROW_HEIGHT }}>
        <Animated.View
          style={[
            {
              flex: 1,
              justifyContent: 'center',
              overflow: 'hidden',
              backgroundColor: tone.bg,
              borderWidth: tone.border ? 1 : 0,
              borderColor: tone.border,
            },
            shape,
          ]}>
          <PressGlow press={press} color={tone.glow} radius={16} size={34} />
          <PillBody action={action} labelStyle={labelStyle} compact={compact} />
        </Animated.View>
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
    <View style={{ gap: 5 }}>
      <Text
        style={{ fontSize: 14, fontFamily: CLOCK_FONT.label, fontWeight: CLOCK_FONT.label ? undefined : '500', color: colors.text2, paddingHorizontal: 4 }}>
        Presets
      </Text>
      <View className="flex-row" style={{ gap: 6 }}>
        {values.map((value) => (
          <PresetButton
            key={value}
            label={format(value)}
            active={value === selected}
            onPress={() => {
              haptics.selection();
              onSelect(value);
            }}
          />
        ))}
      </View>
    </View>
  );
}

/** PresetButton: 54dp, 27dp corners, primaryContainer at 92% with a primary hairline. */
function PresetButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const press = useElasticPress({ maxStretch: 0.06, maxTranslate: 1.8, pressedScale: 0.95, releaseOnDrag: true });
  return (
    <Animated.View {...press.handlers} style={[{ flex: 1 }, press.style]}>
      <Pressable
        onPress={onPress}
        onPressOut={press.release}
        accessibilityRole="radio"
        accessibilityState={{ checked: active }}
        accessibilityLabel={label}
        style={{
          height: 54,
          borderRadius: 27,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: withAlpha(colors.primaryContainer, 0.92),
          // The chosen length gets a full-strength edge; the rest keep the 28% hairline.
          borderWidth: active ? 2 : 1.25,
          borderColor: withAlpha(colors.accent, active ? 1 : 0.28),
        }}>
        <PressGlow press={press} color={withAlpha(colors.accent, 0.18)} radius={27} size={30} />
        <Text
          style={{ fontSize: 14, fontFamily: CLOCK_FONT.title, fontWeight: CLOCK_FONT.title ? undefined : '700', color: colors.onPrimaryContainer }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
