import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { cancelReminder, scheduleOneOffNotification } from '@/lib/notifications';
import { useSettingsStore } from '@/stores/settings-store';
import { endFocus, startFocus } from '@/widgets/focus';

/**
 * Karui's pomodoro timer: a work block, then a break, with a notification at
 * the end of each so it works with the app closed. The timer is wall-clock
 * based (`endsAt`), so nothing has to tick in the background; the screen
 * calls `settle()` when it wakes up to catch any phase that ended meanwhile.
 *
 * On iOS a work block also runs the existing Live Activity.
 */

export type PomodoroPhase = 'idle' | 'work' | 'break';

/** Finished work blocks per local day, `YYYY-MM-DD`. */
export type PomodoroHistory = Record<string, { sessions: number; minutes: number }>;

interface PomodoroState {
  phase: PomodoroPhase;
  /** Epoch ms when the running phase ends. Null while paused or idle. */
  endsAt: number | null;
  /** Milliseconds left, set while paused. */
  pausedRemaining: number | null;
  /** Length of the running phase, for the progress ring. */
  phaseMinutes: number;
  taskUid: string | null;
  taskTitle: string | null;
  notificationId: string | null;
  history: PomodoroHistory;

  start: (task?: { uid: string; title: string }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  /** End the running phase now. A skipped work block doesn't count. */
  skip: () => Promise<void>;
  stop: () => Promise<void>;
  /** Advance past phases that ended while the app wasn't looking. */
  settle: (now?: number) => Promise<void>;
}

export function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function minutesFor(phase: 'work' | 'break') {
  const { pomodoroWorkMinutes, pomodoroBreakMinutes } = useSettingsStore.getState();
  return phase === 'work' ? pomodoroWorkMinutes : pomodoroBreakMinutes;
}

async function notifyAt(phase: 'work' | 'break', endsAt: number, taskTitle: string | null) {
  const breakMinutes = minutesFor('break');
  return scheduleOneOffNotification(
    phase === 'work'
      ? {
          title: 'Focus block done',
          body: `${taskTitle ? `${taskTitle}. ` : ''}Take a ${breakMinutes} minute break.`,
          date: new Date(endsAt),
        }
      : { title: 'Break over', body: 'Ready for the next focus block?', date: new Date(endsAt) }
  );
}

export const usePomodoroStore = create<PomodoroState>()(
  persist(
    (set, get) => {
      async function enter(phase: 'work' | 'break', now = Date.now()) {
        const { notificationId, taskUid, taskTitle } = get();
        await cancelReminder(notificationId).catch(() => {});
        const phaseMinutes = minutesFor(phase);
        const endsAt = now + phaseMinutes * 60_000;
        set({ phase, endsAt, pausedRemaining: null, phaseMinutes, notificationId: null });
        const id = await notifyAt(phase, endsAt, taskTitle);
        set({ notificationId: id });
        if (phase === 'work' && taskUid) {
          void startFocus(taskUid, taskTitle ?? 'Focus', phaseMinutes * 60).catch(() => {});
        } else {
          void endFocus().catch(() => {});
        }
      }

      function record(minutes: number, at: number) {
        const key = dayKey(new Date(at));
        const history = { ...get().history };
        const day = history[key] ?? { sessions: 0, minutes: 0 };
        history[key] = { sessions: day.sessions + 1, minutes: day.minutes + minutes };
        // Keep a year.
        const cutoff = dayKey(new Date(at - 366 * 86_400_000));
        for (const k of Object.keys(history)) if (k < cutoff) delete history[k];
        set({ history });
      }

      return {
        phase: 'idle',
        endsAt: null,
        pausedRemaining: null,
        phaseMinutes: 25,
        taskUid: null,
        taskTitle: null,
        notificationId: null,
        history: {},

        start: async (task) => {
          set({ taskUid: task?.uid ?? null, taskTitle: task?.title ?? null });
          await enter('work');
        },

        pause: async () => {
          const { endsAt, notificationId } = get();
          if (endsAt == null) return;
          await cancelReminder(notificationId).catch(() => {});
          set({ pausedRemaining: Math.max(0, endsAt - Date.now()), endsAt: null, notificationId: null });
          void endFocus().catch(() => {});
        },

        resume: async () => {
          const { pausedRemaining, phase, taskTitle, taskUid } = get();
          if (pausedRemaining == null || phase === 'idle') return;
          const endsAt = Date.now() + pausedRemaining;
          set({ endsAt, pausedRemaining: null });
          const id = await notifyAt(phase, endsAt, taskTitle);
          set({ notificationId: id });
          if (phase === 'work' && taskUid) {
            void startFocus(taskUid, taskTitle ?? 'Focus', Math.round(pausedRemaining / 1000)).catch(() => {});
          }
        },

        skip: async () => {
          const { phase } = get();
          if (phase === 'work') await enter('break');
          else if (phase === 'break') await get().stop();
        },

        stop: async () => {
          await cancelReminder(get().notificationId).catch(() => {});
          set({ phase: 'idle', endsAt: null, pausedRemaining: null, notificationId: null, taskUid: null, taskTitle: null });
          void endFocus().catch(() => {});
        },

        settle: async (now = Date.now()) => {
          const { phase, endsAt, phaseMinutes } = get();
          if (phase === 'idle' || endsAt == null || now < endsAt) return;
          if (phase === 'work') {
            record(phaseMinutes, endsAt);
            // The break started when the work block ended, not when we noticed.
            const breakEnds = endsAt + minutesFor('break') * 60_000;
            if (breakEnds > now) {
              await enter('break', endsAt);
              return;
            }
          }
          set({ phase: 'idle', endsAt: null, pausedRemaining: null, notificationId: null, taskUid: null, taskTitle: null });
          void endFocus().catch(() => {});
        },
      };
    },
    {
      name: 'patchwork-pomodoro',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ phase, endsAt, pausedRemaining, phaseMinutes, taskUid, taskTitle, notificationId, history }) => ({
        phase,
        endsAt,
        pausedRemaining,
        phaseMinutes,
        taskUid,
        taskTitle,
        notificationId,
        history,
      }),
    }
  )
);

/** The last `days` days, oldest first, with zeros filled in. */
export function recentHistory(history: PomodoroHistory, days: number, now: Date = new Date()) {
  const out: { key: string; date: Date; sessions: number; minutes: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(date);
    out.push({ key, date, sessions: history[key]?.sessions ?? 0, minutes: history[key]?.minutes ?? 0 });
  }
  return out;
}

/** Days in a row, ending today or yesterday, with at least one finished block. */
export function streak(history: PomodoroHistory, now: Date = new Date()) {
  let count = 0;
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!history[dayKey(day)]?.sessions) day.setDate(day.getDate() - 1);
  while (history[dayKey(day)]?.sessions) {
    count += 1;
    day.setDate(day.getDate() - 1);
  }
  return count;
}
