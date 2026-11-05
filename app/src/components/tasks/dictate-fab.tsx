import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton } from '@/components/ui/glass-button';
import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { useTabBarFabOffset } from '@/lib/tab-bar';

/** Main FAB is 56dp; the small one sits 16dp above it, centred on the same axis. */
const MAIN_FAB = 56;
const SIZE = 48;

/**
 * Material 3 small FAB stacked above the New to-do button. It opens voice
 * dictation, so speaking a to-do is one tap from the list.
 */
export function DictateFab({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const androidBottom = useTabBarFabOffset();
  const fabBottom = Platform.OS === 'ios' ? insets.bottom + 16 : androidBottom;

  if (Platform.OS === 'ios') {
    return (
      <GlassIconButton
        sf="mic.fill"
        icon="microphone"
        label="Dictate a to-do"
        symbolColor={colors.accent}
        size={SIZE}
        onPress={onPress}
        style={{ position: 'absolute', right: 16 + (MAIN_FAB - SIZE) / 2, bottom: fabBottom + MAIN_FAB + 14 }}
      />
    );
  }

  return (
    <Pressable
      onPress={() => {
        haptics.impact('light');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Dictate a to-do"
      android_ripple={{ color: colors.separator }}
      hitSlop={4}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 16 + (MAIN_FAB - SIZE) / 2,
        bottom: fabBottom + MAIN_FAB + 16,
        width: SIZE,
        height: SIZE,
        borderRadius: pressed ? 18 : 14,
        borderCurve: 'continuous',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg3,
        elevation: 3,
        boxShadow: Platform.OS === 'ios' ? '0 2px 6px rgba(0,0,0,0.18)' : undefined,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}>
      <MaterialCommunityIcons name="microphone" size={24} color={colors.accent} />
    </Pressable>
  );
}
