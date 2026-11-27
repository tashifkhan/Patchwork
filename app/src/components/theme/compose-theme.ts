import type { MaterialColors } from '@expo/ui/jetpack-compose';
import { useMemo } from 'react';

import type { ThemeColors } from '@/lib/theme';

import { useTheme } from './context';

export interface ComposeTheme {
  /** Pass to `Host colorScheme` so Compose picks light or dark from the app, not the OS. */
  colorScheme: 'light' | 'dark';
  /**
   * Pass to `Host colorOverrides`. Compose defaults that we don't set by hand
   * (ripples, the selected menu item, dialog buttons) then come from the app's
   * palette, including the pure black surfaces of AMOLED mode, instead of the
   * system Material You scheme.
   */
  colorOverrides: Partial<MaterialColors>;
}

/** The in-app theme, shaped for a `@expo/ui/jetpack-compose` `Host`. */
export function useComposeTheme(): ComposeTheme {
  const { colors } = useTheme();
  return useMemo(() => composeTheme(colors), [colors]);
}

function composeTheme(colors: ThemeColors): ComposeTheme {
  const roles: Partial<Record<keyof MaterialColors, string>> = {
    primary: colors.accent,
    onPrimary: colors.onAccent,
    primaryContainer: colors.primaryContainer,
    onPrimaryContainer: colors.onPrimaryContainer,
    secondaryContainer: colors.selectionBg,
    onSecondaryContainer: colors.onSelectionBg,
    tertiaryContainer: colors.selectionBg,
    onTertiaryContainer: colors.onSelectionBg,
    background: colors.surface,
    onBackground: colors.text,
    surface: colors.surface,
    onSurface: colors.text,
    onSurfaceVariant: colors.text2,
    surfaceDim: colors.surfaceDim,
    surfaceBright: colors.surfaceBright,
    surfaceContainerLowest: colors.surfaceContainerLowest,
    surfaceContainerLow: colors.surfaceContainerLow,
    surfaceContainer: colors.surfaceContainer,
    surfaceContainerHigh: colors.surfaceContainerHigh,
    surfaceContainerHighest: colors.surfaceContainerHighest,
    error: colors.danger,
    outlineVariant: colors.separator,
  };
  // Compose only takes hex here; rgba() tokens (the separator) keep the default.
  const colorOverrides: Partial<MaterialColors> = {};
  for (const [role, value] of Object.entries(roles)) {
    if (value?.startsWith('#')) colorOverrides[role as keyof MaterialColors] = value as `#${string}`;
  }
  return { colorScheme: isDark(colors.surface) ? 'dark' : 'light', colorOverrides };
}

/** Rough luminance check on a `#rrggbb` color. */
function isDark(hex: string): boolean {
  const raw = hex.replace('#', '').slice(0, 6);
  if (raw.length !== 6) return true;
  const n = Number.parseInt(raw, 16);
  if (Number.isNaN(n)) return true;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}
