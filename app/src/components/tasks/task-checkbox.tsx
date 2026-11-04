import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
} from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { MIN_TOUCH_TARGET } from '@/components/ui/touchable-row';
import { haptics } from '@/lib/haptics';
import { DURATION, spring, timing } from '@/lib/motion';

/**
 * Things-style square checkbox with an M3 Expressive twist: checking it springs
 * the corners from a soft square toward a circle, fills it with the accent, and
 * gives the box a short squash. Unchecking runs the same motion in reverse.
 *
 * `variant="circle"` is the subtask/checklist style (Things uses circles there).
 */
export function TaskCheckbox({
  checked,
  onToggle,
  label,
  size = 22,
  variant = 'square',
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  size?: number;
  variant?: 'square' | 'circle';
}) {
  const { colors } = useTheme();
  const progress = useSharedValue(checked ? 1 : 0);
  const squash = useSharedValue(1);

  useEffect(() => {
    progress.value = spring(checked ? 1 : 0, 'spatial');
  }, [checked, progress]);

  const boxStyle = useAnimatedStyle(() => {
    const restRadius = variant === 'circle' ? size / 2 : size * 0.27;
    return {
      borderRadius: interpolate(progress.value, [0, 1], [restRadius, size / 2]),
      backgroundColor: interpolateColor(progress.value, [0, 1], ['transparent', colors.accent]),
      borderColor: interpolateColor(progress.value, [0, 1], [colors.gray2, colors.accent]),
      transform: [{ scale: squash.value }],
    };
  });

  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.4, 1]) }],
  }));

  return (
    <Pressable
      onPress={() => {
        haptics.toggle(!checked);
        squash.set(withSequence(timing(0.82, DURATION.short2), spring(1, 'spatial')));
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      hitSlop={10}
      style={{
        width: MIN_TOUCH_TARGET,
        height: MIN_TOUCH_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderWidth: 1.75,
            alignItems: 'center',
            justifyContent: 'center',
            borderCurve: 'continuous',
          },
          boxStyle,
        ]}>
        <Animated.View style={checkStyle}>
          <MaterialCommunityIcons name="check-bold" size={size * 0.62} color={colors.onAccent} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}
