import type { Task, TaskList } from '@/api/types';
import type { ThemeColors } from '@/lib/theme';
import { bucketOf, flattenTasks } from '@/features/tasks/task-buckets';

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

/* ── Tones from the theme (Material You) ──────────────────────────────
 * The tiles, list cards and calendar blocks are filled entirely from the
 * theme's Material 3 roles, so with wallpaper colours on they come from the
 * wallpaper: primary, secondary, tertiary and error containers, plus a
 * second tone of each for lists past the fourth. No fixed colours, no hue
 * turning.
 */

export interface Tone {
  fill: string;
  ink: string;
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A container tone of `role` (an M3 colour role such as tertiary or error),
 * the way Material builds `*Container`: the role's hue and chroma at tone 90
 * in light mode or 30 in dark, with its on-colour at 10 or 90. `step` 1 is a
 * second, deeper tone of the same role.
 */
export function containerTone(role: string, dark: boolean, step = 0): Tone {
  const hsl = hexToHsl(role);
  if (!hsl) return { fill: role, ink: dark ? '#FFFFFF' : '#000000' };
  const [h, s] = hsl;
  const sat = s < 6 ? s : Math.min(75, Math.max(28, s));
  if (dark) {
    // On a near-black surface a saturated fill reads as a slab, so dark
    // containers are a muted tint of their role.
    const muted = s < 6 ? s : Math.min(34, Math.max(16, s * 0.5));
    return { fill: hslToHex(h, muted * 0.7, step ? 28 : 22), ink: hslToHex(h, Math.min(muted * 1.6, 50), 88) };
  }
  return { fill: hslToHex(h, sat, step ? 81 : 89), ink: hslToHex(h, Math.min(sat, 60), 14) };
}

/** Smart tiles on M3 roles: Today primary, Scheduled tertiary, All secondary, Overdue error. */
export function smartTone(colors: ThemeColors, dark: boolean, key: SmartKey): Tone {
  switch (key) {
    case 'today':
      return { fill: colors.primaryContainer, ink: colors.onPrimaryContainer };
    case 'scheduled':
      return containerTone(colors.purple, dark);
    case 'all':
      return { fill: colors.selectionBg, ink: colors.onSelectionBg };
    case 'overdue':
      return containerTone(colors.red, dark);
  }
}

/** A list's tone: primary, tertiary, secondary, then the deeper tone of each. */
export function listTone(colors: ThemeColors, dark: boolean, slot: number): Tone {
  const roles = [colors.accent, colors.purple, colors.selectionBg];
  const i = ((slot % 6) + 6) % 6;
  if (i === 0) return { fill: colors.primaryContainer, ink: colors.onPrimaryContainer };
  if (i === 2) return { fill: colors.selectionBg, ink: colors.onSelectionBg };
  if (i === 1) return containerTone(colors.purple, dark);
  return containerTone(roles[i - 3], dark, 1);
}
