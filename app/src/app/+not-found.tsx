import { Link, Stack } from 'expo-router';
import { Pressable } from 'react-native';
import { PatchMascot } from '@/components/mascot/patch-mascot';

import { Text, View } from '@/tw';

export default function NotFoundScreen() {
  return (
    <View className="bg-sf-bg flex-1 items-center justify-center gap-4 px-8">
      <Stack.Screen options={{ title: 'Not found', headerShown: true }} />
      <PatchMascot mood="curious" size={170} accessibilityLabel="Patch searching with a magnifier" />
      <Text className="text-sf-text text-center text-xl font-semibold">This page is unavailable</Text>
      <Text selectable className="text-sf-text-2 text-center">
        The link may be stale, or the task or card may have been removed.
      </Text>
      <Link href="/" asChild>
        <Pressable accessibilityRole="button">
          <Text className="text-sf-blue text-base font-semibold">Back to tasks</Text>
        </Pressable>
      </Link>
    </View>
  );
}
