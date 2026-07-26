import { Stack } from 'expo-router/stack';

import { useTheme } from '@/components/theme/context';
import { themedStackScreenOptions } from '@/lib/screen-options';

export default function AiLayout() {
  const { colors } = useTheme();

  return (
    <Stack screenOptions={themedStackScreenOptions(colors)}>
      <Stack.Screen name="index" options={{ title: 'AI Chat' }} />
      <Stack.Screen name="review" options={{ title: 'Review Tasks', headerLargeTitle: false }} />
    </Stack>
  );
}
