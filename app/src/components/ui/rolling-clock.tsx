import { type StyleProp, type TextStyle, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutDown,
  FadeOutUp,
  LayoutAnimationConfig,
  ReduceMotion,
} from 'react-native-reanimated';

import { EXPRESSIVE } from '@/lib/motion';

/**
 * A clock like "24:59" where each digit rolls on its own when it changes,
 * as in Expressive Clock: a countdown rolls downward, a stopwatch upward.
 * Unchanged digits sit still, so only the seconds move most of the time.
 */
export function RollingClock({
  text,
  countDown,
  style,
}: {
  text: string;
  countDown: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={text} style={{ flexDirection: 'row' }}>
      <LayoutAnimationConfig skipEntering>
        {/* Keyed from the right, so "9:59" → "10:00" keeps the seconds in their slots. */}
        {[...text].map((char, index, all) => (
          <Digit key={all.length - index} char={char} countDown={countDown} style={style} />
        ))}
      </LayoutAnimationConfig>
    </View>
  );
}

function Digit({ char, countDown, style }: { char: string; countDown: boolean; style?: StyleProp<TextStyle> }) {
  const { damping, stiffness } = EXPRESSIVE.digit;
  // Same directions as RollingNumber: counting up rolls one way, down the other.
  const entering = (countDown ? FadeInUp : FadeInDown)
    .springify()
    .damping(damping)
    .stiffness(stiffness)
    .reduceMotion(ReduceMotion.System);
  const exiting = (countDown ? FadeOutDown : FadeOutUp).duration(140).reduceMotion(ReduceMotion.System);
  return (
    <View style={{ overflow: 'hidden' }}>
      <Animated.Text
        key={char}
        entering={/\d/.test(char) ? entering : undefined}
        exiting={/\d/.test(char) ? exiting : undefined}
        style={[{ fontVariant: ['tabular-nums'] }, style]}>
        {char}
      </Animated.Text>
    </View>
  );
}
