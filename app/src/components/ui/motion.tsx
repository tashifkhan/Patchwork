import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ReactNode, useEffect } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { useElasticPress, type ElasticPressOptions, PressGlow } from '@/components/ui/elastic';
import { withAlpha } from '@/lib/theme';
import { PAISA, stagger, SWAP_IN, SWAP_OUT } from '@/lib/motion';

/*
 * Paisa's motion vocabulary for React Native. Each piece mirrors a Compose
 * helper in Paisa's ui/components/Motion.kt and ElasticPress.kt:
 *
 *   riseIn            -> <RiseIn>
 *   elasticCard/Button -> <ElasticPressable variant="card" | "button">
 *   expandArrowRotation -> <TurningChevron>
 *   AnimatedContent   -> <Swap>
 *
 * Springs come from `PAISA` in `@/lib/motion`; everything honours the
 * system's reduce-motion setting.
 */

const REDUCE = { reduceMotion: ReduceMotion.System } as const;

/**
 * Fades its content in while it rises `rise` points and grows from
 * `fromScale`, once, on mount. `index` staggers a column of them.
 */
export function RiseIn({
  children,
  index = 0,
  fromScale = 0.96,
  rise = 12,
  style,
}: {
  children: ReactNode;
  /** Position in a list, for a short stagger (capped). */
  index?: number;
  fromScale?: number;
  rise?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const delay = stagger(index, 30, 210);
  const entering = () => {
    'worklet';
    const spring = { ...PAISA.rise, ...REDUCE };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: rise }, { scale: fromScale }] },
      animations: {
        opacity: withDelay(delay, withSpring(1, spring)),
        transform: [
          { translateY: withDelay(delay, withSpring(0, spring)) },
          { scale: withDelay(delay, withSpring(1, spring)) },
        ],
      },
    };
  };
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

const PRESETS: Record<'card' | 'button' | 'control', ElasticPressOptions> = {
  // Paisa `elasticCard`: a small dip, barely any lean, lets go when the list scrolls.
  card: { maxStretch: 0.012, maxTranslate: 1, pressedScale: 0.98, releaseOnDrag: true },
  // Paisa `elasticButton`: a small round button can move more.
  button: { maxStretch: 0.08, maxTranslate: 2, pressedScale: 0.94, releaseOnDrag: true },
  // The default `elasticPress`, for pills and chips.
  control: { maxStretch: 0.06, maxTranslate: 1.8, pressedScale: 0.95, releaseOnDrag: true },
};

/**
 * A Pressable that gives under the finger: dips, leans toward the touch and
 * springs back with a small overshoot. With `glow`, a soft light follows the
 * finger inside the shape (Paisa's `pressGlow`).
 */
export function ElasticPressable({
  variant = 'card',
  glow,
  radius = 16,
  style,
  containerStyle,
  children,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  /** Layout for the moving wrapper (flex: 1 in a row, alignSelf…). */
  containerStyle?: StyleProp<ViewStyle>;
  variant?: keyof typeof PRESETS;
  /** Glow colour with alpha, e.g. the accent at 20%. */
  glow?: string;
  /** Corner radius, so the glow stays inside. */
  radius?: number;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
}) {
  const press = useElasticPress(PRESETS[variant]);
  const { colors } = useTheme();
  // Paisa's pressGlow is on every elastic control; Android gets it by default.
  const light = glow ?? (Platform.OS === 'android' ? withAlpha(colors.accent, 0.14) : undefined);
  return (
    <Animated.View {...press.handlers} style={[containerStyle, press.style]}>
      <Pressable
        {...props}
        onPressOut={(event) => {
          press.release();
          props.onPressOut?.(event);
        }}
        style={style}>
        {(state) => (
          <>
            {light ? <PressGlow press={press} color={light} radius={radius} /> : null}
            {typeof children === 'function' ? children(state) : children}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** An expand arrow that turns over instead of swapping icons. */
export function TurningChevron({ expanded, color, size = 20 }: { expanded: boolean; color: string; size?: number }) {
  const turn = useSharedValue(expanded ? 180 : 0);
  useEffect(() => {
    turn.set(withSpring(expanded ? 180 : 0, { ...PAISA.arrow, ...REDUCE }));
  }, [expanded, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  return (
    <Animated.View style={style}>
      <MaterialCommunityIcons name="chevron-down" size={size} color={color} />
    </Animated.View>
  );
}

/**
 * Content that swaps in place: the old one fades out fast, the new one
 * fades in (Compose `AnimatedContent` with `fadeIn() togetherWith fadeOut()`).
 * Change `swapKey` to swap.
 */
export function Swap({
  swapKey,
  children,
  style,
}: {
  swapKey: string | number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View key={swapKey} entering={SWAP_IN} exiting={SWAP_OUT} style={style}>
      {children}
    </Animated.View>
  );
}

/** A value that springs to `to` whenever it changes, for heights, widths and progress. */
export function useSpringValue(to: number, preset: keyof typeof PAISA = 'expand') {
  const value = useSharedValue(to);
  useEffect(() => {
    value.set(withSpring(to, { ...PAISA[preset], ...REDUCE }));
  }, [preset, to, value]);
  return value;
}

/** Presets for `ElasticView` from `@/components/ui/elastic`, matching `ElasticPressable` variants. */
export const ELASTIC_CARD = PRESETS.card;
export const ELASTIC_BUTTON = PRESETS.button;
export const ELASTIC_CONTROL = PRESETS.control;
export { ElasticView } from '@/components/ui/elastic';
/**
 * For list rows: Paisa's card dip on Android; nothing on iOS, where list rows
 * use the system highlight (Things, Settings).
 */
export const ELASTIC_ROW: ElasticPressOptions =
  Platform.OS === 'android' ? PRESETS.card : { maxStretch: 0, maxTranslate: 0, pressedScale: 1, releaseOnDrag: true };
