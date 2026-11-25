// Date helpers shared across task and deck UIs. Inputs are ISO strings from the
// backend (may be null). Intl formatters are created once at module load.

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (isDateOnly(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isDateOnly(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? (isDateOnly(value) ? dateFormat : dateTimeFormat).format(date) : '';
}

export function formatRelativeDue(value: string | null | undefined): {
  label: string;
  overdue: boolean;
} {
  const date = parseDate(value);
  if (!date) return { label: '', overdue: false };

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((dueDay.getTime() - startOfDay.getTime()) / 86_400_000);

  const dateOnly = isDateOnly(value);
  const overdue = dateOnly ? dayDiff < 0 : date.getTime() < now.getTime();

  if (dayDiff === 0) return { label: dateOnly ? 'Today' : `Today ${dateTimeFormat.format(date)}`, overdue };
  if (dayDiff === 1) return { label: 'Tomorrow', overdue };
  if (dayDiff === -1) return { label: 'Yesterday', overdue };
  return { label: dateFormat.format(date), overdue };
}
