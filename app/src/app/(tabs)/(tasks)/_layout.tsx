import { Stack } from 'expo-router/stack';

import { useTheme } from '@/components/theme/context';
import { themedStackScreenOptions } from '@/lib/screen-options';

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
      <Stack.Screen name="tags" options={{ title: 'Tags', headerLargeTitle: false }} />
    </Stack>
  );
}
