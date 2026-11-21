import { useState } from 'react';

import { authenticate, canUseAppLock } from '@/components/app-lock';
import {
  RowSeparator,
  SettingsCell,
  SettingsGroup,
  SettingsScreen,
  SettingsToggleRow,
} from '@/components/settings/settings-list';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { useSettingsStore } from '@/stores/settings-store';
import { Text } from '@/tw';

const DELAYS = [
  { label: 'Now', value: 0 },
  { label: '30 s', value: 30 },
  { label: '5 min', value: 300 },
  { label: '1 hr', value: 3600 },
];

/** App lock, Karui's "lock a tab with a PIN" done with the phone's own lock. */
export default function PrivacySettingsScreen() {
  const appLock = useSettingsStore((s) => s.appLock);
  const delay = useSettingsStore((s) => s.appLockDelaySeconds);
  const setExtras = useSettingsStore((s) => s.setExtras);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setMessage(null);
    if (next && !(await canUseAppLock())) {
      setMessage('Set up Face ID, a fingerprint or a screen lock on your phone first.');
      return;
    }
    // Prove it works (and that it's you) before turning it on or off.
    if (!(await authenticate(next ? 'Turn on App lock' : 'Turn off App lock'))) return;
    setExtras({ appLock: next });
  }

  return (
    <SettingsScreen>
      <SettingsGroup
        title="App lock"
        footer={
          message ??
          "Asks for Face ID, your fingerprint or your phone's passcode to open Patchwork, and hides your to-dos in the app switcher. Widgets and reminders still show."
        }>
        <SettingsToggleRow
          icon="lock-outline"
          title="Require unlock"
          value={appLock}
          onValueChange={(value) => void toggle(value)}
        />
        {appLock ? (
          <>
            <RowSeparator />
            <SettingsCell>
              <Text className="text-sf-text text-base">Lock again after</Text>
              <SegmentedChoice
                options={DELAYS}
                value={DELAYS.some((d) => d.value === delay) ? delay : 30}
                onChange={(appLockDelaySeconds) => setExtras({ appLockDelaySeconds })}
              />
            </SettingsCell>
          </>
        ) : null}
      </SettingsGroup>
    </SettingsScreen>
  );
}
