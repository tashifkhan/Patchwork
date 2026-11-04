import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { SPRING } from '@/lib/motion';

/**
 * The "done" half of `ProgressStatus`: a bold accent check that springs in
 * where the progress indicator was, with a slight overshoot.
 */
export function ProgressCheck({ size }: { size: number }) {
  const { colors } = useTheme();
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.set(withTiming(1, { duration: 120 }));
    scale.set(withDelay(40, withSpring(1, { ...SPRING.spatial, damping: 14 })));
  }, [opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}>
      <MaterialCommunityIcons name="check-bold" size={size * 0.78} color={colors.accent} />
    </Animated.View>
  );
}
