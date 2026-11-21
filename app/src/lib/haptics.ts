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
 * - `longPress()` – entering a selection or contextual mode.
 *
 * On Android these go through the system's own haptic constants (the
 * `View.performHapticFeedback` set Paisa uses from Compose: SEGMENT_TICK,
 * CONTEXT_CLICK, TOGGLE_ON/OFF, CONFIRM, REJECT, LONG_PRESS), so they feel
 * like the rest of the phone instead of generic vibration pulses. iOS keeps
 * the UIKit feedback generators.
 */

import * as Haptics from 'expo-haptics';
import { AndroidHaptics } from 'expo-haptics';
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

const ANDROID = Platform.OS === 'android';

function android(type: AndroidHaptics): void {
  run(() => Haptics.performAndroidHapticsAsync(type));
}

/** Discrete value change: tab switch, chip select, segmented control, picker. */
export function selection(): void {
  if (ANDROID) return android(AndroidHaptics.Segment_Tick);
  run(() => Haptics.selectionAsync());
}

/** Standard button / row press. */
export function tap(): void {
  if (ANDROID) return android(AndroidHaptics.Context_Click);
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Entering a selection or contextual mode (long-press). */
export function longPress(): void {
  if (ANDROID) return android(AndroidHaptics.Long_Press);
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/**
 * A state flip that should feel like it "lands" — checkbox, switch, star.
 * Completing is firmer than un-completing so the two read differently.
 */
export function toggle(on: boolean): void {
  if (ANDROID) return android(on ? AndroidHaptics.Toggle_On : AndroidHaptics.Toggle_Off);
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
  if (ANDROID) {
    // Heavy is a drag pickup in this app; the rest are presses of rising weight.
    return android(
      style === 'heavy'
        ? AndroidHaptics.Drag_Start
        : style === 'light' || style === 'soft'
          ? AndroidHaptics.Clock_Tick
          : AndroidHaptics.Context_Click
    );
  }
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
  if (ANDROID) return android(AndroidHaptics.Confirm);
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Operation completed with a caveat, or a guard blocked the action. */
export function warning(): void {
  if (ANDROID) return android(AndroidHaptics.Reject);
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Operation failed. */
export function error(): void {
  if (ANDROID) return android(AndroidHaptics.Reject);
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

export const haptics = {
  selection,
  tap,
  toggle,
  impact,
  longPress,
  success,
  warning,
  error,
};
