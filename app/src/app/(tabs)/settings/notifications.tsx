import { useState } from 'react';

import {
  RowSeparator,
  SettingsCell,
  SettingsGroup,
  SettingsScreen,
  SettingsToggleRow,
} from '@/components/settings/settings-list';
import { NativeAlert } from '@/components/ui/native-alert';
import { Slider } from '@/components/ui/slider';
import { cancelAllTaskReminders, ensureNotificationPermissions } from '@/lib/notifications';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

export default function NotificationsScreen() {
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const defaultReminderMinutes = useSettingsStore((s) => s.defaultReminderMinutes);
  const setDefaultReminderMinutes = useSettingsStore((s) => s.setDefaultReminderMinutes);
  const [permissionAlert, setPermissionAlert] = useState(false);

  const reminderLabel =
    defaultReminderMinutes <= 0 ? 'At due time' : `${defaultReminderMinutes} min before`;

  async function toggle(value: boolean) {
    if (value) {
      const granted = await ensureNotificationPermissions();
      if (!granted) {
        setPermissionAlert(true);
        return;
      }
    }
    setNotificationsEnabled(value);
    if (!value) await cancelAllTaskReminders();
  }

  return (
    <SettingsScreen>
      <SettingsGroup footer="Reminders use the lead time unless a task sets its own.">
        <SettingsToggleRow
          icon="bell-outline"
          title="Task reminders"
          subtitle="Get notified before tasks are due"
          value={notificationsEnabled}
          onValueChange={toggle}
        />

        {notificationsEnabled ? (
          <>
            <RowSeparator />
            <SettingsCell gap={6}>
              <View className="flex-row items-center justify-between">
                <Text className="text-sf-text text-base">Default lead time</Text>
                <Text
                  className="text-sf-text-2 text-base font-medium"
                  style={{ fontVariant: ['tabular-nums'] }}>
                  {reminderLabel}
                </Text>
              </View>
              <Slider
                value={defaultReminderMinutes}
                min={0}
                max={60}
                step={5}
                onValueChange={(v) => setDefaultReminderMinutes(Math.round(v))}
              />
            </SettingsCell>
          </>
        ) : null}
      </SettingsGroup>

      <NativeAlert
        visible={permissionAlert}
        title="Permission needed"
        message="Enable notifications in system settings to get reminders."
        onDismiss={() => setPermissionAlert(false)}
      />
    </SettingsScreen>
  );
}
