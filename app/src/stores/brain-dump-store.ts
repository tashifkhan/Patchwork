import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { syncDailyNotifications } from '@/lib/notifications';
import { dayKey } from '@/stores/pomodoro-store';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * Brain dump: one free-form page per day. You throw thoughts at it whenever,
 * then AI sorts the page into to-dos (reviewed before saving) and a tidy
 * note for everything else. The raw text and the note stay on this device.
 */

export interface DumpDay {
  /** `YYYY-MM-DD`. */
  day: string;
  text: string;
  updatedAt: number;
  /** The AI's note from the last sort. */
  note: { title: string; markdown: string } | null;
  /** When the page was last sorted, and how much of it was new since. */
  sortedAt: number | null;
  sortedText: string | null;
  taskCount: number;
}

interface BrainDumpState {
  days: Record<string, DumpDay>;
  setText: (day: string, text: string) => void;
  /** Adds a line to today's page (the quick-capture field). */
  append: (text: string) => void;
  markSorted: (day: string, result: { note: DumpDay['note']; taskCount: number }) => void;
  setNote: (day: string, note: DumpDay['note']) => void;
  remove: (day: string) => void;
}

const KEEP_DAYS = 180;

function blank(day: string): DumpDay {
  return { day, text: '', updatedAt: Date.now(), note: null, sortedAt: null, sortedText: null, taskCount: 0 };
}

export const todayKey = () => dayKey(new Date());

export const useBrainDumpStore = create<BrainDumpState>()(
  persist(
    (set, get) => {
      function patch(day: string, change: Partial<DumpDay>) {
        const current = get().days[day] ?? blank(day);
        const days = { ...get().days, [day]: { ...current, ...change } };
        const cutoff = dayKey(new Date(Date.now() - KEEP_DAYS * 86_400_000));
        for (const key of Object.keys(days)) {
          if (key < cutoff || (!days[key].text.trim() && !days[key].note && key !== day)) delete days[key];
        }
        set({ days });
      }
      return {
        days: {},
        setText: (day, text) => patch(day, { text, updatedAt: Date.now() }),
        append: (line) => {
          const day = todayKey();
          const current = get().days[day]?.text ?? '';
          const text = current.trim() ? `${current.replace(/\s+$/, '')}\n${line.trim()}` : line.trim();
          patch(day, { text, updatedAt: Date.now() });
        },
        markSorted: (day, result) =>
          patch(day, {
            note: result.note,
            taskCount: result.taskCount,
            sortedAt: Date.now(),
            sortedText: get().days[day]?.text ?? null,
          }),
        setNote: (day, note) => patch(day, { note }),
        remove: (day) => {
          const days = { ...get().days };
          delete days[day];
          set({ days });
        },
      };
    },
    {
      name: 'patchwork-brain-dump',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ days }) => ({ days }),
    }
  )
);

/** Text added since the last sort, so sorting twice doesn't make every to-do twice. */
export function unsortedText(entry: DumpDay | undefined): string {
  if (!entry) return '';
  if (!entry.sortedText) return entry.text.trim();
  if (entry.text.startsWith(entry.sortedText)) return entry.text.slice(entry.sortedText.length).trim();
  return entry.text.trim();
}

/** Re-schedules the morning/evening nudges from Settings. */
export function syncBrainDumpReminders() {
  const { brainDumpReminders, brainDumpTimes } = useSettingsStore.getState();
  return syncDailyNotifications('brain-dump', brainDumpReminders ? brainDumpTimes : [], {
    title: 'Brain dump',
    body: 'Empty your head. Patchwork will sort it into to-dos and notes.',
    href: '/brain-dump',
  }).catch(() => {});
}
