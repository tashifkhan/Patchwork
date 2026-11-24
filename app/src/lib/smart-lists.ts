import type { Task, TaskList } from '@/api/types';
import { bucketOf, flattenTasks } from '@/lib/task-buckets';

/** The four views at the top of Tasks, after the Reminders and Things home screens. */
export type SmartKey = 'today' | 'scheduled' | 'all' | 'overdue';

export const SMART_ORDER: SmartKey[] = ['today', 'scheduled', 'all', 'overdue'];

export const SMART_LABELS: Record<SmartKey, string> = {
  today: 'Today',
  scheduled: 'Scheduled',
  all: 'All',
  overdue: 'Overdue',
};

/**
 * Whether an open to-do belongs in a smart view. Scheduled is everything due
 * after today. Only All keeps finished to-dos, so a done one leaves the other
 * views as soon as it's ticked.
 */
export function matchesSmart(task: Pick<Task, 'due_at' | 'completed'>, key: SmartKey, now: Date = new Date()): boolean {
  if (key === 'all') return true;
  if (task.completed) return false;
  const bucket = bucketOf(task, now);
  if (key === 'scheduled') return bucket === 'tomorrow' || bucket === 'upcoming';
  return bucket === key;
}

/** Open to-dos per smart view. */
export function smartCounts(tasks: readonly Pick<Task, 'due_at' | 'completed'>[], now: Date = new Date()): Record<SmartKey, number> {
  const counts: Record<SmartKey, number> = { today: 0, scheduled: 0, all: 0, overdue: 0 };
  for (const task of tasks) {
    if (task.completed) continue;
    counts.all += 1;
    for (const key of ['today', 'scheduled', 'overdue'] as const) {
      if (matchesSmart(task, key, now)) counts[key] += 1;
    }
  }
  return counts;
}

export interface ListSummary {
  list: TaskList;
  open: number;
  done: number;
}

/**
 * Open and finished to-dos per list, subtasks included, in the order the
 * lists came in. Boards (Deck lists) are left out: they have their own tab.
 */
export function summarizeLists(lists: readonly TaskList[], tasks: Task[]): ListSummary[] {
  const open = new Map<string, number>();
  const done = new Map<string, number>();
  for (const task of flattenTasks(tasks)) {
    const map = task.completed ? done : open;
    map.set(task.list_id, (map.get(task.list_id) ?? 0) + 1);
  }
  return lists
    .filter((list) => !list.is_deck)
    .map((list) => ({ list, open: open.get(list.id) ?? 0, done: done.get(list.id) ?? 0 }));
}

/** A colour pair for a tile or card: the fill and the text on it, per scheme. */
export interface Swatch {
  light: string;
  dark: string;
  inkLight: string;
  inkDark: string;
}

const INK_LIGHT = '#1C1B1F';
const INK_DARK = '#F4EFF4';

/** Tonal fills for the smart tiles on Android, close to the reference design. */
export const SMART_SWATCHES: Record<SmartKey, Swatch> = {
  today: { light: '#BAC5FF', dark: '#2C3772', inkLight: INK_LIGHT, inkDark: INK_DARK },
  scheduled: { light: '#FFF07D', dark: '#4A4415', inkLight: INK_LIGHT, inkDark: INK_DARK },
  all: { light: '#C7EEDD', dark: '#1D4738', inkLight: INK_LIGHT, inkDark: INK_DARK },
  overdue: { light: '#FFC5EE', dark: '#5A294C', inkLight: INK_LIGHT, inkDark: INK_DARK },
};

/** Card colours for lists, handed out in order so neighbours never match. */
export const LIST_SWATCHES: Swatch[] = [
  { light: '#F6D8F6', dark: '#46294A', inkLight: INK_LIGHT, inkDark: INK_DARK },
  { light: '#B9C5FF', dark: '#2D3873', inkLight: INK_LIGHT, inkDark: INK_DARK },
  { light: '#FFF07D', dark: '#4A4415', inkLight: INK_LIGHT, inkDark: INK_DARK },
  { light: '#3C8C5C', dark: '#1E5535', inkLight: '#FFFFFF', inkDark: INK_DARK },
  { light: '#FFC5EE', dark: '#5A294C', inkLight: INK_LIGHT, inkDark: INK_DARK },
  { light: '#C7EEDD', dark: '#1D4738', inkLight: INK_LIGHT, inkDark: INK_DARK },
  { light: '#FFD4B3', dark: '#58351E', inkLight: INK_LIGHT, inkDark: INK_DARK },
];

export function listSwatch(index: number): Swatch {
  return LIST_SWATCHES[((index % LIST_SWATCHES.length) + LIST_SWATCHES.length) % LIST_SWATCHES.length];
}

export function swatchColors(swatch: Swatch, dark: boolean): { fill: string; ink: string } {
  return dark ? { fill: swatch.dark, ink: swatch.inkDark } : { fill: swatch.light, ink: swatch.inkLight };
}
