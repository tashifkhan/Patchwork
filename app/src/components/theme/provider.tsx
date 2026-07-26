import { useMemo, type ReactNode } from 'react';

import { appleColors, highContrastColors, pureBlackColors } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settings-store';

import { ThemeShell, useEffectiveScheme } from './shell';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useEffectiveScheme();
  const accent = useSettingsStore((s) => s.accentColor);
  const colorPalette = useSettingsStore((s) => s.colorPalette);
  const pureBlack = useSettingsStore((s) => s.pureBlack);
  const highContrast = useSettingsStore((s) => s.highContrast);

  const colors = useMemo(() => {
    let base = appleColors(scheme, accent, colorPalette);
    if (scheme === 'dark' && pureBlack) base = pureBlackColors(base);
    if (highContrast) base = highContrastColors(base, scheme);
    return base;
  }, [scheme, accent, colorPalette, pureBlack, highContrast]);

  return (
    <ThemeShell colors={colors} scheme={scheme} dynamic={false}>
      {children}
    </ThemeShell>
  );
}
