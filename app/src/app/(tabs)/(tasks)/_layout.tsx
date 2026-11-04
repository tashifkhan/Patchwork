import { Stack } from 'expo-router/stack';

import { useTheme } from '@/components/theme/context';
import { themedStackScreenOptions } from '@/lib/screen-options';

/**
 * Deep links and notifications can open a sub-page directly. Keep this tab's
 * main screen underneath so the back button always has somewhere to go.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function TasksLayout() {
  const { colors } = useTheme();

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
      <Stack.Screen name="index" options={{ title: 'Tasks' }} />
      <Stack.Screen name="task/[uid]" options={{ title: 'Task', headerLargeTitle: false }} />
      <Stack.Screen
        name="github-issue/[id]"
        options={{ title: 'GitHub Issue', headerLargeTitle: false }}
      />
    </Stack>
  );
}
