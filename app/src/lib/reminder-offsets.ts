/**
 * Default reminders: minutes before a task's due time, one notification each.
 * A task with its own reminder time uses only that.
 */

/** Choices offered when adding a reminder, in minutes before the due time. */
export const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];

/** "At due time", "15 minutes before", "1 hour before", "2 days before", "1 week before". */
export function formatReminderOffset(minutes: number): string {
  if (minutes <= 0) return 'At due time';
  const [value, unit] =
    minutes % 10080 === 0
      ? [minutes / 10080, 'week']
      : minutes % 1440 === 0
        ? [minutes / 1440, 'day']
        : minutes % 60 === 0
          ? [minutes / 60, 'hour']
          : [minutes, 'minute'];
  return `${value} ${unit}${value === 1 ? '' : 's'} before`;
}

/** Short line for a notification body: "Due now", "Due in 15 minutes", "Due tomorrow"… */
export function reminderBody(minutes: number | null): string | undefined {
  if (minutes == null) return undefined;
  if (minutes <= 0) return 'Due now';
  if (minutes === 1440) return 'Due tomorrow';
  return `Due in ${formatReminderOffset(minutes).replace(/ before$/, '')}`;
}

export interface ReminderTime {
  date: Date;
  /** Minutes before due, or null for the task's own reminder time. */
  offset: number | null;
}

/**
 * When to notify for one task: its own reminder if it has one, else one per
 * default offset before the due time. Past times are dropped.
 */
export function reminderTimes(input: {
  reminderAt: Date | null;
  dueAt: Date | null;
  offsets: number[];
  now?: number;
}): ReminderTime[] {
  const now = input.now ?? Date.now();
  const times: ReminderTime[] = input.reminderAt
    ? [{ date: input.reminderAt, offset: null }]
    : input.dueAt
      ? [...new Set(input.offsets)].map((offset) => ({
          date: new Date(input.dueAt!.getTime() - Math.max(0, offset) * 60_000),
          offset,
        }))
      : [];
  return times.filter((time) => time.date.getTime() > now).sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Most reminders per task; past that the notification shade gets noisy. */
export const MAX_REMINDER_OFFSETS = 5;

/** Whole, non-negative, unique minutes, earliest reminder first. */
export function normalizeReminderOffsets(offsets: number[]): number[] {
  const clean = [...new Set(offsets.map((minutes) => Math.max(0, Math.round(minutes))).filter(Number.isFinite))];
  return clean.sort((a, b) => b - a).slice(0, MAX_REMINDER_OFFSETS);
}
