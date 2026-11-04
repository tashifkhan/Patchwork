import { Stack } from 'expo-router/stack';

import { useSettingsColors } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
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

  return (
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
      <Stack.Screen
        name="github-repositories"
        options={{ title: 'GitHub Repositories', headerLargeTitle: false }}
      />
    </Stack>
  );
}
