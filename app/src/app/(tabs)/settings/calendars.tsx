import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform } from 'react-native';

import {
  RowSeparator,
  SettingsActionRow,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
  SettingsToggleRow,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { useEventCalendars } from '@/hooks/use-device-events';
import { hasRemindersAccess, requestRemindersAccess } from '@/lib/apple-reminders';
import { hasCalendarAccess, requestCalendarAccess } from '@/lib/device-events';
import { queryKeys } from '@/lib/query-client';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

const IOS = Platform.OS === 'ios';

/**
 * Calendars and reminders already on the phone: show calendar events beside
 * to-dos, pick which calendars, and on iPhone use Apple Reminders as lists.
 * Also says plainly what Apple allows on each platform.
 */
export default function CalendarsSettings() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const deviceEvents = useSettingsStore((s) => s.deviceEvents);
  const hidden = useSettingsStore((s) => s.hiddenEventCalendars);
  const appleReminders = useSettingsStore((s) => s.appleReminders);
  const setExtras = useSettingsStore((s) => s.setExtras);
  const [calendarDenied, setCalendarDenied] = useState(false);
  const [remindersDenied, setRemindersDenied] = useState(false);
  const calendars = useEventCalendars(deviceEvents && !calendarDenied);

  // Access can change in system Settings while Patchwork is in the background.
  useFocusEffect(
    useCallback(() => {
      void hasCalendarAccess().then((granted) => setCalendarDenied(deviceEvents && !granted));
      if (IOS) void hasRemindersAccess().then((granted) => setRemindersDenied(appleReminders && !granted));
    }, [deviceEvents, appleReminders])
  );

  async function toggleEvents(next: boolean) {
    if (next && !(await requestCalendarAccess())) {
      setCalendarDenied(true);
      return;
    }
    setCalendarDenied(false);
    setExtras({ deviceEvents: next });
    void queryClient.invalidateQueries({ queryKey: ['device-event-calendars'] });
    void queryClient.invalidateQueries({ queryKey: ['device-events'] });
  }

  async function toggleReminders(next: boolean) {
    if (next && !(await requestRemindersAccess())) {
      setRemindersDenied(true);
      return;
    }
    setRemindersDenied(false);
    setExtras({ appleReminders: next });
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
  }

  function toggleCalendar(id: string, shown: boolean) {
    setExtras({ hiddenEventCalendars: shown ? hidden.filter((entry) => entry !== id) : [...hidden, id] });
  }

  const list = calendars.data ?? [];

  return (
    <SettingsScreen>
      <SettingsGroup
        title="Calendar events"
        footer={
          calendarDenied
            ? 'Patchwork has no calendar access. Allow it in the system Settings app, then come back.'
            : 'Events from every calendar on this phone (Google, Outlook, Samsung, iCloud and the rest) show in the Calendar view next to your to-dos. Patchwork only reads them. Tap one to open it in your calendar app.'
        }>
        <SettingsToggleRow
          icon="calendar-month-outline"
          sf="calendar"
          title={IOS ? 'Show Calendar Events' : 'Show calendar events'}
          value={deviceEvents && !calendarDenied}
          onValueChange={(next) => void toggleEvents(next)}
        />
        {calendarDenied ? (
          <>
            <RowSeparator />
            <SettingsActionRow title={IOS ? 'Open Settings' : 'Open settings'} onPress={() => void Linking.openSettings()} />
          </>
        ) : null}
      </SettingsGroup>

      {deviceEvents && !calendarDenied && list.length > 0 ? (
        <SettingsGroup title="Calendars to show">
          {list.map((calendar, index) => (
            <View key={calendar.id}>
              {index > 0 ? <RowSeparator /> : null}
              <SettingsToggleRow
                leading={
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      marginHorizontal: 8,
                      backgroundColor: calendar.color ?? colors.gray,
                    }}
                  />
                }
                title={calendar.title}
                subtitle={calendar.source && calendar.source !== calendar.title ? calendar.source : undefined}
                value={!hidden.includes(calendar.id)}
                onValueChange={(shown) => toggleCalendar(calendar.id, shown)}
              />
            </View>
          ))}
        </SettingsGroup>
      ) : null}

      {IOS ? (
        <SettingsGroup
          title="Apple Reminders"
          footer={
            remindersDenied
              ? 'Patchwork has no Reminders access. Allow it in the Settings app under Patchwork, then come back.'
              : 'Your Reminders lists show as Patchwork lists and stay in sync with the Reminders app, your Mac and iCloud. Titles, notes, dates, alerts, repeats and ticking off sync. Apple doesn\'t let other apps see subtasks, tags, flags or priority, so those stay in Reminders.'
          }>
          <SettingsToggleRow
            icon="format-list-checks"
            sf="checklist"
            title="Use Apple Reminders"
            value={appleReminders && !remindersDenied}
            onValueChange={(next) => void toggleReminders(next)}
          />
          {remindersDenied ? (
            <>
              <RowSeparator />
              <SettingsActionRow title="Open Settings" onPress={() => void Linking.openSettings()} />
            </>
          ) : null}
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="About iCloud">
        <SettingsRow
          icon="calendar-blank-outline"
          sf="calendar"
          title="iCloud Calendar"
          subtitle={
            IOS
              ? 'With iCloud signed in on this iPhone, its calendars are already among the events above.'
              : 'Add iCloud to this phone with DAVx5 and an app-specific password. Its calendars then show above.'
          }
        />
        <RowSeparator />
        <SettingsRow
          icon="checkbox-marked-circle-outline"
          sf="checkmark.circle"
          title="iCloud Reminders"
          subtitle={
            IOS
              ? 'Use Apple Reminders above. iCloud stopped sharing reminders over CalDAV in iOS 13.'
              : 'Not possible on Android. Since iOS 13, only Apple devices can read iCloud reminders.'
          }
        />
        <RowSeparator />
        <SettingsRow
          icon="cloud-sync-outline"
          sf="person.crop.circle.badge.plus"
          title={IOS ? 'Add CalDAV Account' : 'Add a CalDAV account'}
          subtitle="Nextcloud, Fastmail and others, for to-dos that sync everywhere"
          showChevron
          onPress={() => router.push('/settings/account')}
        />
      </SettingsGroup>

      <Text style={{ fontSize: 13, lineHeight: 18, color: colors.text3, textAlign: 'center', paddingHorizontal: 24 }}>
        {IOS
          ? 'Calendar events and reminders stay on this iPhone. Patchwork reads them here and sends them nowhere.'
          : 'Calendar events stay on this phone. Patchwork reads them here and sends them nowhere.'}
      </Text>
    </SettingsScreen>
  );
}
