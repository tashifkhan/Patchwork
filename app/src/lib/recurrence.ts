/**
 * Repeating to-dos, stored as an iCalendar RRULE on the VTODO so Nextcloud
 * Tasks, tasks.org and Apple Reminders read the same rule.
 *
 * Only the subset people actually pick is understood: FREQ, INTERVAL, one
 * BYDAY for weekly rules, BYMONTHDAY, BYMONTH and UNTIL. Rules other clients
 * write that use more than that are kept on the task untouched; `nextDue`
 * just returns null for them and completing the to-do finishes it.
 */

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface Rule {
  freq: Frequency;
  interval: number;
  /** Weekly only: 0 = Sunday … 6 = Saturday. */
  weekday?: number;
  /** Monthly or yearly: day of the month, 1–31. */
  monthDay?: number;
  /** Yearly only: 1–12. */
  month?: number;
  /** Last allowed occurrence, ISO. */
  until?: string;
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const UNDERSTOOD = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'UNTIL', 'WKST']);

export function parseRrule(value: string | null | undefined): Rule | null {
  if (!value) return null;
  const parts = new Map<string, string>();
  for (const part of value.replace(/^RRULE:/i, '').split(';')) {
    const [key, raw] = part.split('=');
    if (key && raw) parts.set(key.trim().toUpperCase(), raw.trim().toUpperCase());
  }
  const freq = parts.get('FREQ');
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null;
  if ([...parts.keys()].some((key) => !UNDERSTOOD.has(key))) return null;

  const interval = Number.parseInt(parts.get('INTERVAL') ?? '1', 10);
  const rule: Rule = { freq, interval: Number.isFinite(interval) && interval > 0 ? interval : 1 };

  const byDay = parts.get('BYDAY');
  if (byDay) {
    // "MO" only. "MO,WE" or "1MO" (first Monday) are outside the subset.
    const index = WEEKDAY_CODES.indexOf(byDay as (typeof WEEKDAY_CODES)[number]);
    if (index < 0 || freq !== 'WEEKLY') return null;
    rule.weekday = index;
  }
  const monthDay = parts.get('BYMONTHDAY');
  if (monthDay) {
    const day = Number.parseInt(monthDay, 10);
    if (!(day >= 1 && day <= 31) || monthDay.includes(',')) return null;
    rule.monthDay = day;
  }
  const month = parts.get('BYMONTH');
  if (month) {
    const m = Number.parseInt(month, 10);
    if (!(m >= 1 && m <= 12) || month.includes(',')) return null;
    rule.month = m;
  }
  const until = parts.get('UNTIL');
  if (until) {
    const iso = parseUntil(until);
    if (!iso) return null;
    rule.until = iso;
  }
  return rule;
}

export function formatRrule(rule: Rule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.weekday != null) parts.push(`BYDAY=${WEEKDAY_CODES[rule.weekday]}`);
  if (rule.month != null) parts.push(`BYMONTH=${rule.month}`);
  if (rule.monthDay != null) parts.push(`BYMONTHDAY=${rule.monthDay}`);
  if (rule.until) parts.push(`UNTIL=${rule.until.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`);
  return parts.join(';');
}

/** "Every 3 days", "Every week on Monday". Null for rules outside the subset. */
export function describeRrule(value: string | null | undefined): string | null {
  const rule = parseRrule(value);
  if (!rule) return value ? 'Repeats' : null;
  const n = rule.interval;
  const every = (unit: string) => (n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`);
  switch (rule.freq) {
    case 'DAILY':
      return every('day');
    case 'WEEKLY':
      return rule.weekday != null ? `${every('week')} on ${WEEKDAY_NAMES[rule.weekday]}` : every('week');
    case 'MONTHLY':
      return rule.monthDay != null ? `${every('month')} on the ${ordinal(rule.monthDay)}` : every('month');
    case 'YEARLY':
      return rule.month != null && rule.monthDay != null
        ? `${every('year')} on ${MONTH_NAMES[rule.month - 1]} ${rule.monthDay}`
        : every('year');
  }
}

/**
 * The next due date after `fromIso`, keeping its time of day. Skips forward
 * past today, so finishing a daily to-do that is a week overdue lands on
 * tomorrow rather than six days ago. Null when the rule has ended or isn't
 * understood.
 */
export function nextDue(fromIso: string | null, value: string | null | undefined, now: Date = new Date()): string | null {
  const rule = parseRrule(value);
  if (!rule) return null;
  const from = fromIso ? new Date(fromIso) : now;
  if (Number.isNaN(from.getTime())) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let next = step(from, rule);
  // A bounded loop: a rule of "every day" from years ago still settles fast.
  for (let guard = 0; next.getTime() < startOfToday && guard < 5000; guard += 1) next = step(next, rule);
  if (next.getTime() < startOfToday) return null;
  if (rule.until && next.getTime() > new Date(rule.until).getTime()) return null;
  return next.toISOString();
}

function step(from: Date, rule: Rule): Date {
  const d = new Date(from.getTime());
  switch (rule.freq) {
    case 'DAILY':
      d.setDate(d.getDate() + rule.interval);
      return d;
    case 'WEEKLY': {
      if (rule.weekday == null) {
        d.setDate(d.getDate() + 7 * rule.interval);
        return d;
      }
      // Move to the rule's weekday. When already on it, jump whole weeks.
      const ahead = (rule.weekday - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + (ahead === 0 ? 7 * rule.interval : ahead));
      return d;
    }
    case 'MONTHLY':
      return addMonths(d, rule.interval, rule.monthDay);
    case 'YEARLY': {
      const next = addMonths(d, 12 * rule.interval, rule.monthDay);
      if (rule.month != null) {
        const day = rule.monthDay ?? next.getDate();
        next.setDate(1);
        next.setMonth(rule.month - 1);
        next.setDate(Math.min(day, daysInMonth(next.getFullYear(), rule.month - 1)));
      }
      return next;
    }
  }
}

/** Adds months and clamps the day, so Jan 31 + 1 month is Feb 28/29, not Mar 3. */
function addMonths(date: Date, months: number, preferredDay?: number): Date {
  const day = preferredDay ?? date.getDate();
  const d = new Date(date.getTime());
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return d;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function ordinal(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function parseUntil(value: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '23', mi = '59', s = '59', z] = m;
  const date = z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    : new Date(+y, +mo - 1, +d, +h, +mi, +s);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ── Presets offered in the editor ──────────────────────────────────────

export interface RepeatPreset {
  label: string;
  rrule: string | null;
}

/** The repeat menu. Weekly and monthly anchor to the due date's weekday or day. */
export function repeatPresets(due: string | null): RepeatPreset[] {
  const anchor = due ? new Date(due) : new Date();
  const weekday = anchor.getDay();
  const monthDay = anchor.getDate();
  return [
    { label: 'Every day', rrule: 'FREQ=DAILY' },
    { label: `Every week on ${WEEKDAY_NAMES[weekday]}`, rrule: formatRrule({ freq: 'WEEKLY', interval: 1, weekday }) },
    { label: 'Every 2 weeks', rrule: formatRrule({ freq: 'WEEKLY', interval: 2, weekday }) },
    { label: `Every month on the ${ordinal(monthDay)}`, rrule: formatRrule({ freq: 'MONTHLY', interval: 1, monthDay }) },
    {
      label: `Every year on ${MONTH_NAMES[anchor.getMonth()]} ${monthDay}`,
      rrule: formatRrule({ freq: 'YEARLY', interval: 1, month: anchor.getMonth() + 1, monthDay }),
    },
  ];
}

// ── Repeat shorthand ─────────────────────────────────────────────────────

const SHORTHAND = /^(?:(\d+)([dwmy])|m(\d{1,2})|w(mo|tu|we|th|fr|sa|su)|y(\d{2})-(\d{2}))$/i;

/**
 * Repeat tokens for quick add, without the leading `!`:
 * `3d` every 3 days, `2w` every 2 weeks, `1m` monthly, `1y` yearly,
 * `m15` monthly on the 15th, `wmo` weekly on Monday, `y12-25` every Dec 25.
 */
export function shorthandToRrule(token: string): string | null {
  const m = token.match(SHORTHAND);
  if (!m) return null;
  if (m[1]) {
    const interval = Number.parseInt(m[1], 10);
    if (!(interval >= 1 && interval <= 999)) return null;
    const freq = ({ d: 'DAILY', w: 'WEEKLY', m: 'MONTHLY', y: 'YEARLY' } as const)[m[2].toLowerCase() as 'd'];
    return formatRrule({ freq, interval });
  }
  if (m[3]) {
    const day = Number.parseInt(m[3], 10);
    return day >= 1 && day <= 31 ? formatRrule({ freq: 'MONTHLY', interval: 1, monthDay: day }) : null;
  }
  if (m[4]) {
    const weekday = WEEKDAY_CODES.indexOf(m[4].toUpperCase() as (typeof WEEKDAY_CODES)[number]);
    return formatRrule({ freq: 'WEEKLY', interval: 1, weekday });
  }
  const month = Number.parseInt(m[5], 10);
  const day = Number.parseInt(m[6], 10);
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
  return formatRrule({ freq: 'YEARLY', interval: 1, month, monthDay: day });
}

/**
 * The first due date for a new repeating to-do with no date of its own:
 * today for "every N", the next matching weekday or day of the month otherwise.
 */
export function firstDue(rrule: string, now: Date = new Date()): string | null {
  const rule = parseRrule(rrule);
  if (!rule) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (rule.freq === 'WEEKLY' && rule.weekday != null) {
    today.setDate(today.getDate() + ((rule.weekday - today.getDay() + 7) % 7));
  } else if (rule.freq === 'MONTHLY' && rule.monthDay != null) {
    if (today.getDate() > rule.monthDay) return addMonths(today, 1, rule.monthDay).toISOString();
    today.setDate(Math.min(rule.monthDay, daysInMonth(today.getFullYear(), today.getMonth())));
  } else if (rule.freq === 'YEARLY' && rule.month != null && rule.monthDay != null) {
    const thisYear = new Date(today.getFullYear(), rule.month - 1, rule.monthDay);
    if (thisYear.getTime() < today.getTime()) thisYear.setFullYear(thisYear.getFullYear() + 1);
    return thisYear.toISOString();
  }
  return today.toISOString();
}
