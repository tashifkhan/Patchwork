import '../global.css';

import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemeProvider } from '@/components/theme/provider';
import { useTasks } from '@/hooks/use-tasks';
import { startNotificationResponseObserver, syncTaskReminders } from '@/lib/notifications';
import { queryClient } from '@/lib/query-client';
import { sheetScreenOptions } from '@/lib/screen-options';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const hydrated = useSettingsStore((state) => state.hydrated);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  useEffect(() => {
    let active = true;
    let stopObserver = () => {};
    if (Constants.appOwnership !== 'expo') {
      Promise.all([import('@/widgets/background'), import('@/widgets/observer')])
        .then(([background, observer]) => {
          if (!active) return;
          stopObserver = observer.startWidgetObserver();
          return background.registerWidgetBackgroundRefresh();
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      stopObserver();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <NativeRuntimeCoordinator />
        <ThemeProvider>
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

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <View className="bg-sf-bg flex-1 items-center justify-center gap-4 px-8">
          <Text selectable className="text-sf-text text-center text-xl font-semibold">
            Patchwork hit an unexpected error
          </Text>
          <Text selectable className="text-sf-text-2 text-center text-sm">
            {error.message}
          </Text>
          <Pressable accessibilityRole="button" onPress={retry}>
            <Text className="text-sf-blue text-base font-semibold">Try again</Text>
          </Pressable>
        </View>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function NativeRuntimeCoordinator() {
  const tasksQuery = useTasks();
  const notificationsEnabled = useSettingsStore((state) => state.notificationsEnabled);
  const defaultReminderMinutes = useSettingsStore((state) => state.defaultReminderMinutes);

  useEffect(() => {
    if (!tasksQuery.data) return;
    syncTaskReminders(tasksQuery.data).catch(() => {});
  }, [tasksQuery.data, notificationsEnabled, defaultReminderMinutes]);

  useEffect(() => {
    let active = true;
    let stop = () => {};
    startNotificationResponseObserver((taskUid) => {
      router.push(`/task/${encodeURIComponent(taskUid)}`);
    }).then((cleanup) => {
      if (active) stop = cleanup;
      else cleanup();
    });
    return () => {
      active = false;
      stop();
    };
  }, []);

  return null;
}
