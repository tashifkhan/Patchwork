import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/components/theme/context';

/**
 * Android sheet surface — Material 3 modal bottom sheet aesthetic.
 *
 * react-native-screens' formSheet already animates and clips a sheet from
 * the bottom; we paint the visible surface (surfaceContainerHigh) and place a
 * grabber bar at the top edge so the M3 chrome reads correctly even when the
 * native grabber is suppressed (the `sheetGrabberVisible` prop is iOS-only).
 */
export function SheetSurface({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg3,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
      }}>
      <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
        <View
          style={{
            width: 32,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.gray2,
            opacity: 0.6,
          }}
        />
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
