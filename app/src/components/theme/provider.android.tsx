import { useMaterialColors } from '@expo/ui/jetpack-compose';
import { useMemo, type ReactNode } from 'react';

import { materialColors, pureBlackColors, type MaterialPalette } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settings-store';

import { ThemeShell, useEffectiveScheme } from './shell';

/** Fallback seed used when the user opts out of wallpaper colors and has no custom accent. */
const DEFAULT_SEED = '#0A84FF';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useEffectiveScheme();
  const dynamicColor = useSettingsStore((s) => s.dynamicColor);
  const accent = useSettingsStore((s) => s.accentColor);
  const pureBlack = useSettingsStore((s) => s.pureBlack);

  // When dynamic color is on, omit the seed so the palette is derived from the
  // device wallpaper (Material You). Otherwise generate a palette from the
  // chosen accent (or the brand seed) so it works on every Android version.
  const seedColor = dynamicColor ? undefined : (accent ?? DEFAULT_SEED);

  const palette = useMaterialColors({ colorScheme: scheme, seedColor });
  const colors = useMemo(() => {
    const base = materialColors(palette as unknown as MaterialPalette, scheme);
    return scheme === 'dark' && pureBlack ? pureBlackColors(base) : base;
  }, [palette, scheme, pureBlack]);

  return (
    <ThemeShell colors={colors} scheme={scheme} dynamic={dynamicColor}>
      {children}
    </ThemeShell>
  );
}
