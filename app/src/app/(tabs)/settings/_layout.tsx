import { Stack } from 'expo-router/stack';
import { StyleSheet, View } from 'react-native';

import { useSettingsColors } from '@/components/settings/settings-list';
import { SettingsHub } from './index';
import { useTheme } from '@/components/theme/context';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { themedStackScreenOptions } from '@/lib/screen-options';

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
  const base = themedStackScreenOptions(colors);
  const { twoPane, listPaneWidth, hingeGap } = useAdaptiveLayout();

  const stack = (
    <Stack
      screenOptions={{
        ...base,
        contentStyle: { backgroundColor: screen },
        headerStyle: { backgroundColor: screen },
        headerLargeStyle: { backgroundColor: screen },
        // The native large title draws nothing on the iOS 27 simulator (the
        // label exists in the accessibility tree but is invisible, before and
        // after this restyle). The inline title renders reliably.
        headerLargeTitle: false,
      }}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="appearance" options={{ title: 'Look and feel' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="ai" options={{ title: 'AI import' }} />
      {/* Title is set per-provider by the screen itself. */}
      <Stack.Screen name="ai-provider" options={{ title: 'Provider', headerLargeTitle: false }} />
      <Stack.Screen name="ai-custom-provider" options={{ title: 'Custom provider' }} />
      <Stack.Screen name="github" options={{ title: 'GitHub Issues' }} />
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
