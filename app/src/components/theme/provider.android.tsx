import { useMaterialColors } from '@expo/ui/jetpack-compose';
import { useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { PAPER_PALETTE, paletteById } from '@/lib/palettes';
import { highContrastColors, materialColors, type MaterialPalette } from '@/lib/theme';
import { tonalColorsFromPalette, tonalPureBlack } from '@/lib/tonal-surfaces';
import { useSettingsStore } from '@/stores/settings-store';

import { ThemeShell, useEffectiveScheme } from './shell';

/** Material You wallpaper colors arrived in Android 12 (API 31). */
const SUPPORTS_WALLPAPER_COLOR = typeof Platform.Version === 'number' && Platform.Version >= 31;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useEffectiveScheme();
  const dynamicColor = useSettingsStore((s) => s.dynamicColor);
  const accent = useSettingsStore((s) => s.accentColor);
  const colorPalette = useSettingsStore((s) => s.colorPalette);
  const pureBlack = useSettingsStore((s) => s.pureBlack);
  const highContrast = useSettingsStore((s) => s.highContrast);

  // Wallpaper colors are the default where the device has them. Without them
  // (Android 11 and older), or with them off and nothing picked, the app's
  // default look is Paper rather than a stock seed.
  const wallpaper = dynamicColor && SUPPORTS_WALLPAPER_COLOR;
  const palette = paletteById(colorPalette) ?? (!wallpaper && !accent ? PAPER_PALETTE : undefined);

  // With wallpaper color, omit the seed so the palette comes from the device
  // wallpaper (Material You). Otherwise seed from the curated palette or accent.
  const seedColor = wallpaper ? undefined : (palette?.seed ?? accent ?? PAPER_PALETTE.seed);

  const material = useMaterialColors({ colorScheme: scheme, seedColor });
  const colors = useMemo(() => {
    // Curated palettes take over surface colors entirely (Paisa-style fixed themes).
    // Dynamic wallpaper or free accent still use Material You tonal mapping.
    let base =
      !wallpaper && palette
        ? tonalColorsFromPalette(palette, scheme)
        : materialColors(material as unknown as MaterialPalette, scheme);
    // Surfaces are tones of one neutral palette (Material 3 tone-based
    // surfaces); pure black moves that ladder down to #000.
    if (scheme === 'dark' && pureBlack) base = tonalPureBlack(base);
    if (highContrast) base = highContrastColors(base, scheme);
    return base;
  }, [material, scheme, pureBlack, highContrast, wallpaper, palette]);

  return (
    <ThemeShell colors={colors} scheme={scheme} dynamic={wallpaper}>
      {children}
    </ThemeShell>
  );
}
