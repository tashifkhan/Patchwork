import '../global.css';

import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router/stack';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ThemeProvider } from '@/components/theme/provider';
import { queryClient } from '@/lib/query-client';
import { sheetScreenOptions } from '@/lib/screen-options';
import { registerWidgetBackgroundRefresh } from '@/widgets/background';
import { startWidgetObserver } from '@/widgets/observer';

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
    const stopObserver = startWidgetObserver();
    registerWidgetBackgroundRefresh();
    return () => {
      stopObserver();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AnimatedSplashOverlay />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="new-task"
              options={{ ...sheetScreenOptions([0.6, 1.0], 'New Task'), headerShown: true }}
            />
            <Stack.Screen
              name="new-card"
              options={{ ...sheetScreenOptions([0.6, 1.0], 'New Card'), headerShown: true }}
            />
            <Stack.Screen
              name="new-board"
              options={{ ...sheetScreenOptions([0.4, 0.75], 'New Board'), headerShown: true }}
            />
            <Stack.Screen
              name="column"
              options={{ ...sheetScreenOptions([0.4, 0.75], 'Column'), headerShown: true }}
            />
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
