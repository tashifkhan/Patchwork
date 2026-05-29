import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * iOS sheet surface. The host `Stack.Screen` sets
 * `contentStyle.backgroundColor` to `transparent`, which on iOS 26+ makes the
 * system paint the form sheet with the liquid-glass material automatically.
 * No backdrop view is needed here — adding one over `absoluteFill` covered
 * the children. On older iOS releases the sheet's built-in chrome shows
 * through normally.
 */
export function SheetSurface({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: 'transparent' }}>{children}</View>;
}
