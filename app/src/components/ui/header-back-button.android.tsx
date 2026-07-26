import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View, type ColorValue } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';

/** M3 standard icon-button container (40dp). */
const SIZE = 40;
/** Material arrow size inside the circle. */
const ICON = 22;

/**
 * Circular Android header back button — used as `headerLeft` on every stack
 * screen that can go back. Replaces the bare toolbar navigation icon with a
 * Material 3–style outlined circle. Uses neutral on-surface colors only —
 * never the accent tint — so it reads as chrome, not a primary action.
 */
export function headerBackButtonLeft({
  canGoBack,
}: {
  canGoBack?: boolean;
  tintColor?: ColorValue;
  label?: string;
  href?: string;
  backgroundColor?: ColorValue;
}): ReactNode {
  const router = useRouter();
  const { colors } = useTheme();

  if (!canGoBack) return null;

  // M3 onSurface / outline — ignore headerTintColor (accent) on purpose.
  const iconColor = colors.text;
  const ringColor = colors.separator;

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        if (router.canGoBack()) router.back();
      }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={4}
      android_ripple={{ color: colors.separator, borderless: true, radius: SIZE / 2 + 4 }}
      style={{
        width: SIZE,
        height: SIZE,
        // Gap between the circular back control and the header title.
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          borderWidth: 1.5,
          borderColor: ringColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <MaterialCommunityIcons name="arrow-left" size={ICON} color={iconColor} />
      </View>
    </Pressable>
  );
}
