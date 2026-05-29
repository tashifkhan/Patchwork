import { Stack } from 'expo-router/stack';

import { stackScreenOptions } from '@/lib/screen-options';

export default function AiLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'AI Import' }} />
      <Stack.Screen name="review" options={{ title: 'Review Tasks', headerLargeTitle: false }} />
    </Stack>
  );
}
