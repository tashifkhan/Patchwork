/**
 * Things-style date shortcuts for the inline task card.
 *
 * Patchwork only has one date field (CalDAV `DUE`), so "Today" here means
 * "due today". Shortcut dates land at 23:59 local time so a task set for today
 * does not read as overdue in the afternoon. An existing time of day is kept
 * when the user moves a task that already had one.
 */

const DAY_MS = 86_400_000;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole calendar days from today to `iso` (negative when in the past). */
export function daysFromToday(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

/** Put `day` at the time of day from `keepTimeFrom`, or 23:59 when there is none. */
export function atDay(day: Date, keepTimeFrom?: string | null): string {
  const next = startOfDay(day);
  const previous = keepTimeFrom ? new Date(keepTimeFrom) : null;
  if (previous && !Number.isNaN(previous.getTime())) {
    next.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
  } else {
    next.setHours(23, 59, 0, 0);
  }
  return next.toISOString();
}

export type QuickWhen = 'today' | 'tomorrow' | 'next-week';

export function quickWhen(kind: QuickWhen, keepTimeFrom?: string | null, now: Date = new Date()): string {
  const day = startOfDay(now);
  if (kind === 'tomorrow') day.setDate(day.getDate() + 1);
  if (kind === 'next-week') {
    // Next Monday, like Things' "Next Week".
    const offset = ((8 - day.getDay()) % 7) || 7;
    day.setDate(day.getDate() + offset);
  }
  return atDay(day, keepTimeFrom);
}

const shortDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** "Today" / "Tomorrow" / "Tue, 2 Apr", plus a Things-style "5 days left" hint. */
export function describeWhen(iso: string | null | undefined): {
  label: string;
  hint: string;
  isToday: boolean;
  overdue: boolean;
} | null {
  const days = daysFromToday(iso);
  if (days == null || !iso) return null;
  const label = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : shortDate.format(new Date(iso));
  let hint = '';
  if (days > 1) hint = `${days} days left`;
  else if (days === -1) hint = '1 day ago';
  else if (days < -1) hint = `${-days} days ago`;
  return { label, hint, isToday: days === 0, overdue: days < 0 };
}
