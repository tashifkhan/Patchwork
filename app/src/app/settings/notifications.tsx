import { Host, Slider } from '@expo/ui';
import { Alert } from 'react-native';

import { SettingsGroup, SettingsScreen } from '@/components/settings/settings-list';
import { Switch } from '@/components/ui/switch';
import { ensureNotificationPermissions } from '@/lib/notifications';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

export default function NotificationsScreen() {
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const defaultReminderMinutes = useSettingsStore((s) => s.defaultReminderMinutes);
  const setDefaultReminderMinutes = useSettingsStore((s) => s.setDefaultReminderMinutes);

  const reminderLabel =
    defaultReminderMinutes <= 0 ? 'At due time' : `${defaultReminderMinutes} min before`;

  async function toggle(value: boolean) {
    if (value) {
      const granted = await ensureNotificationPermissions();
      if (!granted) {
        Alert.alert('Permission needed', 'Enable notifications in system settings to get reminders.');
        return;
      }
    }
    setNotificationsEnabled(value);
  }

  return (
    <SettingsScreen>
      <SettingsGroup>
        <View className="flex-row items-center justify-between gap-3 px-4 py-3.5">
          <View className="flex-1">
            <Text className="text-sf-text text-base">Task reminders</Text>
            <Text className="text-sf-text-2 mt-0.5 text-xs">Get notified before tasks are due</Text>
          </View>
          <Switch value={notificationsEnabled} onValueChange={toggle} />
        </View>

        {notificationsEnabled ? (
          <>
            <View className="bg-sf-separator ml-4 h-px" />
            <View className="gap-1.5 px-4 py-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-sf-text text-base">Default lead time</Text>
                <Text
                  className="text-sf-text-2 text-base font-medium"
                  style={{ fontVariant: ['tabular-nums'] }}>
                  {reminderLabel}
                </Text>
              </View>
              <Host style={{ height: 36 }}>
                <Slider
                  value={defaultReminderMinutes}
                  min={0}
                  max={60}
                  step={5}
                  onValueChange={(v) => setDefaultReminderMinutes(Math.round(v))}
                />
              </Host>
            </View>
          </>
        ) : null}
      </SettingsGroup>
    </SettingsScreen>
  );
}
