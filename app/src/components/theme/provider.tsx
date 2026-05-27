import { useMemo, type ReactNode } from 'react';

import { appleColors } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settings-store';

import { ThemeShell, useEffectiveScheme } from './shell';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useEffectiveScheme();
  const accent = useSettingsStore((s) => s.accentColor);
  const colors = useMemo(() => appleColors(scheme, accent), [scheme, accent]);

  return (
    <ThemeShell colors={colors} scheme={scheme} dynamic={false}>
      {children}
    </ThemeShell>
  );
}
