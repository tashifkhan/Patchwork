import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { cancelReminder, scheduleOneOffNotification } from '@/lib/notifications';
import { useSettingsStore } from '@/stores/settings-store';
import { endLiveTimer, showLiveTimer } from '@/widgets/focus';

/**
 * The focus timer, in two modes:
 *
 * - Pomodoro (Karui): a work block then a break, with a notification at the
 *   end of each so it works with the app closed.
 * - Stopwatch (TickTick): counts up until you stop it, then logs the time.
 *
 * Both are wall-clock based (`endsAt`, `startedAt`), so nothing ticks in the
 * background; screens call `settle()` to catch a phase that ended meanwhile.
 * Every finished block or stopwatch run lands in `sessions`, the day's log.
 * While running, the timer shows as a Live Activity on iOS and an ongoing
 * notification (a Live Update on Android 16+) on Android.
 */

export type TimerPhase = 'idle' | 'work' | 'break' | 'stopwatch';

export interface FocusSession {
  id: string;
  kind: 'pomodoro' | 'stopwatch' | 'manual';
  /** Epoch ms. */
  start: number;
  end: number;
  minutes: number;
  taskUid: string | null;
  title: string | null;
}

/** Totals per local day, `YYYY-MM-DD`. `sessions` counts pomodoro blocks; `minutes` counts everything. */
export type PomodoroHistory = Record<string, { sessions: number; minutes: number }>;

interface TimerState {
  phase: TimerPhase;
  /** Countdown phases: epoch ms when the phase ends. Null while paused or idle. */
  endsAt: number | null;
  /** Countdown phases: ms left, set while paused. */
  pausedRemaining: number | null;
  /** Stopwatch: epoch ms it (virtually) started, shifted forward past pauses. */
  startedAt: number | null;
  /** Stopwatch: ms tracked so far, set while paused. */
  pausedElapsed: number | null;
  /** First start of the current stopwatch run, for the log. */
  runStart: number | null;
  /** Length of the running countdown phase, for the progress bar. */
  phaseMinutes: number;
  taskUid: string | null;
  taskTitle: string | null;
  notificationId: string | null;
  history: PomodoroHistory;
  sessions: FocusSession[];

  start: (task?: { uid: string; title: string }) => Promise<void>;
  startStopwatch: (task?: { uid: string; title: string }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  /** Pomodoro: end the running phase now. A skipped work block doesn't count. */
  skip: () => Promise<void>;
  /** Stop and reset. A stopwatch run is logged; a half-done pomodoro block isn't. */
  stop: () => Promise<void>;
  /** Advance past countdown phases that ended while the app wasn't looking. */
  settle: (now?: number) => Promise<void>;
  /** Add time by hand, e.g. work done away from the phone. */
  logManual: (minutes: number, task?: { uid: string; title: string } | null, at?: number) => void;
  removeSession: (id: string) => void;
  /** Re-show the lock screen / status bar timer, e.g. after a relaunch. */
  refreshLive: () => void;
}

export function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "1:05:10" or "25:00". */
export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "2h 15m", "40m". */
export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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

const IDLE = {
  phase: 'idle' as const,
  endsAt: null,
  pausedRemaining: null,
  startedAt: null,
  pausedElapsed: null,
  runStart: null,
  notificationId: null,
  taskUid: null,
  taskTitle: null,
};

const MAX_SESSIONS = 3000;

export const usePomodoroStore = create<TimerState>()(
  persist(
    (set, get) => {
      /** Push the current state to the lock screen / status bar. */
      function syncLive() {
        const s = get();
        if (s.phase === 'idle') {
          void endLiveTimer().catch(() => {});
          return;
        }
        const title = s.taskTitle ?? (s.phase === 'stopwatch' ? 'Stopwatch' : 'Focus timer');
        if (s.phase === 'stopwatch') {
          const paused = s.pausedElapsed != null;
          void showLiveTimer({
            mode: 'stopwatch',
            title,
            startedAt: s.startedAt ?? Date.now(),
            endsAt: null,
            paused,
            pausedLabel: `${formatClock(s.pausedElapsed ?? 0)} tracked`,
          }).catch(() => {});
          return;
        }
        const paused = s.pausedRemaining != null;
        const endsAt = s.endsAt ?? Date.now() + (s.pausedRemaining ?? 0);
        void showLiveTimer({
          mode: s.phase === 'work' ? 'focus' : 'break',
          title,
          startedAt: endsAt - s.phaseMinutes * 60_000,
          endsAt,
          paused,
          pausedLabel: `${formatClock(s.pausedRemaining ?? 0)} left`,
        }).catch(() => {});
      }

      /**
       * Switches phase synchronously (so two overlapping `settle()` calls
       * can't both act on the old one), then swaps the end-of-phase
       * notification.
       */
      async function enter(phase: 'work' | 'break', now = Date.now()) {
        const previousId = get().notificationId;
        const phaseMinutes = minutesFor(phase);
        const endsAt = now + phaseMinutes * 60_000;
        set({ phase, endsAt, pausedRemaining: null, phaseMinutes, notificationId: null });
        syncLive();
        void cancelReminder(previousId).catch(() => {});
        await schedule(phase, endsAt);
      }

      /** Schedules the end notification, unless the phase changed while it was being scheduled. */
      async function schedule(phase: 'work' | 'break', endsAt: number) {
        const id = await notifyAt(phase, endsAt, get().taskTitle);
        const current = get();
        if (current.phase === phase && current.endsAt === endsAt) set({ notificationId: id });
        else void cancelReminder(id).catch(() => {});
      }

      function log(session: Omit<FocusSession, 'id'>) {
        if (session.minutes <= 0) return;
        const key = dayKey(new Date(session.start));
        const history = { ...get().history };
        const day = history[key] ?? { sessions: 0, minutes: 0 };
        history[key] = {
          sessions: day.sessions + (session.kind === 'pomodoro' ? 1 : 0),
          minutes: Math.round((day.minutes + session.minutes) * 10) / 10,
        };
        const cutoff = dayKey(new Date(Date.now() - 366 * 86_400_000));
        for (const k of Object.keys(history)) if (k < cutoff) delete history[k];
        const entry: FocusSession = {
          ...session,
          id: `${session.start.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        };
        set({ history, sessions: [entry, ...get().sessions].slice(0, MAX_SESSIONS) });
      }

      function task(t?: { uid: string; title: string } | null) {
        return { taskUid: t?.uid ?? null, taskTitle: t?.title ?? null };
      }

      return {
        ...IDLE,
        phaseMinutes: 25,
        history: {},
        sessions: [],

        start: async (t) => {
          if (get().phase === 'stopwatch') await get().stop();
          set(task(t));
          await enter('work');
        },

        startStopwatch: async (t) => {
          if (get().phase !== 'idle') await get().stop();
          const now = Date.now();
          set({ ...IDLE, ...task(t), phase: 'stopwatch', startedAt: now, runStart: now });
          syncLive();
        },

        pause: async () => {
          const { phase, endsAt, startedAt, notificationId } = get();
          if (phase === 'stopwatch') {
            if (startedAt == null) return;
            set({ pausedElapsed: Date.now() - startedAt, startedAt: null });
          } else {
            if (endsAt == null) return;
            set({ pausedRemaining: Math.max(0, endsAt - Date.now()), endsAt: null, notificationId: null });
            void cancelReminder(notificationId).catch(() => {});
          }
          syncLive();
        },

        resume: async () => {
          const { phase, pausedRemaining, pausedElapsed } = get();
          if (phase === 'stopwatch') {
            if (pausedElapsed == null) return;
            set({ startedAt: Date.now() - pausedElapsed, pausedElapsed: null });
            syncLive();
            return;
          }
          if (pausedRemaining == null || phase === 'idle') return;
          const endsAt = Date.now() + pausedRemaining;
          set({ endsAt, pausedRemaining: null });
          syncLive();
          await schedule(phase, endsAt);
        },

        skip: async () => {
          const { phase } = get();
          if (phase === 'work') await enter('break');
          else await get().stop();
        },

        stop: async () => {
          const s = get();
          if (s.phase === 'stopwatch') {
            const elapsed = s.pausedElapsed ?? (s.startedAt != null ? Date.now() - s.startedAt : 0);
            const start = s.runStart ?? Date.now() - elapsed;
            // Under a minute is almost always a mis-tap.
            if (elapsed >= 60_000) {
              log({ kind: 'stopwatch', start, end: Date.now(), minutes: elapsed / 60_000, taskUid: s.taskUid, title: s.taskTitle });
            }
          }
          set({ ...IDLE });
          syncLive();
          await cancelReminder(s.notificationId).catch(() => {});
        },

        settle: async (now = Date.now()) => {
          const { phase, endsAt, phaseMinutes, taskUid, taskTitle } = get();
          if (phase !== 'work' && phase !== 'break') return;
          if (endsAt == null || now < endsAt) return;
          if (phase === 'work') {
            log({
              kind: 'pomodoro',
              start: endsAt - phaseMinutes * 60_000,
              end: endsAt,
              minutes: phaseMinutes,
              taskUid,
              title: taskTitle,
            });
            // The break started when the work block ended, not when we noticed.
            const breakEnds = endsAt + minutesFor('break') * 60_000;
            if (breakEnds > now) {
              await enter('break', endsAt);
              return;
            }
          }
          set({ ...IDLE });
          syncLive();
        },

        logManual: (minutes, t, at = Date.now()) => {
          log({ kind: 'manual', start: at - minutes * 60_000, end: at, minutes, ...task(t), title: t?.title ?? null });
        },

        refreshLive: () => syncLive(),

        removeSession: (id) => {
          const session = get().sessions.find((entry) => entry.id === id);
          if (!session) return;
          const key = dayKey(new Date(session.start));
          const history = { ...get().history };
          const day = history[key];
          if (day) {
            history[key] = {
              sessions: Math.max(0, day.sessions - (session.kind === 'pomodoro' ? 1 : 0)),
              minutes: Math.max(0, Math.round((day.minutes - session.minutes) * 10) / 10),
            };
          }
          set({ history, sessions: get().sessions.filter((entry) => entry.id !== id) });
        },
      };
    },
    {
      name: 'patchwork-pomodoro',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        phase,
        endsAt,
        pausedRemaining,
        startedAt,
        pausedElapsed,
        runStart,
        phaseMinutes,
        taskUid,
        taskTitle,
        notificationId,
        history,
        sessions,
      }) => ({
        phase,
        endsAt,
        pausedRemaining,
        startedAt,
        pausedElapsed,
        runStart,
        phaseMinutes,
        taskUid,
        taskTitle,
        notificationId,
        history,
        sessions,
      }),
      migrate: (persisted) => ({ sessions: [], ...(persisted as object) }) as TimerState,
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

/** Days in a row, ending today or yesterday, with any focus time. */
export function streak(history: PomodoroHistory, now: Date = new Date()) {
  let count = 0;
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!history[dayKey(day)]?.minutes) day.setDate(day.getDate() - 1);
  while (history[dayKey(day)]?.minutes) {
    count += 1;
    day.setDate(day.getDate() - 1);
  }
  return count;
}

/** Sessions that started on the given local day, newest first. */
export function sessionsOn(sessions: FocusSession[], date: Date) {
  const key = dayKey(date);
  return sessions.filter((session) => dayKey(new Date(session.start)) === key);
}

/** Minutes logged against one to-do, today and in total. */
export function taskTime(sessions: FocusSession[], taskUid: string, now: Date = new Date()) {
  const todayKey = dayKey(now);
  let today = 0;
  let total = 0;
  for (const session of sessions) {
    if (session.taskUid !== taskUid) continue;
    total += session.minutes;
    if (dayKey(new Date(session.start)) === todayKey) today += session.minutes;
  }
  return { today, total };
}
