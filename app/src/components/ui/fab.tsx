import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Material 3 floating action button, pinned bottom-right above the tab bar.
 * Cross-platform (vector icon), so it stays visible on Android where SF Symbols
 * do not render.
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

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 16,
        // The tab screen's content area already ends above the native tab bar,
        // so a standard 16dp margin sits the FAB just above it.
        bottom: 16,
        opacity: pressed ? 0.92 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}>
      <View
        className="h-16 w-16 items-center justify-center rounded-3xl"
        style={{
          backgroundColor: colors.accent,
          borderCurve: 'continuous',
          boxShadow: `0 6px 18px ${colors.accent}66`,
        }}>
        <MaterialCommunityIcons name={icon} size={30} color={colors.onAccent} />
      </View>
    </Pressable>
  );
}
