import '../global.css';

import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplash } from '@/components/splash/animated-splash';
import { ThemeProvider } from '@/components/theme/provider';
import { useTasks } from '@/hooks/use-tasks';
import { DURATION } from '@/lib/motion';
import { startNotificationResponseObserver, syncTaskReminders } from '@/lib/notifications';
import { queryClient } from '@/lib/query-client';
import { sheetScreenOptions } from '@/lib/screen-options';
import { useSettingsStore } from '@/stores/settings-store';
import { useGitHubSessionStore } from '@/stores/github-session-store';
import { Text, View } from '@/tw';

SplashScreen.preventAutoHideAsync().catch(() => {});
// The in-app `AnimatedSplash` paints the same frame underneath, so the native
// splash can cross-fade out instead of popping.
SplashScreen.setOptions({ duration: DURATION.medium1, fade: true });

/**
 * How long to wait on persisted settings before starting without them.
 *
 * `preventAutoHideAsync` means nothing dismisses the splash but us, so a
 * rehydration that never settles — a wedged AsyncStorage, a native module that
 * failed to link — would otherwise leave the app frozen on the splash with no
 * error and no way forward. Starting on defaults is a far better failure than
 * that; if the read lands later, zustand updates state and the UI re-themes.
 *
 * The real read is single-digit milliseconds, so this only ever trips on a
 * genuine fault.
 */
const HYDRATION_TIMEOUT = 4000;

export default function RootLayout() {
  const hydrated = useSettingsStore((state) => state.hydrated);
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);
  const ready = hydrated || hydrationTimedOut;
  // The native splash may only go once the JS overlay is actually on screen,
  // otherwise its fade-out reveals a blank window for a frame or two.
  const [overlayShown, setOverlayShown] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    const timer = setTimeout(() => setHydrationTimedOut(true), HYDRATION_TIMEOUT);
    return () => clearTimeout(timer);
  }, [hydrated]);

  useEffect(() => {
    if (ready && overlayShown) SplashScreen.hideAsync().catch(() => {});
  }, [ready, overlayShown]);

  // Never leave the native splash up because the overlay failed to lay out.
  useEffect(() => {
    const timer = setTimeout(
      () => SplashScreen.hideAsync().catch(() => {}),
      HYDRATION_TIMEOUT + 1000
    );
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let stopObserver = () => {};
    if (process.env.EXPO_OS !== 'web' && Constants.appOwnership !== 'expo') {
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
              options={sheetScreenOptions([0.72, 1.0], 'New Task')}
            />
            {/*
              Root-level so it can be presented over the `new-task` sheet. While
              it lived in `(tabs)/(tasks)` the push targeted a navigator sitting
              below the sheet, which made the picker unreachable while creating.
            */}
            <Stack.Screen name="tags" options={sheetScreenOptions([0.72, 1.0], 'Tags')} />
            {/*
              AI import review. Pushed from the add dialog (natural language or a
              photo); nothing is written until the user taps Create.
            */}
            <Stack.Screen
              name="ai-review"
              options={{ headerShown: true, headerLargeTitle: false, title: 'Review tasks' }}
            />
            <Stack.Screen
              name="new-card"
              options={sheetScreenOptions([0.72, 1.0], 'New Card')}
            />
            <Stack.Screen
              name="new-issue"
              options={sheetScreenOptions([0.72, 1.0], 'New Issue')}
            />
            <Stack.Screen
              name="new-board"
              options={sheetScreenOptions([0.55, 0.85], 'New Board')}
            />
            <Stack.Screen
              name="column"
              options={sheetScreenOptions([0.55, 0.85], 'Column')}
            />
            <Stack.Screen
              name="edit-list"
              options={sheetScreenOptions([0.55, 0.85], 'Edit List')}
            />
          </Stack>
          <AnimatedSplash ready={ready} onLayout={() => setOverlayShown(true)} />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // `RootLayout` never mounted if we are here, so nothing else will take the
  // native splash down — without this the crash is invisible behind it.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

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
  const initializeGitHub = useGitHubSessionStore((state) => state.initialize);
  const notificationsEnabled = useSettingsStore((state) => state.notificationsEnabled);
  const defaultReminderOffsets = useSettingsStore((state) => state.defaultReminderOffsets);

  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') initializeGitHub();
  }, [initializeGitHub]);

  useEffect(() => {
    if (!tasksQuery.data) return;
    syncTaskReminders(tasksQuery.data).catch(() => {});
  }, [tasksQuery.data, notificationsEnabled, defaultReminderOffsets]);

  useEffect(() => {
    let active = true;
    let stop = () => {};
    startNotificationResponseObserver((taskUid) => {
      router.push({
        pathname: '/task/[uid]',
        params: { uid: taskUid },
      });
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
