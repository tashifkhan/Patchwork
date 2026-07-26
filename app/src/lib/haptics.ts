/**
 * Central haptics layer.
 *
 * Every call is fire-and-forget and safe on any platform: web has no haptics
 * engine, and Android devices without a vibrator silently no-op. Feedback is
 * gated on the user's `hapticsEnabled` setting so the whole app can be muted
 * from one switch.
 *
 * Semantics follow the platform conventions rather than raw intensities so
 * call sites read as intent ("this was a selection", "this failed"):
 *
 * - `selection()`  – discrete value change: tab switch, chip, segment, picker.
 * - `tap()`        – a normal button/row press.
 * - `toggle()`     – a state flip that "lands" (checkbox, switch).
 * - `impact()`     – physical events: drag pickup/drop, sheet snap.
 * - `success()` / `warning()` / `error()` – outcome notifications.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { useSettingsStore } from '@/stores/settings-store';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

function enabled(): boolean {
  if (!supported) return false;
  // Read straight from the store so non-React call sites (drag worklets'
  // JS callbacks, mutation handlers) get the live value without a hook.
  return useSettingsStore.getState().hapticsEnabled;
}

/** Swallow rejections — a missing vibrator must never surface as an error. */
function run(fn: () => Promise<void>): void {
  if (!enabled()) return;
  void fn().catch(() => {});
}

/** Discrete value change: tab switch, chip select, segmented control, picker. */
export function selection(): void {
  run(() => Haptics.selectionAsync());
}

/** Standard button / row press. */
export function tap(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/**
 * A state flip that should feel like it "lands" — checkbox, switch, star.
 * Completing is firmer than un-completing so the two read differently.
 */
export function toggle(on: boolean): void {
  run(() =>
    Haptics.impactAsync(
      on ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
    )
  );
}

/** Physical event: drag pickup/drop, sheet snap, FAB press. */
export function impact(
  style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium'
): void {
  const map = {
    light: Haptics.ImpactFeedbackStyle.Light,
    medium: Haptics.ImpactFeedbackStyle.Medium,
    heavy: Haptics.ImpactFeedbackStyle.Heavy,
    rigid: Haptics.ImpactFeedbackStyle.Rigid,
    soft: Haptics.ImpactFeedbackStyle.Soft,
  } as const;
  run(() => Haptics.impactAsync(map[style]));
}

/** Operation completed successfully (task saved, sync finished). */
export function success(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Operation completed with a caveat, or a guard blocked the action. */
export function warning(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Operation failed. */
export function error(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

export const haptics = {
  selection,
  tap,
  toggle,
  impact,
  success,
  warning,
  error,
};
