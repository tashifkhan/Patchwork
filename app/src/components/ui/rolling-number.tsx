import { useState } from 'react';
import { type StyleProp, type TextStyle, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutDown,
  FadeOutUp,
  LayoutAnimationConfig,
} from 'react-native-reanimated';

import { EXPRESSIVE } from '@/lib/motion';

/**
 * A number that rolls to its new value like a counter wheel: up for more,
 * down for less. It appears in place the first time.
 */
export function RollingNumber({ value, style }: { value: number; style?: StyleProp<TextStyle> }) {
  // Which way the last change went. Tracked in state so it's settled during render.
  const [shown, setShown] = useState(value);
  const [up, setUp] = useState(true);
  if (shown !== value) {
    setUp(value > shown);
    setShown(value);
  }
  const { damping, stiffness } = EXPRESSIVE.digit;
  const entering = (up ? FadeInDown : FadeInUp).springify().damping(damping).stiffness(stiffness);
  const exiting = (up ? FadeOutUp : FadeOutDown).duration(120);

  return (
    <View style={{ overflow: 'hidden' }}>
      <LayoutAnimationConfig skipEntering>
        <Animated.Text
          key={value}
          entering={entering}
          exiting={exiting}
          style={[{ fontVariant: ['tabular-nums'] }, style]}>
          {value}
        </Animated.Text>
      </LayoutAnimationConfig>
    </View>
  );
}
