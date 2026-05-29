import { Stack } from 'expo-router/stack';

import { stackScreenOptions } from '@/lib/screen-options';

export default function TasksLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Tasks' }} />
      <Stack.Screen name="task/[uid]" options={{ title: 'Task', headerLargeTitle: false }} />
      <Stack.Screen name="tags" options={{ title: 'Tags', headerLargeTitle: false }} />
    </Stack>
  );
}
