import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

export type FoldState = 'flat' | 'halfOpened';

export interface FoldInfo {
  /** `flat` when fully open, `halfOpened` in book or tabletop posture. */
  state: FoldState;
  /** `vertical` hinge = book (left/right panes); `horizontal` = tabletop. */
  orientation: 'vertical' | 'horizontal';
  /** The fold splits the window into two logical areas. */
  isSeparating: boolean;
  /** The hinge hides content (a physical gap), so nothing may sit under it. */
  occludes: boolean;
  /** Window-relative hinge rectangle in dp. */
  bounds: { x: number; y: number; width: number; height: number };
}

export interface TimerNotification {
  title: string;
  text: string;
  /** Epoch ms: the end time when counting down, the start time when counting up. */
  baseTime: number;
  countDown: boolean;
  /** Paused timers show `text` with no running clock. */
  paused: boolean;
  /** Epoch ms after which the system removes the notification (countdowns). */
  timeoutAt?: number | null;
}

export interface BackGestureEvent {
  id: number;
  phase: 'started' | 'progress' | 'cancelled' | 'invoked';
  /** 0 to 1 across the swipe. */
  progress: number;
  edge: 'left' | 'right';
}

type NativeModule = {
  claimBack?(id: number): Promise<boolean>;
  releaseBack?(id: number): Promise<void>;
  getFold(): FoldInfo | null;
  showTimerNotification?(options: TimerNotification): void;
  hideTimerNotification?(): void;
  addListener(event: 'onFoldChange', listener: (e: { fold: FoldInfo | null }) => void): EventSubscription;
  addListener(event: 'onBackGesture', listener: (e: BackGestureEvent) => void): EventSubscription;
};

// Optional so a dev client built before this module existed keeps running;
// it just never reports a fold.
const native = requireOptionalNativeModule<NativeModule>('PatchworkWindow');

export function getFold(): FoldInfo | null {
  return native?.getFold() ?? null;
}

export function addFoldListener(listener: (fold: FoldInfo | null) => void): EventSubscription | null {
  return native?.addListener('onFoldChange', (e) => listener(e.fold)) ?? null;
}

/** Android only: the ongoing focus timer notification (a Live Update on Android 16+). */
export function showTimerNotification(options: TimerNotification) {
  try {
    native?.showTimerNotification?.(options);
  } catch {
    // An older dev client without the function: the in-app timer still works.
  }
}

export function hideTimerNotification() {
  try {
    native?.hideTimerNotification?.();
  } catch {}
}

/**
 * Android: takes the system back gesture for `id` until released, reporting
 * its progress through `addBackGestureListener`. Resolves false when the
 * running build has no support, so the caller can fall back to BackHandler.
 */
export async function claimBack(id: number): Promise<boolean> {
  try {
    return (await native?.claimBack?.(id)) ?? false;
  } catch {
    return false;
  }
}

export function releaseBack(id: number) {
  native?.releaseBack?.(id).catch(() => {});
}

export function addBackGestureListener(listener: (e: BackGestureEvent) => void): EventSubscription | null {
  return native?.addListener('onBackGesture', listener) ?? null;
}
