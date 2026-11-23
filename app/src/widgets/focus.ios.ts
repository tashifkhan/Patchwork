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
  // A countdown is stale once it reaches zero; the lock screen dims it until we catch up.
  const stale = timer.mode !== 'stopwatch' && !timer.paused && timer.endsAt ? new Date(timer.endsAt) : undefined;
  try {
    // After a relaunch the activity is still up but this module forgot it: adopt it, end extras.
    if (!instance) {
      const [first, ...extras] = FocusActivity.getInstances();
      instance = first ?? null;
      for (const extra of extras) void extra.end(after(new Date())).catch(() => {});
    }
    if (instance) {
      await instance.update(props, stale);
      return;
    }
    instance = FocusActivity.start(props, 'patchwork://pomodoro', stale);
  } catch {
    instance = null;
  }
}

export async function endLiveTimer() {
  instance = null;
  let all: LiveActivity<FocusActivityProps>[] = [];
  try {
    all = FocusActivity.getInstances();
  } catch {}
  await Promise.all(all.map((activity) => activity.end(after(new Date(Date.now() + 5_000))).catch(() => {})));
}
