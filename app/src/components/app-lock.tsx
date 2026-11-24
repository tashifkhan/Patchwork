import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { create } from 'zustand';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { DURATION } from '@/lib/motion';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

/**
 * Asks for Face ID, a fingerprint or the device passcode before showing
 * anything, when App lock is on. Locks again after the app has been in the
 * background for the chosen delay, and covers the screen in the app switcher
 * so the thumbnail doesn't show your to-dos.
 *
 * This guards the screen, not the data: CalDAV credentials already live in
 * secure storage, and to-dos stay readable by anything with the phone unlocked
 * and a file browser on a rooted device.
 */
export async function authenticate(reason: string): Promise<boolean> {
  try {
    const LocalAuthentication = await import('expo-local-authentication');
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'Cancel' });
    return result.success;
  } catch {
    return false;
  }
}

/** Whether the phone has any lock (biometric or passcode) we can ask for. */
export async function canUseAppLock(): Promise<boolean> {
  try {
    const LocalAuthentication = await import('expo-local-authentication');
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

// Locked from the first frame (when the setting turns out to be on, nothing
// flashes before the prompt); hydration clears it when App lock is off.
const useLockStore = create<{ locked: boolean }>(() => ({ locked: true }));

export function AppLockGate() {
  const enabled = useSettingsStore((s) => s.appLock);
  const hydrated = useSettingsStore((s) => s.hydrated);
  const delay = useSettingsStore((s) => s.appLockDelaySeconds);
  const { colors } = useTheme();
  const locked = useLockStore((s) => s.locked);
  const [covered, setCovered] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    const ok = await authenticate('Unlock Patchwork');
    prompting.current = false;
    if (ok) useLockStore.setState({ locked: false });
  }, []);

  // Settings rehydrate after the first frame; lock once they say so.
  useEffect(() => {
    if (!hydrated) return;
    useLockStore.setState({ locked: enabled });
    if (enabled) void unlock();
    // Only on hydration; later toggles happen while unlocked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        // The biometric prompt itself makes the app inactive; don't count that.
        if (prompting.current) return;
        backgroundedAt.current ??= Date.now();
        setCovered(true);
        return;
      }
      setCovered(false);
      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      if (since != null && Date.now() - since >= delay * 1000) {
        useLockStore.setState({ locked: true });
        void unlock();
      }
    });
    return () => sub.remove();
  }, [delay, enabled, unlock]);

  if (!hydrated || !enabled || (!locked && !covered)) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.short2)}
      exiting={FadeOut.duration(DURATION.short4)}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, zIndex: 1000 }]}>
      <View className="flex-1 items-center justify-center gap-5 px-10">
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 28,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primaryContainer,
          }}>
          <MaterialCommunityIcons name="lock-outline" size={40} color={colors.onPrimaryContainer} />
        </View>
        <Text className="text-sf-text text-center text-xl font-semibold">Patchwork is locked</Text>
        {locked ? (
          <View style={{ alignSelf: 'stretch' }}>
            <Button label="Unlock" icon="fingerprint" onPress={() => void unlock()} />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}
