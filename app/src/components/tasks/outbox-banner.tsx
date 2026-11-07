import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { useConnectivityStore } from '@/lib/connectivity';
import { useOutboxStore } from '@/lib/outbox';
import { flushOutbox } from '@/lib/outbox-sync';
import { Text, View } from '@/tw';

/**
 * Shown above the task list while anything saved offline is still waiting
 * to reach its account, GitHub or Jira.
 */
export function OutboxBanner() {
  const { colors } = useTheme();
  const entries = useOutboxStore((s) => s.entries);
  const offline = useConnectivityStore((s) => s.quality === 'offline');
  const [syncing, setSyncing] = useState(false);
  if (entries.length === 0) return null;

  const failed = entries.filter((entry) => entry.lastError != null).length;
  const waiting = entries.length - failed;
  const title =
    failed > 0
      ? `${failed} item${failed === 1 ? '' : 's'} couldn't sync`
      : `${waiting} item${waiting === 1 ? '' : 's'} waiting to sync`;
  const body =
    failed > 0
      ? 'The server turned these down. Open the outbox to see why, retry, or discard them.'
      : offline
        ? "You're offline. They're saved on this device and go up as soon as you're back online."
        : "Saved on this device. They'll go up on the next sync.";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/settings/offline')}
      className="bg-sf-bg-2 mt-2 flex-row items-start gap-3 rounded-xl px-3 py-3">
      <MaterialCommunityIcons
        name={failed > 0 ? 'cloud-alert-outline' : 'cloud-upload-outline'}
        size={20}
        color={failed > 0 ? colors.orange : colors.accent}
      />
      <View className="flex-1 gap-1">
        <Text className="text-sf-text text-sm font-semibold">{title}</Text>
        <Text className="text-sf-text-2 text-xs">{body}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={syncing}
          onPress={() => {
            setSyncing(true);
            flushOutbox({ retryFailed: true }).finally(() => setSyncing(false));
          }}>
          <Text className="text-sf-blue text-sm font-semibold">{syncing ? 'Syncing…' : 'Sync now'}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}
