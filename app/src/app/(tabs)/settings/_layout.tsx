import { Stack } from 'expo-router/stack';
import { StyleSheet, View } from 'react-native';

import { useSettingsColors } from '@/components/settings/settings-list';
import { SettingsHub } from './index';
import { useTheme } from '@/components/theme/context';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { IOS_GLASS, themedStackScreenOptions } from '@/lib/screen-options';

const IOS = process.env.EXPO_OS === 'ios';

/**
 * Deep links and notifications can open a sub-page directly. Keep this tab's
 * main screen underneath so the back button always has somewhere to go.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function SettingsLayout() {
  const { colors } = useTheme();
  // Header and content share the grouped background (iOS systemGroupedBackground,
  // Material surface on Android) so the large title sits on the list's color.
  const { screen } = useSettingsColors();
  const base = themedStackScreenOptions(colors, screen);
  const { twoPane, listPaneWidth, hingeGap } = useAdaptiveLayout();

  const stack = (
    <Stack
      screenOptions={{
        ...base,
        // Sub-pages use the inline title, like iOS Settings.
        headerLargeTitle: false,
      }}>
      {/*
        The hub gets the iOS large title. It only renders on the transparent
        glass header (iOS 26+); on a solid header it drew nothing, so older
        iOS keeps the inline title.
      */}
      <Stack.Screen name="index" options={{ title: 'Settings', headerLargeTitle: IOS_GLASS }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="appearance" options={{ title: IOS ? 'Appearance' : 'Look and feel' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="offline" options={{ title: IOS ? 'Offline & Sync' : 'Offline and sync' }} />
      <Stack.Screen name="ai" options={{ title: IOS ? 'AI Import' : 'AI import' }} />
      {/* Title is set per-provider by the screen itself. */}
      <Stack.Screen name="ai-provider" options={{ title: 'Provider', headerLargeTitle: false }} />
      <Stack.Screen name="ai-custom-provider" options={{ title: 'Custom provider' }} />
      <Stack.Screen name="github" options={{ title: IOS ? 'GitHub' : 'GitHub Issues' }} />
      <Stack.Screen name="jira" options={{ title: 'Jira', headerLargeTitle: false }} />
      <Stack.Screen
        name="github-repositories"
        options={{ title: 'GitHub Repositories', headerLargeTitle: false }}
      />
    </Stack>
  );

  if (!twoPane) return stack;

  // iPad Settings style: the hub on the left, the open page on the right.
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: screen }}>
      <View style={{ width: listPaneWidth }}>
        <SettingsHub embedded />
      </View>
      <View
        style={{
          width: hingeGap || StyleSheet.hairlineWidth,
          backgroundColor: hingeGap ? screen : colors.separator,
        }}
      />
      <View style={{ flex: 1 }}>{stack}</View>
    </View>
  );
}
