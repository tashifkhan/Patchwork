import { StyleSheet, type StyleProp, type TextStyle, View } from 'react-native';
import Animated, {
  Easing,
  LayoutAnimationConfig,
  ReduceMotion,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/*
 * Expressive Clock's ticker readout (TimersScreen.kt, TickerCell), MIT:
 * each digit rolls on its own when it changes.
 *
 * - Countdown: the new digit drops in from above on a spring with a detent
 *   overshoot (stiffness 380, damping ratio 0.68); the old one slides out
 *   downward over 180ms and fades in 70ms.
 * - Counting up: digits roll upward on a critically damped spring (420, 1.0).
 * - Stagger: 38ms per position, starting from the digit that changes most
 *   often, so a minute rollover ripples across the readout.
 *
 * The in-flight blur can't be done on RN text; a quick fade and a slight
 * vertical stretch stand in for it.
 */

const STAGGER_MS = 38;
const REDUCE = ReduceMotion.System;

function damping(ratio: number, stiffness: number) {
  return 2 * ratio * Math.sqrt(stiffness);
}

export function RollingClock({
  text,
  countDown,
  style,
}: {
  text: string;
  countDown: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 17;
  const cell = Math.round(fontSize * 1.18);
  const chars = [...text];
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={text} style={{ flexDirection: 'row' }}>
      <LayoutAnimationConfig skipEntering>
        {/* Keyed from the right, so "9:59" → "10:00" keeps the seconds in their slots. */}
        {chars.map((char, index) => {
          const fromRight = chars.length - 1 - index;
          // Countdown ripples leftward from the seconds; counting up, rightward.
          const order = countDown ? fromRight : index;
          return (
            <Digit
              key={fromRight}
              char={char}
              countDown={countDown}
              delay={order * STAGGER_MS}
              cell={cell}
              style={style}
            />
          );
        })}
      </LayoutAnimationConfig>
    </View>
  );
}

function Digit({
  char,
  countDown,
  delay,
  cell,
  style,
}: {
  char: string;
  countDown: boolean;
  delay: number;
  cell: number;
  style?: StyleProp<TextStyle>;
}) {
  const isDigit = /\d/.test(char);
  // Countdown: in from above (-1), out downward. Up: in from below, out upward.
  const dir = countDown ? -1 : 1;
  const spring = countDown
    ? { stiffness: 380, damping: damping(0.68, 380), mass: 1, reduceMotion: REDUCE }
    : { stiffness: 420, damping: damping(1, 420), mass: 1, reduceMotion: REDUCE };

  const entering = () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: dir * cell }, { scaleY: 1.12 }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: 90, reduceMotion: REDUCE })),
        transform: [
          { translateY: withDelay(delay, withSpring(0, spring)) },
          { scaleY: withDelay(delay, withSpring(1, spring)) },
        ],
      },
    };
  };
  const exiting = () => {
    'worklet';
    const duration = countDown ? 180 : 160;
    return {
      initialValues: { opacity: 1, transform: [{ translateY: 0 }, { scaleY: 1 }] },
      animations: {
        opacity: withDelay(delay, withTiming(0, { duration: 70, reduceMotion: REDUCE })),
        transform: [
          {
            translateY: withDelay(
              delay,
              withTiming(-dir * cell, { duration, easing: Easing.bezier(0.4, 0, 0.2, 1), reduceMotion: REDUCE })
            ),
          },
          { scaleY: withDelay(delay, withTiming(1.12, { duration, reduceMotion: REDUCE })) },
        ],
      },
    };
  };

  return (
    <View style={{ overflow: 'hidden', height: cell, justifyContent: 'center' }}>
      <Animated.Text
        key={char}
        entering={isDigit ? entering : undefined}
        exiting={isDigit ? exiting : undefined}
        style={[{ fontVariant: ['tabular-nums'], includeFontPadding: false, textAlignVertical: 'center' }, style]}>
        {char}
      </Animated.Text>
    </View>
  );
}
