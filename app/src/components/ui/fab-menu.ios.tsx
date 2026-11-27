import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { useLiquidGlass } from '@/components/ui/glass-surface';
import { MenuView } from '@/components/ui/menu';
import { haptics } from '@/lib/haptics';
import { useTabBarFabOffset } from '@/lib/tab-bar';

import type { FabMenuItem } from './fab-menu';

export type { FabMenuItem } from './fab-menu';

/**
 * iOS: the round accent button opens the system menu, the way Calendar's and
 * Notes' plus buttons do. Material's pill stack would look foreign here.
 */
export function FabMenu({
  items,
  accessibilityLabel = 'Create',
  bottom: bottomOverride,
}: {
  items: FabMenuItem[];
  accessibilityLabel?: string;
  bottom?: number;
}) {
  const { colors, scheme } = useTheme();
  const glass = useLiquidGlass();
  const tabBarBottom = useTabBarFabOffset();
  const bottom = bottomOverride ?? tabBarBottom;
  const circle = { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' } as const;
  const plus = <SymbolView name="plus" size={24} weight="semibold" tintColor="#FFFFFF" />;

  return (
    <View style={{ position: 'absolute', right: 16, bottom }}>
      <MenuView
        shouldOpenOnLongPress={false}
        onOpenMenu={() => haptics.impact('medium')}
        // UIKit puts the first action nearest the button. Reversed, the last
        // item sits next to the button, as on Android.
        actions={[...items].reverse().map((item) => ({ id: item.key, title: item.label, image: item.sf }))}
        onPressAction={({ nativeEvent }) => items.find((item) => item.key === nativeEvent.event)?.onPress()}>
        <View accessible accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
          {glass ? (
            <GlassView isInteractive glassEffectStyle="regular" tintColor={colors.accent} colorScheme={scheme} style={circle}>
              {plus}
            </GlassView>
          ) : (
            <View style={[circle, { backgroundColor: colors.accent, boxShadow: `0 6px 16px ${colors.accent}66` }]}>{plus}</View>
          )}
        </View>
      </MenuView>
    </View>
  );
}
