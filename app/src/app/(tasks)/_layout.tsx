import { Stack } from 'expo-router/stack';

import { stackScreenOptions } from '@/lib/screen-options';

export default function TasksLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Tasks' }} />
      <Stack.Screen name="task/[uid]" options={{ title: 'Task', headerLargeTitle: false }} />
      <Stack.Screen
        name="new"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.6, 1.0],
          headerLargeTitle: false,
          title: 'New Task',
        }}
      />
    </Stack>
  );
}
