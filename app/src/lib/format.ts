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
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? dateTimeFormat.format(date) : '';
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

  const overdue = date.getTime() < now.getTime();

  if (dayDiff === 0) return { label: `Today ${dateTimeFormat.format(date)}`.trim(), overdue };
  if (dayDiff === 1) return { label: 'Tomorrow', overdue };
  if (dayDiff === -1) return { label: 'Yesterday', overdue };
  return { label: dateFormat.format(date), overdue };
}
