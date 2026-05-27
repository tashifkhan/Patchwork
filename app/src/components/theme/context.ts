import { createContext, useContext } from 'react';

import { appleColors, type SchemeName, type ThemeColors } from '@/lib/theme';

export interface ThemeContextValue {
  colors: ThemeColors;
  scheme: SchemeName;
  /** True when colors are derived from the Android Material You wallpaper palette. */
  dynamic: boolean;
}

export const ThemeContext = createContext<ThemeContextValue>({
  colors: appleColors('light'),
  scheme: 'light',
  dynamic: false,
});

/** Access the resolved theme. Returns concrete color strings safe to pass to native props. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Convenience accessor for just the color tokens. */
export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}
