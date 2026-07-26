import { useMaterialColors } from '@expo/ui/jetpack-compose';
import { useMemo, type ReactNode } from 'react';

import { paletteById } from '@/lib/palettes';
import {
  colorsFromPalette,
  highContrastColors,
  materialColors,
  pureBlackColors,
  type MaterialPalette,
} from '@/lib/theme';
import { useSettingsStore } from '@/stores/settings-store';

import { ThemeShell, useEffectiveScheme } from './shell';

/** Fallback seed used when the user opts out of wallpaper colors and has no custom accent. */
const DEFAULT_SEED = '#0A84FF';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useEffectiveScheme();
  const dynamicColor = useSettingsStore((s) => s.dynamicColor);
  const accent = useSettingsStore((s) => s.accentColor);
  const colorPalette = useSettingsStore((s) => s.colorPalette);
  const pureBlack = useSettingsStore((s) => s.pureBlack);
  const highContrast = useSettingsStore((s) => s.highContrast);

  const palette = paletteById(colorPalette);

  // When dynamic color is on, omit the seed so the palette is derived from the
  // device wallpaper (Material You). Otherwise generate a palette from the
  // chosen accent / curated palette seed so it works on every Android version.
  const seedColor = dynamicColor
    ? undefined
    : (palette?.seed ?? accent ?? DEFAULT_SEED);

  const material = useMaterialColors({ colorScheme: scheme, seedColor });
  const colors = useMemo(() => {
    // Curated palettes take over surface colors entirely (Paisa-style fixed themes).
    // Dynamic wallpaper or free accent still use Material You tonal mapping.
    let base =
      !dynamicColor && palette
        ? colorsFromPalette(palette, scheme)
        : materialColors(material as unknown as MaterialPalette, scheme);
    if (scheme === 'dark' && pureBlack) base = pureBlackColors(base);
    if (highContrast) base = highContrastColors(base, scheme);
    return base;
  }, [material, scheme, pureBlack, highContrast, dynamicColor, palette]);

  return (
    <ThemeShell colors={colors} scheme={scheme} dynamic={dynamicColor}>
      {children}
    </ThemeShell>
  );
}
