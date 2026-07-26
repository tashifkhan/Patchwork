/**
 * Material 3 motion tokens.
 *
 * Values come from the M3 motion spec (m3.material.io/styles/motion) so the
 * Android side matches Paisa's Compose defaults, and iOS inherits the same
 * rhythm rather than a second ad-hoc set of magic numbers.
 *
 * Use `EASING.emphasized` for anything the user's eye should follow (screen
 * and sheet transitions, expanding containers) and `EASING.standard` for
 * small, functional changes (a chip toggling, an icon swapping).
 */

import { Easing, ReduceMotion, withSpring, withTiming } from 'react-native-reanimated';

/** M3 easing curves as cubic-beziers. */
export const EASING = {
  /** Emphasized — the M3 default for on-screen, high-attention motion. */
  emphasized: Easing.bezier(0.2, 0.0, 0.0, 1.0),
  /** Emphasized decelerate — elements entering the screen. */
  emphasizedDecelerate: Easing.bezier(0.05, 0.7, 0.1, 1.0),
  /** Emphasized accelerate — elements leaving the screen. */
  emphasizedAccelerate: Easing.bezier(0.3, 0.0, 0.8, 0.15),
  /** Standard — small utility transitions. */
  standard: Easing.bezier(0.2, 0.0, 0.0, 1.0),
  standardDecelerate: Easing.bezier(0.0, 0.0, 0.0, 1.0),
  standardAccelerate: Easing.bezier(0.3, 0.0, 1.0, 1.0),
} as const;

/** M3 duration tokens (ms). */
export const DURATION = {
  short1: 50,
  short2: 100,
  short3: 150,
  short4: 200,
  medium1: 250,
  medium2: 300,
  medium3: 350,
  medium4: 400,
  long1: 450,
  long2: 500,
} as const;

/**
 * Spring presets. M3 "spatial" springs move position/size; "effect" springs
 * move color/opacity and are intentionally non-bouncy.
 */
export const SPRING = {
  /** Default spatial spring — press scale, drag settle, FAB. */
  spatial: { damping: 26, stiffness: 380, mass: 1 },
  /** Slower, softer spatial spring for larger surfaces (sheets, cards). */
  spatialSlow: { damping: 32, stiffness: 220, mass: 1 },
  /** Non-bouncy — opacity/color. */
  effect: { damping: 40, stiffness: 420, mass: 1 },
} as const;

/** `withTiming` using an M3 curve, honoring the OS reduce-motion setting. */
export function timing(
  toValue: number,
  duration: number = DURATION.medium1,
  easing = EASING.emphasized
) {
  'worklet';
  return withTiming(toValue, {
    duration,
    easing,
    reduceMotion: ReduceMotion.System,
  });
}

/** `withSpring` using an M3 spring preset, honoring reduce-motion. */
export function spring(toValue: number, preset: keyof typeof SPRING = 'spatial') {
  'worklet';
  return withSpring(toValue, {
    ...SPRING[preset],
    reduceMotion: ReduceMotion.System,
  });
}

/** Scale a pressable settles to while held. */
export const PRESS_SCALE = 0.97;

/**
 * Stagger delay for list entrance animations. Capped so long lists don't
 * leave the last rows animating in noticeably after the first.
 */
export function stagger(index: number, step = 22, max = 180): number {
  return Math.min(index * step, max);
}
