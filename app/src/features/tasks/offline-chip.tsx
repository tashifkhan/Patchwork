import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { withAlpha } from '@/lib/theme';
import { Text } from '@/tw';

const IOS = Platform.OS === 'ios';

/**
 * A quiet "Offline" marker for next to the task count, so closing the
 * offline banner doesn't hide the fact. Tapping it brings the banner back.
 */
export function OfflineChip({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const color = colors.orange;
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
      <Pressable
        onPress={() => {
          haptics.selection();
          onPress();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Offline. Showing your last sync. Show details"
        android_ripple={{ color: withAlpha(color, 0.25), borderless: false }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          height: 22,
          paddingHorizontal: 8,
          borderRadius: 11,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: withAlpha(color, IOS ? 0.14 : 0.18),
          opacity: IOS && pressed ? 0.6 : 1,
        })}>
        {IOS ? (
          <SymbolView
            name="icloud.slash"
            size={12}
            weight="semibold"
            tintColor={color}
            fallback={<MaterialCommunityIcons name="cloud-off-outline" size={13} color={color} />}
          />
        ) : (
          <MaterialCommunityIcons name="cloud-off-outline" size={14} color={color} />
        )}
        <Text style={{ fontSize: 12, fontWeight: '600', color }}>Offline</Text>
      </Pressable>
    </Animated.View>
  );
}
