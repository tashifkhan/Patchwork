// Android: an ongoing notification with a system-ticked chronometer, promoted
// to a Live Update (status bar chip) on Android 16+. See PatchworkWindowModule.kt.
import { hideTimerNotification, showTimerNotification } from '../../modules/patchwork-window/src';

import type { LiveTimer } from './live-timer';

const LABEL = { focus: 'Focus', break: 'Break', stopwatch: 'Tracking time' } as const;

export async function showLiveTimer(timer: LiveTimer) {
  showTimerNotification({
    title: timer.mode === 'break' ? 'Break' : timer.title,
    text: timer.paused ? `Paused · ${timer.pausedLabel}` : LABEL[timer.mode],
    baseTime: timer.mode === 'stopwatch' ? timer.startedAt : (timer.endsAt ?? Date.now()),
    countDown: timer.mode !== 'stopwatch',
    paused: timer.paused,
  });
}

export async function endLiveTimer() {
  hideTimerNotification();
}
