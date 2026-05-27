import { ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useColorScheme, View } from 'react-native';
import { useEffect, useMemo, type ReactNode } from 'react';
import { colorScheme as rnColorScheme, VariableContextProvider } from 'react-native-css';

import { themeVariables, type SchemeName, type ThemeColors } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settings-store';

import { ThemeContext } from './context';

/** Build a React Navigation theme from our resolved tokens so headers/tab bar match. */
export function navTheme(colors: ThemeColors, scheme: SchemeName): ReactNavigation.Theme {
  return {
    dark: scheme === 'dark',
    colors: {
      primary: colors.accent,
      background: colors.bg,
      card: colors.bg2,
      text: colors.text,
      border: colors.separator,
      notification: colors.red,
    },
    fonts: {
      regular: { fontFamily: undefined as any, fontWeight: '400' },
      medium: { fontFamily: undefined as any, fontWeight: '500' },
      bold: { fontFamily: undefined as any, fontWeight: '600' },
      heavy: { fontFamily: undefined as any, fontWeight: '700' },
    },
  };
}

export function useEffectiveScheme(): SchemeName {
  const system = useColorScheme();
  const themeMode = useSettingsStore((s) => s.themeMode);
  return themeMode === 'system' ? (system === 'dark' ? 'dark' : 'light') : themeMode;
}

/**
 * Shared shell that injects concrete color tokens into the CSS runtime and the
 * navigation theme. The platform providers (`provider.tsx` for iOS/web,
 * `provider.android.tsx` for Material You) compute `colors` and hand them here.
 */
export function ThemeShell({
  colors,
  scheme,
  dynamic,
  children,
}: {
  colors: ThemeColors;
  scheme: SchemeName;
  dynamic: boolean;
  children: ReactNode;
}) {
  const variables = useMemo(() => themeVariables(colors), [colors]);
  const value = useMemo(() => ({ colors, scheme, dynamic }), [colors, scheme, dynamic]);
  const theme = useMemo(() => navTheme(colors, scheme), [colors, scheme]);

  // Keep any remaining CSS light-dark()/@media resolution aligned with the
  // effective scheme too (e.g. native form sheets, scrollbar styling).
  useEffect(() => {
    rnColorScheme.set(scheme);
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [colors.bg, scheme]);

  return (
    <ThemeContext value={value}>
      <VariableContextProvider value={variables}>
        <NavThemeProvider value={theme}>
          <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            {children}
          </View>
        </NavThemeProvider>
      </VariableContextProvider>
    </ThemeContext>
  );
}
