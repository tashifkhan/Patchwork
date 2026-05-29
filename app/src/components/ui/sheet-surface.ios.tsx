import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/components/theme/context';

/**
 * iOS sheet surface. The host `Stack.Screen` sets
 * `contentStyle.backgroundColor` to `transparent`; the system form-sheet glass
 * follows the OS appearance, which looks wrong when the app theme is overriding
 * the system (e.g. system dark, app light). We render our own liquid-glass
 * backdrop and pin `colorScheme` to the active app theme so the material
 * matches the rest of the UI.
 */
export function SheetSurface({ children }: { children: ReactNode }) {
  const { colors, scheme } = useTheme();
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={scheme}
        style={{ flex: 1 }}>
        {children}
      </GlassView>
    );
  }
  return <View style={{ flex: 1, backgroundColor: colors.bg2 }}>{children}</View>;
}
