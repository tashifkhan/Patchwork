import { Stack } from 'expo-router/stack';

import { stackScreenOptions } from '@/lib/screen-options';

export default function SearchLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Search' }} />
    </Stack>
  );
}
