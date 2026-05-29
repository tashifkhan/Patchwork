import type { ReactNode } from 'react';
import { View } from 'react-native';

// Web fallback. Native platforms resolve to sheet-surface.ios.tsx /
// sheet-surface.android.tsx via Metro's platform extension lookup.
export function SheetSurface({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1 }}>{children}</View>;
}
