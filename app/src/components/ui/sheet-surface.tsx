import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Text } from '@/tw';

export interface SheetSurfaceProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  bottomInset?: number;
  /** Android only — false rests the sheet at the ~50% detent (ignored on iOS/web). */
  skipPartiallyExpanded?: boolean;
}

// Web fallback. Native platforms resolve to sheet-surface.ios.tsx /
// sheet-surface.android.tsx via Metro's platform extension lookup.
export function SheetSurface({ children, title, subtitle }: SheetSurfaceProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg2 }}>
      {title ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
          <Text className="text-sf-text text-xl font-bold">{title}</Text>
          {subtitle ? <Text className="text-sf-text-2 mt-1 text-sm">{subtitle}</Text> : null}
        </View>
      ) : null}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
