import { after, type LiveActivity } from 'expo-widgets';

import FocusActivity, { type FocusActivityProps } from './FocusActivity';
import type { LiveTimer } from './live-timer';

/**
 * iOS: the focus timer as a Live Activity (lock screen and Dynamic Island).
 * The clock is a SwiftUI timer text, so it ticks without updates from JS;
 * we only push a new state on start, pause, resume and phase changes.
 */
let instance: LiveActivity<FocusActivityProps> | null = null;

function toProps(timer: LiveTimer): FocusActivityProps {
  return {
    taskTitle: timer.title,
    mode: timer.mode,
    startedAt: timer.startedAt,
    endsAt: timer.endsAt ?? timer.startedAt,
    paused: timer.paused,
    pausedLabel: timer.pausedLabel,
  };
}

export async function showLiveTimer(timer: LiveTimer) {
  const props = toProps(timer);
  try {
    if (instance) {
      await instance.update(props);
      return;
    }
    instance = FocusActivity.start(props, 'patchwork://pomodoro');
  } catch {
    instance = null;
  }
}

export async function endLiveTimer() {
  const current = instance;
  instance = null;
  if (!current) return;
  await current.end(after(new Date(Date.now() + 5_000))).catch(() => {});
}
