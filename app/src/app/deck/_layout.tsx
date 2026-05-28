import { Stack } from 'expo-router/stack';

import { stackScreenOptions } from '@/lib/screen-options';

export default function DeckLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Boards' }} />
      <Stack.Screen name="new" options={{ title: 'New Card' }} />
      <Stack.Screen
        name="new-board"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.4, 0.75],
          headerLargeTitle: false,
          title: 'New Board',
        }}
      />
      <Stack.Screen
        name="stack"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.4, 0.75],
          headerLargeTitle: false,
          title: 'Column',
        }}
      />
      <Stack.Screen name="card/[cardId]" options={{ title: 'Card' }} />
    </Stack>
  );
}
