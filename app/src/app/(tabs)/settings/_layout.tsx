import { Stack } from 'expo-router/stack';

import { useTheme } from '@/components/theme/context';
import { themedStackScreenOptions } from '@/lib/screen-options';

export default function SettingsLayout() {
  const { colors } = useTheme();

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
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
