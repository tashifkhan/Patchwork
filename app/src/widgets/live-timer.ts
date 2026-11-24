/** What the lock screen / status bar shows for the running focus timer. */
export interface LiveTimer {
  /** `focus` and `break` count down to `endsAt`; `stopwatch` counts up from `startedAt`. */
  mode: 'focus' | 'break' | 'stopwatch';
  title: string;
  /** Epoch ms. For a resumed stopwatch, shifted back by the time already logged. */
  startedAt: number;
  /** Epoch ms, countdown modes only. */
  endsAt: number | null;
  paused: boolean;
  /** Shown while paused, e.g. "12:04 left" or "1:05:10 tracked". */
  pausedLabel: string;
}
