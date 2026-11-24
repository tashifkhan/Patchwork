import { firstDue, shorthandToRrule } from '@/lib/recurrence';
import { normalizeTags } from '@/lib/tags';
import { atDay } from '@/lib/when';

/**
 * Shorthand typed straight into a new to-do's title:
 *
 * - `/Groceries` on its own makes a list called Groceries
 * - `!1d`, `!2w`, `!m15`, `!wmo`, `!y12-25` set a repeat (see `shorthandToRrule`)
 * - `@1800` or `@0630p` sets the due time, today or tomorrow if it has passed
 * - `#errand` adds a tag
 *
 * Tokens count only when they stand alone, so "email bob@1800.com" stays a title.
 */
export type QuickAdd =
  | { kind: 'list'; name: string }
  | {
      kind: 'task';
      title: string;
      rrule: string | null;
      due_at: string | null;
      tags: string[];
    };

const TIME = /^@(\d{2})(\d{2})([ap])?$/i;
const REPEAT = /^!(\S+)$/;
const TAG = /^#([^\s#]+)$/;

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAdd {
  const text = input.trim();
  if (text.startsWith('/') && text.length > 1 && !text.includes('\n')) {
    const name = text.slice(1).trim();
    if (name) return { kind: 'list', name };
  }

  let rrule: string | null = null;
  let time: { hours: number; minutes: number } | null = null;
  const tags: string[] = [];
  const kept: string[] = [];

  for (const word of text.split(/\s+/)) {
    const repeat = rrule == null ? word.match(REPEAT) : null;
    const asRule = repeat ? shorthandToRrule(repeat[1]) : null;
    if (asRule) {
      rrule = asRule;
      continue;
    }
    const clock = time == null ? parseTime(word) : null;
    if (clock) {
      time = clock;
      continue;
    }
    const tag = word.match(TAG);
    if (tag) {
      tags.push(tag[1]);
      continue;
    }
    kept.push(word);
  }

  const title = kept.join(' ').trim();
  // A title made only of tokens isn't a to-do. Keep what was typed.
  if (!title) return { kind: 'task', title: text, rrule: null, due_at: null, tags: [] };

  let due: string | null = rrule ? firstDue(rrule, now) : null;
  if (time) {
    const day = due ? new Date(due) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    day.setHours(time.hours, time.minutes, 0, 0);
    // "@0900" typed at 10am means tomorrow, unless a repeat already picked the day.
    if (!rrule && day.getTime() <= now.getTime()) day.setDate(day.getDate() + 1);
    due = day.toISOString();
  } else if (due) {
    due = atDay(new Date(due));
  }

  return { kind: 'task', title, rrule, due_at: due, tags: normalizeTags(tags) };
}

function parseTime(word: string) {
  const m = word.match(TIME);
  if (!m) return null;
  let hours = Number.parseInt(m[1], 10);
  const minutes = Number.parseInt(m[2], 10);
  const suffix = m[3]?.toLowerCase();
  if (minutes > 59) return null;
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    if (suffix === 'p' && hours !== 12) hours += 12;
    if (suffix === 'a' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return { hours, minutes };
}

/** True when the title holds shorthand worth hinting about while typing. */
export function hasQuickAddTokens(input: string) {
  const parsed = parseQuickAdd(input);
  return parsed.kind === 'list' || parsed.rrule != null || parsed.due_at != null || parsed.tags.length > 0;
}
