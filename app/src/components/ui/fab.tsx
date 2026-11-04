import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps } from 'react';
import { Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Material 3 floating action button, pinned bottom-right above the tab bar.
 * Cross-platform (vector icon). Android uses Jetpack Compose FAB via fab.android.tsx.
 */
export function Fab({
  onPress,
  icon = 'plus',
  accessibilityLabel,
}: {
  onPress: () => void;
  icon?: IconName;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  // iOS native tabs float over the scene; the bottom safe-area inset includes
  // the tab bar there, so sit above it rather than underneath.
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === 'ios' ? insets.bottom + 16 : 16;

  return (
    <Pressable
      onPress={() => {
        haptics.impact('medium');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 16,
        bottom,
        // 56dp M3 standard FAB size with extra hit area
        width: 56,
        height: 56,
        opacity: pressed ? 0.92 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}>
      <View
        className="h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: colors.primaryContainer,
          borderCurve: 'continuous',
          boxShadow: `0 6px 18px ${colors.accent}55`,
        }}>
        <MaterialCommunityIcons name={icon} size={28} color={colors.onPrimaryContainer} />
      </View>
    </Pressable>
  );
}
