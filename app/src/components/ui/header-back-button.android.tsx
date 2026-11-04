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
 * Android header back button: an M3 *filled tonal* icon button (40dp,
 * `surfaceContainerHigh` fill, no outline ring) used as `headerLeft` on every
 * stack screen that can go back. Corners tighten while pressed, the M3
 * Expressive shape-morph cue. Neutral on-surface ink, never the accent, so it
 * reads as chrome rather than a primary action.
 */
export function HeaderBackButtonLeft({
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

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        if (router.canGoBack()) router.back();
      }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={6}
      android_ripple={{ color: colors.separator, borderless: false }}
      style={({ pressed }) => ({
        width: SIZE,
        height: SIZE,
        marginRight: 12,
        borderRadius: pressed ? 12 : SIZE / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg3,
      })}>
      <View pointerEvents="none">
        <MaterialCommunityIcons name="arrow-left" size={ICON} color={colors.text} />
      </View>
    </Pressable>
  );
}
