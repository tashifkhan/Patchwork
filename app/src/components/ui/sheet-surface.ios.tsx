import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme/context';
import { Text } from '@/tw';

import type { SheetSurfaceProps } from './sheet-surface';

/**
 * iOS sheet surface. The host `Stack.Screen` sets
 * `contentStyle.backgroundColor` to `transparent`; the system form-sheet glass
 * follows the OS appearance, which looks wrong when the app theme is overriding
 * the system (e.g. system dark, app light). We render our own liquid-glass
 * backdrop and pin `colorScheme` to the active app theme so the material
 * matches the rest of the UI.
 */
export function SheetSurface({ children, title, subtitle, bottomInset }: SheetSurfaceProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const padBottom = bottomInset ?? Math.max(insets.bottom, 12);

  const body = (
    <>
      {title ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
          <Text className="text-sf-text text-xl font-bold">{title}</Text>
          {subtitle ? <Text className="text-sf-text-2 mt-1 text-sm">{subtitle}</Text> : null}
        </View>
      ) : null}
      <View style={{ flex: 1, paddingBottom: padBottom }}>{children}</View>
    </>
  );

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme={scheme} style={{ flex: 1 }}>
        {body}
      </GlassView>
    );
  }
  return <View style={{ flex: 1, backgroundColor: colors.bg2 }}>{body}</View>;
}
