import { FloatingActionButton, Host, Icon } from '@expo/ui/jetpack-compose';
import { type ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, View as RNView } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { useTabBarFabOffset } from '@/lib/tab-bar';
import { View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Material Symbols vector drawables Compose can render inside the FAB slot. */
const SYMBOLS: Partial<Record<string, ReturnType<typeof require>>> = {
  plus: require('../../../assets/symbols/add.xml'),
  check: require('../../../assets/symbols/check.xml'),
};

/** M3 standard FAB: 56dp container, 16dp margins. */
const FAB_SIZE = 56;

/**
 * Material 3 FAB backed by Jetpack Compose `FloatingActionButton`.
 *
 * Compose owns the container shape, tonal elevation, and the bounded ripple —
 * the things the previous hand-rolled `Pressable` could only approximate. The
 * icon comes from an XML vector drawable because Compose slots cannot host RN
 * vector-icon glyphs; any icon without a bundled symbol falls back to the RN
 * implementation below so call sites never break.
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
  const bottom = useTabBarFabOffset();
  const symbol = SYMBOLS[icon];

  function handlePress() {
    haptics.impact('medium');
    onPress();
  }

  if (!symbol) return <FallbackFab onPress={handlePress} icon={icon} label={accessibilityLabel} bottom={bottom} />;

  return (
    <RNView
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        position: 'absolute',
        right: 16,
        bottom,
        width: FAB_SIZE,
        height: FAB_SIZE,
      }}>
      <Host style={{ width: FAB_SIZE, height: FAB_SIZE }}>
        <FloatingActionButton onClick={handlePress} containerColor={colors.primaryContainer}>
          <FloatingActionButton.Icon>
            <Icon source={symbol} tint={colors.onPrimaryContainer} size={24} />
          </FloatingActionButton.Icon>
        </FloatingActionButton>
      </Host>
    </RNView>
  );
}

/** RN fallback for icons with no bundled Material Symbol. */
function FallbackFab({
  onPress,
  icon,
  label,
  bottom,
}: {
  onPress: () => void;
  icon: IconName;
  label?: string;
  bottom: number;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.onPrimaryContainer + '33', borderless: false, radius: 28 }}
      hitSlop={4}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 16,
        bottom,
        width: FAB_SIZE,
        height: FAB_SIZE,
        opacity: pressed ? 0.92 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
        elevation: 6,
      })}>
      <View
        className="h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: colors.primaryContainer, borderCurve: 'continuous' }}>
        <MaterialCommunityIcons name={icon} size={28} color={colors.onPrimaryContainer} />
      </View>
    </Pressable>
  );
}
