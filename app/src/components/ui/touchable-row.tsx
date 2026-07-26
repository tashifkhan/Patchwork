import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { PRESS_SCALE, spring } from '@/lib/motion';

/** Shared 48dp minimum height for list rows and tappable surfaces (M3 / a11y). */
export const MIN_TOUCH_TARGET = 48;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Haptic weight to fire on press. `false` disables feedback for this row. */
export type PressFeedback = 'tap' | 'selection' | 'none';

interface TouchableRowProps {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'checkbox' | 'radio';
  accessibilityState?: { checked?: boolean; selected?: boolean; disabled?: boolean };
  hitSlop?: number;
  /** Flex layout for the pressable (default column stretch). */
  flex?: number | boolean;
  /** Haptic fired on press. Defaults to a light tap. */
  feedback?: PressFeedback;
  /**
   * Spring-scale the row while held. Off by default because full-bleed list
   * rows should not shrink — enable for cards, chips, and standalone buttons.
   */
  scaleOnPress?: boolean;
}

/**
 * Pressable wrapper enforcing a 48dp minimum touch target, Android ripple,
 * haptic feedback, and (optionally) an M3 spatial press-scale.
 *
 * Android gets a ripple and no opacity dip — the ripple *is* the affordance
 * there, and dimming on top of it reads as a double response. iOS keeps the
 * opacity dip since it has no ripple.
 */
export function TouchableRow({
  onPress,
  onLongPress,
  disabled,
  children,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  hitSlop = 4,
  flex,
  feedback = 'tap',
  scaleOnPress = false,
}: TouchableRowProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const [pressed, setPressed] = useState(false);
  const interactive = Boolean(onPress || onLongPress) && !disabled;
  const android = Platform.OS === 'android';

  // Shared values are driven from an effect rather than the press handlers:
  // the React Compiler treats them as immutable inside event callbacks.
  useEffect(() => {
    const held = pressed && interactive;
    if (scaleOnPress) scale.value = spring(held ? PRESS_SCALE : 1);
    // Android shows a ripple, so no opacity dip there.
    if (!android) opacity.value = spring(held ? 0.72 : 1, 'effect');
  }, [pressed, interactive, scaleOnPress, android, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  function fireFeedback() {
    if (feedback === 'tap') haptics.tap();
    else if (feedback === 'selection') haptics.selection();
  }

  return (
    <AnimatedPressable
      onPress={
        onPress
          ? () => {
              fireFeedback();
              onPress();
            }
          : undefined
      }
      onLongPress={
        onLongPress
          ? () => {
              haptics.impact('medium');
              onLongPress();
            }
          : undefined
      }
      disabled={!interactive}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      hitSlop={hitSlop}
      android_ripple={interactive ? { color: colors.separator } : undefined}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        {
          minHeight: MIN_TOUCH_TARGET,
          flex: flex === true ? 1 : flex || undefined,
        },
        animatedStyle,
        // After animatedStyle so the dim wins over the resting opacity of 1.
        disabled ? { opacity: 0.4 } : null,
        style,
      ]}>
      {children}
    </AnimatedPressable>
  );
}
