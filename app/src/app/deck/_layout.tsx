import { Stack } from 'expo-router/stack';

import { stackScreenOptions } from '@/lib/screen-options';

export default function DeckLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Deck' }} />
    </Stack>
  );
}
