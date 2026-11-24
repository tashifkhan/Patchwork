import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import Animated from 'react-native-reanimated';
import { Platform, Pressable } from 'react-native';

import {
  RowSeparator,
  SettingsCell,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
  SettingsToggleRow,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { playSound } from '@/lib/feedback';
import { COLLAPSE_OUT, EXPAND_IN, listPlacement } from '@/lib/motion';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

const MAX_REMINDERS = 6;
const timeLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function toDate(time: string) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function fromDate(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const WORK = [15, 25, 45, 60].map((value) => ({ label: `${value}m`, value }));
const BREAK = [3, 5, 10, 15].map((value) => ({ label: `${value}m`, value }));

/** Focus timer lengths, week start, and the feedback extras (sounds, confetti). */
export default function ProductivitySettingsScreen() {
  const settings = useSettingsStore();
  const set = settings.setExtras;

  return (
    <SettingsScreen>
      <SettingsGroup title="Focus timer" footer="A notification tells you when each block or break ends.">
        <SettingsRow
          icon="timer-outline"
          title="Open focus timer"
          subtitle="Pomodoro and stopwatch, with today's log"
          showChevron
          onPress={() => router.push('/pomodoro')}
        />
        <RowSeparator />
        <SettingsCell>
          <Text className="text-sf-text text-base">Focus block</Text>
          <SegmentedChoice
            options={WORK}
            value={WORK.some((o) => o.value === settings.pomodoroWorkMinutes) ? settings.pomodoroWorkMinutes : 25}
            onChange={(pomodoroWorkMinutes) => set({ pomodoroWorkMinutes })}
          />
        </SettingsCell>
        <RowSeparator />
        <SettingsCell>
          <Text className="text-sf-text text-base">Break</Text>
          <SegmentedChoice
            options={BREAK}
            value={BREAK.some((o) => o.value === settings.pomodoroBreakMinutes) ? settings.pomodoroBreakMinutes : 5}
            onChange={(pomodoroBreakMinutes) => set({ pomodoroBreakMinutes })}
          />
        </SettingsCell>
      </SettingsGroup>

      <SettingsGroup
        title="Brain dump"
        footer="A nudge to empty your head at the times you pick. Defaults to once in the morning and once at night.">
        <SettingsRow
          icon="head-lightbulb-outline"
          title="Open brain dump"
          showChevron
          onPress={() => router.push('/brain-dump')}
        />
        <RowSeparator />
        <SettingsToggleRow
          icon="bell-ring-outline"
          title="Brain dump reminders"
          subtitle={
            settings.brainDumpReminders
              ? `${settings.brainDumpTimes.length} a day`
              : 'Off'
          }
          value={settings.brainDumpReminders}
          onValueChange={(brainDumpReminders) => set({ brainDumpReminders })}
        />
        {settings.brainDumpReminders ? (
          <ReminderTimes
            times={settings.brainDumpTimes}
            onChange={(times) => set({ brainDumpTimes: [...new Set(times)].sort() })}
          />
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="Calendar">
        <SettingsToggleRow
          icon="calendar-month-outline"
          title="Week starts on Monday"
          subtitle="For the calendar view"
          value={settings.weekStartsMonday}
          onValueChange={(weekStartsMonday) => set({ weekStartsMonday })}
        />
      </SettingsGroup>

      <SettingsGroup title="Feedback">
        <SettingsToggleRow
          icon="party-popper"
          title="Celebrations"
          subtitle="Confetti when you finish the last to-do in a list"
          value={settings.celebrations}
          onValueChange={(celebrations) => set({ celebrations })}
        />
        <RowSeparator />
        <SettingsToggleRow
          icon="volume-high"
          title="Sounds"
          subtitle="Short sounds for adding, completing and deleting"
          value={settings.uiSounds}
          onValueChange={(uiSounds) => {
            set({ uiSounds });
            if (uiSounds) playSound('complete');
          }}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}

function ReminderTimes({ times, onChange }: { times: string[]; onChange: (times: string[]) => void }) {
  const { colors } = useTheme();
  // Android opens a clock dialog for one row at a time; iOS edits inline.
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  return (
    <>
      {times.map((time, index) => (
        <Animated.View key={`${time}-${index}`} layout={listPlacement()} entering={EXPAND_IN} exiting={COLLAPSE_OUT}>
          <RowSeparator />
          <SettingsCell>
            <View className="flex-row items-center gap-3">
              <MaterialCommunityIcons name="clock-outline" size={20} color={colors.accent} />
              {Platform.OS === 'ios' ? (
                <View style={{ flex: 1, alignItems: 'flex-start' }}>
                  <DateTimePicker
                    mode="time"
                    display="compact"
                    accentColor={colors.accent}
                    value={toDate(time)}
                    onValueChange={(_event, selected) =>
                      onChange(times.map((t, i) => (i === index ? fromDate(selected) : t)))
                    }
                  />
                </View>
              ) : (
                <Pressable
                  style={{ flex: 1, minHeight: 40, justifyContent: 'center' }}
                  accessibilityRole="button"
                  accessibilityLabel={`Reminder at ${timeLabel.format(toDate(time))}. Change time`}
                  onPress={() => setEditing(index)}>
                  <Text className="text-sf-text text-base">{timeLabel.format(toDate(time))}</Text>
                </Pressable>
              )}
              {times.length > 1 ? (
                <Pressable
                  onPress={() => onChange(times.filter((_, i) => i !== index))}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove the ${timeLabel.format(toDate(time))} reminder`}>
                  <MaterialCommunityIcons name="close" size={20} color={colors.text2} />
                </Pressable>
              ) : null}
            </View>
          </SettingsCell>
        </Animated.View>
      ))}
      {times.length < MAX_REMINDERS ? (
        <>
          <RowSeparator />
          <SettingsRow
            icon="plus"
            title="Add a time"
            onPress={() => {
              if (Platform.OS === 'ios') onChange([...times, '13:00']);
              else setEditing('new');
            }}
          />
        </>
      ) : null}
      {Platform.OS === 'android' && editing != null ? (
        <DateTimePicker
          mode="time"
          presentation="dialog"
          accentColor={colors.accent}
          value={toDate(editing === 'new' ? '13:00' : times[editing])}
          onValueChange={(_event, selected) => {
            const value = fromDate(selected);
            onChange(editing === 'new' ? [...times, value] : times.map((t, i) => (i === editing ? value : t)));
            setEditing(null);
          }}
          onDismiss={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
