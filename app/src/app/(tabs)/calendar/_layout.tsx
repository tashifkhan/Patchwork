import { Stack } from 'expo-router/stack';

import { useTheme } from '@/components/theme/context';
import { themedStackScreenOptions } from '@/lib/screen-options';

export const unstable_settings = { anchor: 'index' };

export default function CalendarLayout() {
  const { colors } = useTheme();

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
      <Stack.Screen name="index" options={{ title: 'Calendar', headerShown: process.env.EXPO_OS === 'ios', headerLargeTitle: false }} />
      <Stack.Screen name="task/[uid]" options={{ title: 'Task', headerLargeTitle: false }} />
    </Stack>
  );
}
