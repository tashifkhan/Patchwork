import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { Fragment, useState } from 'react';
import { Pressable } from 'react-native';

import { PickerSheet } from '@/components/boards/picker-sheet';
import {
  RowSeparator,
  SETTINGS_IOS,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
  SettingsToggleRow,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { haptics } from '@/lib/haptics';
import { cancelAllTaskReminders, ensureNotificationPermissions } from '@/lib/notifications';
import { MAX_REMINDER_OFFSETS, REMINDER_PRESETS, formatReminderOffset } from '@/lib/reminder-offsets';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * Task reminders: the master switch, then the default reminders, any number
 * up to five (say a day before and an hour before). Tasks with a reminder
 * time of their own use only that.
 */
export default function NotificationsScreen() {
  const { colors } = useTheme();
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const offsets = useSettingsStore((s) => s.defaultReminderOffsets);
  const setOffsets = useSettingsStore((s) => s.setDefaultReminderOffsets);
  const [permissionAlert, setPermissionAlert] = useState(false);
  const [adding, setAdding] = useState(false);

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

  const available = REMINDER_PRESETS.filter((minutes) => !offsets.includes(minutes));
  const full = offsets.length >= MAX_REMINDER_OFFSETS;

  return (
    <SettingsScreen>
      <SettingsGroup>
        <SettingsToggleRow
          icon="bell-outline"
          title="Task reminders"
          subtitle="Get notified before tasks are due"
          value={notificationsEnabled}
          onValueChange={toggle}
        />
      </SettingsGroup>

      {notificationsEnabled ? (
        <SettingsGroup
          title="Remind me"
          footer={
            offsets.length === 0
              ? 'No default reminders. Only tasks with their own reminder time notify you.'
              : 'Each task with a due date gets one notification per reminder. A task with its own reminder time uses only that.'
          }>
          {offsets.map((minutes, index) => (
            <Fragment key={minutes}>
              {index > 0 ? <RowSeparator /> : null}
              <SettingsRow
                icon={minutes === 0 ? 'bell-ring-outline' : 'bell-outline'}
                title={formatReminderOffset(minutes)}
                trailing={
                  <Pressable
                    onPress={() => {
                      haptics.tap();
                      setOffsets(offsets.filter((candidate) => candidate !== minutes));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove reminder ${formatReminderOffset(minutes)}`}
                    hitSlop={8}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                    {SETTINGS_IOS ? (
                      <SymbolView name="xmark.circle.fill" size={20} tintColor={colors.text3} />
                    ) : (
                      <MaterialCommunityIcons name="close" size={20} color={colors.text2} />
                    )}
                  </Pressable>
                }
              />
            </Fragment>
          ))}
          {!full ? (
            <>
              {offsets.length > 0 ? <RowSeparator /> : null}
              <SettingsRow icon="plus" title="Add reminder" onPress={() => setAdding(true)} />
            </>
          ) : null}
        </SettingsGroup>
      ) : null}

      <PickerSheet
        visible={adding}
        title="Add reminder"
        subtitle="Before each task's due time"
        items={available.map((minutes) => ({
          key: String(minutes),
          label: formatReminderOffset(minutes),
          icon: minutes === 0 ? ('bell-ring-outline' as const) : ('bell-outline' as const),
          onPress: () => {
            haptics.selection();
            setOffsets([...offsets, minutes]);
            setAdding(false);
          },
        }))}
        onClose={() => setAdding(false)}
      />
      <NativeAlert
        visible={permissionAlert}
        title="Permission needed"
        message="Enable notifications in system settings to get reminders."
        onDismiss={() => setPermissionAlert(false)}
      />
    </SettingsScreen>
  );
}
