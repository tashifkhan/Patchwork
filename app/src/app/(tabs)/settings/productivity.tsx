import { router } from 'expo-router';

import {
  RowSeparator,
  SettingsCell,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
  SettingsToggleRow,
} from '@/components/settings/settings-list';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { playSound } from '@/lib/feedback';
import { useSettingsStore } from '@/stores/settings-store';
import { Text } from '@/tw';

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
