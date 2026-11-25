import type { Task, TaskCreate, TaskList, TaskUpdate } from '@/api/types';
import { normalizeTags } from '@/features/tasks/tags';
import { isDateOnly, parseDate } from '@/lib/format';
import { randomUuid } from '@/lib/uuid';
import { addAttachment, attachmentAsLink, parseAttachments } from './ics-attachments';
import { foldIcs } from './ics-fold';

export function parseVtodo(calendarData: string, href: string, etag: string | null, list: TaskList): Task | null {
  // Read task fields from the VTODO with its VALARM sub-components removed:
  // an alarm carries its own DESCRIPTION, and a VTODO that lists the alarm
  // first would otherwise surface the reminder text as the task's notes.
  // VTIMEZONE goes too: its STANDARD/DAYLIGHT parts carry their own RRULE and DTSTART.
  const fields = parseIcs(calendarData.replace(SUBCOMPONENT_BLOCK, ''));
  if (!fields.get('BEGIN')?.some((field) => field.value.toUpperCase() === 'VTODO')) return null;
  const alarmFields = parseIcs(calendarData);
  const description = icsText(fields, 'DESCRIPTION') ?? '';
  const uid = icsText(fields, 'UID') ?? href.split('/').pop()?.replace(/\.ics$/, '') ?? href;
  const status = icsRaw(fields, 'STATUS')?.toUpperCase() ?? '';
  const dueAt = parseIcsDate(icsField(fields, 'DUE'));
  const startsAt = parseIcsDate(icsField(fields, 'DTSTART'));
  const reminderAt = parseIcsTrigger(
    icsField(alarmFields, 'TRIGGER'),
    startsAt,
    dueAt
  );

  return {
    id: href,
    uid,
    list_id: list.id,
    list_name: list.name,
    account_id: list.account_id,
    account_name: list.account_name,
    title: icsText(fields, 'SUMMARY') ?? 'Untitled task',
    description,
    markdown: description,
    completed: status === 'COMPLETED',
    priority: parseOptionalInt(icsRaw(fields, 'PRIORITY')),
    due_at: dueAt,
    // A DTSTART equal to DUE only anchors a repeat; it isn't a time block.
    start_at: startsAt && startsAt !== dueAt ? startsAt : null,
    reminder_at: reminderAt,
    tags: icsTextList(fields, 'CATEGORIES'),
    sort_order: parseOptionalInt(icsRaw(fields, 'X-APPLE-SORT-ORDER')),
    pinned: /^(TRUE|1)$/i.test(icsRaw(fields, 'X-PATCHWORK-PINNED') ?? ''),
    rrule: icsRaw(fields, 'RRULE')?.trim() || null,
    parent_uid: icsText(fields, 'RELATED-TO') ?? null,
    children: [],
    etag,
    updated_at: parseIcsDate(icsField(fields, 'LAST-MODIFIED')),
    attachments: parseAttachments(calendarData),
  };
}

export function serializeVtodo(task: TaskCreate) {
  const uid = task.uid ?? randomUuid();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Patchwork//Expo//EN',
    'BEGIN:VTODO',
    `UID:${escapeIcs(uid)}`,
    `SUMMARY:${escapeIcs(task.title)}`,
    `DESCRIPTION:${escapeIcs(task.markdown ?? '')}`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    task.completed ? 'STATUS:COMPLETED' : 'STATUS:NEEDS-ACTION',
  ];
  if (task.completed) lines.push(`COMPLETED:${formatIcsDate(new Date().toISOString())}`);
  if (task.priority != null) lines.push(`PRIORITY:${task.priority}`);
  if (task.sort_order != null) lines.push(`X-APPLE-SORT-ORDER:${task.sort_order}`);
  if (task.due_at) lines.push(serializeTaskDate('DUE', task.due_at));
  if (task.pinned) lines.push('X-PATCHWORK-PINNED:TRUE');
  // DTSTART is the start of the time block, or for a repeat with no block,
  // the due date: RFC 5545 counts a series from DTSTART.
  const start = task.start_at ?? (task.rrule ? task.due_at : null);
  if (start) lines.push(serializeTaskDate('DTSTART', start));
  if (task.rrule) lines.push(`RRULE:${sanitizeRrule(task.rrule)}`);
  const tags = normalizeTags(task.tags ?? []);
  if (tags.length) lines.push(`CATEGORIES:${serializeIcsList(tags)}`);
  if (task.parent_uid) lines.push(`RELATED-TO:${escapeIcs(task.parent_uid)}`);
  if (task.reminder_at) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeIcs(task.title)}`, `TRIGGER:${formatIcsDate(task.reminder_at)}`, 'END:VALARM');
  }
  lines.push('END:VTODO', 'END:VCALENDAR', '');
  let calendarData = foldIcs(lines.join('\r\n'));
  for (const attachment of task.attachments ?? []) calendarData = addAttachment(calendarData, attachmentAsLink(attachment));
  return { uid, calendarData };
}

export function updateVtodo(calendarData: string, patch: TaskUpdate) {
  // VALARM carries its own DESCRIPTION, so field edits run against a copy with
  // the alarm blocks masked out — otherwise `setIcsField` can rewrite the
  // alarm's text instead of the task's notes on VTODOs written by other
  // clients (which are free to put VALARM before DESCRIPTION).
  let next = editVtodoBody(calendarData, (body) => {
    let draft = body;
    // The block start as it stands, read before the due date moves.
    const before = parseIcs(body.replace(SUBCOMPONENT_BLOCK, ''));
    const startNow = parseIcsDate(icsField(before, 'DTSTART'));
    const currentBlockStart = startNow && startNow !== parseIcsDate(icsField(before, 'DUE')) ? startNow : null;
    if (patch.title !== undefined) draft = setIcsField(draft, 'SUMMARY', patch.title);
    if (patch.markdown !== undefined) draft = setIcsField(draft, 'DESCRIPTION', patch.markdown);
    if (patch.completed !== undefined) {
      draft = setIcsField(draft, 'STATUS', patch.completed ? 'COMPLETED' : 'NEEDS-ACTION');
      draft = setIcsField(
        draft,
        'COMPLETED',
        patch.completed ? formatIcsDate(new Date().toISOString()) : null,
        false
      );
    }
    if (patch.priority !== undefined) draft = setIcsField(draft, 'PRIORITY', patch.priority == null ? null : String(patch.priority));
    if (patch.sort_order !== undefined) draft = setIcsField(draft, 'X-APPLE-SORT-ORDER', patch.sort_order == null ? null : String(patch.sort_order), false);
    if (patch.due_at !== undefined) draft = setTaskDate(draft, 'DUE', patch.due_at);
    if (patch.tags !== undefined) {
      const tags = normalizeTags(patch.tags);
      // Escape per tag, never over the joined string: escaping afterwards would
      // also escape the separators and collapse every tag into a single one.
      draft = setIcsField(draft, 'CATEGORIES', tags.length ? serializeIcsList(tags) : null, false);
    }
    if (patch.parent_uid !== undefined) draft = setIcsField(draft, 'RELATED-TO', patch.parent_uid);
    if (patch.pinned !== undefined) draft = setIcsField(draft, 'X-PATCHWORK-PINNED', patch.pinned ? 'TRUE' : null, false);
    if (patch.rrule !== undefined) {
      draft = setIcsField(draft, 'RRULE', patch.rrule ? sanitizeRrule(patch.rrule) : null, false);
    }
    // DTSTART is the start of the time block. Without one, a repeat keeps it
    // on the due date (RFC 5545 counts a series from DTSTART) so other clients
    // agree on which day the series falls after we move it forward.
    if (patch.start_at !== undefined || patch.due_at !== undefined || patch.rrule !== undefined) {
      const start = patch.start_at !== undefined ? patch.start_at : (currentBlockStart ?? null);
      const due = patch.due_at !== undefined ? patch.due_at : parseIcsDate(icsField(parseIcs(draft), 'DUE'));
      if (start) {
        draft = setTaskDate(draft, 'DTSTART', start);
      } else if (/^RRULE[:;]/im.test(draft)) {
        draft = setTaskDate(draft, 'DTSTART', due);
      } else if (patch.start_at !== undefined || patch.rrule !== undefined) {
        draft = setIcsField(draft, 'DTSTART', null, false);
      }
    }
    return setIcsField(draft, 'LAST-MODIFIED', formatIcsDate(new Date().toISOString()), false);
  });
  if (patch.reminder_at !== undefined) next = setVAlarm(next, patch.reminder_at, patch.title);
  // setIcsField writes each value on one line; long notes and URLs need folding.
  return foldIcs(next);
}

const ALARM_SLOT = 'X-PATCHWORK-VALARM-SLOT';
/**
 * Sub-components whose properties must never be mistaken for the VTODO's own:
 * VALARM has a DESCRIPTION, VTIMEZONE has RRULE and DTSTART.
 */
const SUBCOMPONENT_BLOCK = /BEGIN:(VALARM|VTIMEZONE)\r?\n[\s\S]*?END:\1/gi;

/** Runs `edit` over the VTODO with VALARM sub-components swapped for placeholders. */
function editVtodoBody(calendarData: string, edit: (body: string) => string) {
  const alarms: string[] = [];
  const masked = calendarData.replace(SUBCOMPONENT_BLOCK, (match) => {
    alarms.push(match);
    return `${ALARM_SLOT}:${alarms.length - 1}`;
  });
  return edit(masked).replace(
    new RegExp(`^${ALARM_SLOT}:(\\d+)\r?$`, 'gm'),
    (_match, index: string) => alarms[Number(index)] ?? ''
  );
}

function setVAlarm(calendarData: string, reminderAt: string | null, title?: string) {
  const withoutAlarm = calendarData
    .replace(/BEGIN:VALARM\r?\n[\s\S]*?END:VALARM\r?\n?/gi, '')
    .replace(/\r?\nEND:VTODO/i, '\r\nEND:VTODO');
  if (!reminderAt) return withoutAlarm;

  const summary = title ?? icsText(parseIcs(withoutAlarm), 'SUMMARY') ?? 'Task';
  const alarm = [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(summary)}`,
    `TRIGGER:${formatIcsDate(reminderAt)}`,
    'END:VALARM',
  ].join('\r\n');
  return withoutAlarm.replace(/^END:VTODO(?=\r?$)/im, (end) => `${alarm}\r\n${end}`);
}

/**
 * Writes a single occurrence of `name`, replacing *every* existing one.
 *
 * Repeating a property is legal ICS and other clients do it (notably
 * `CATEGORIES`). Rewriting only the first occurrence used to leave the rest
 * behind, so a tag the user removed reappeared on the next sync.
 */
function setIcsField(calendarData: string, name: string, value: string | null, escape = true, params = '') {
  const line = value == null || value === '' ? null : `${name}:${escape ? escapeIcs(value) : value}`;
  const regex = new RegExp(
    `^${name}(?:;[^:]*)?:.*(?:\\r?\\n[ \\t].*)*(?:\\r?\\n|$)`,
    'gim'
  );
  let found = false;
  let written = false;
  const next = calendarData.replace(regex, () => {
    found = true;
    if (line == null || written) return '';
    written = true;
    return `${line}\r\n`;
  });
  if (found) return next;
  if (!line) return calendarData;
  return calendarData.replace(/^END:VTODO(?=\r?$)/im, (end) => `${line}\r\n${end}`);
}

interface IcsField {
  /** Raw, still-escaped value after the first colon. */
  value: string;
  /** Uppercase parameter names, with surrounding quotes removed. */
  params: Record<string, string>;
}

/** Raw (still-escaped) properties, keyed by name. Use the typed readers below. */
function parseIcs(calendarData: string) {
  const fields = new Map<string, IcsField[]>();
  const unfolded = calendarData.replace(/\r?\n[ \t]/g, '');
  for (const rawLine of unfolded.split(/\r?\n/)) {
    const separator = rawLine.indexOf(':');
    if (separator < 0) continue;
    const property = rawLine.slice(0, separator).split(';');
    const name = property.shift()?.toUpperCase();
    if (!name) continue;
    const params: Record<string, string> = {};
    for (const parameter of property) {
      const equals = parameter.indexOf('=');
      if (equals < 1) continue;
      const key = parameter.slice(0, equals).toUpperCase();
      const value = parameter.slice(equals + 1).replace(/^"|"$/g, '');
      params[key] = value;
    }
    const field = { value: rawLine.slice(separator + 1), params };
    fields.set(name, [...(fields.get(name) ?? []), field]);
  }
  return fields;
}

function icsField(fields: Map<string, IcsField[]>, name: string) {
  return fields.get(name)?.[0];
}

function icsRaw(fields: Map<string, IcsField[]>, name: string) {
  return icsField(fields, name)?.value;
}

function icsText(fields: Map<string, IcsField[]>, name: string) {
  const raw = icsRaw(fields, name);
  return raw == null ? undefined : unescapeIcs(raw);
}

/**
 * Reads a comma-separated TEXT list (e.g. `CATEGORIES`). Splits on *unescaped*
 * commas before unescaping, so `a\,b,c` is `['a,b', 'c']` rather than three
 * entries — unescaping first makes real separators and escaped commas
 * indistinguishable.
 */
function icsTextList(fields: Map<string, IcsField[]>, name: string) {
  const values = (fields.get(name) ?? [])
    .flatMap((field) => splitIcsList(field.value))
    .map((part) => unescapeIcs(part));
  return normalizeTags(values);
}

function splitIcsList(value: string) {
  const parts: string[] = [];
  let current = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '\\' && index + 1 < value.length) {
      current += char + value[index + 1];
      index += 1;
      continue;
    }
    if (char === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

/** Escapes each entry, then joins — the separators must stay unescaped. */
function serializeIcsList(values: readonly string[]) {
  return values.map(escapeIcs).join(',');
}

function parseOptionalInt(value: string | undefined) {
  if (value == null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseIcsDate(field: IcsField | undefined) {
  const value = field?.value;
  if (!value) return null;
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`).toISOString();
  }
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    const parts = compact.slice(1).map(Number);
    const [year, month, day, hour, minute, second] = parts;
    const timeZone = normalizeIcsTimeZone(field.params.TZID);
    if (timeZone) {
      const zoned = localTimeInZoneToIso(
        { year, month, day, hour, minute, second },
        timeZone
      );
      if (zoned) return zoned;
    }
    // A floating iCalendar time belongs to the user's current local zone.
    return new Date(year, month - 1, day, hour, minute, second).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseIcsTrigger(
  field: IcsField | undefined,
  startsAt: string | null,
  dueAt: string | null
) {
  if (!field) return null;
  if (!/^[+-]?P/i.test(field.value)) return parseIcsDate(field);
  const offset = parseIcsDuration(field.value);
  if (offset == null) return null;
  const relatedToEnd = field.params.RELATED?.toUpperCase() === 'END';
  const base = relatedToEnd ? dueAt ?? startsAt : startsAt ?? dueAt;
  const date = parseDate(base);
  if (!date) return null;
  return new Date(date.getTime() + offset).toISOString();
}

function parseIcsDuration(value: string) {
  const match = value.match(
    /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i
  );
  if (!match) return null;
  const [, sign = '+', weeks = '0', days = '0', hours = '0', minutes = '0', seconds = '0'] =
    match;
  const milliseconds =
    (((Number(weeks) * 7 + Number(days)) * 24 + Number(hours)) * 60 + Number(minutes)) *
      60_000 +
    Number(seconds) * 1_000;
  return sign === '-' ? -milliseconds : milliseconds;
}

function normalizeIcsTimeZone(value: string | undefined) {
  if (!value) return null;
  // Some CalDAV servers prefix Olson identifiers with their tzfile namespace.
  const marker = '/Tzfile/';
  const markerIndex = value.toLowerCase().indexOf(marker.toLowerCase());
  return markerIndex >= 0 ? value.slice(markerIndex + marker.length) : value;
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localTimeInZoneToIso(parts: LocalDateParts, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const desired = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    let timestamp = desired;
    // Two passes handle zones whose UTC offset differs at the initial guess
    // because of daylight-saving transitions.
    for (let pass = 0; pass < 2; pass += 1) {
      const rendered = Object.fromEntries(
        formatter
          .formatToParts(new Date(timestamp))
          .filter((part) => part.type !== 'literal')
          .map((part) => [part.type, Number(part.value)])
      );
      const renderedAsUtc = Date.UTC(
        rendered.year,
        rendered.month - 1,
        rendered.day,
        rendered.hour,
        rendered.minute,
        rendered.second
      );
      timestamp += desired - renderedAsUtc;
    }
    return new Date(timestamp).toISOString();
  } catch {
    return null;
  }
}

function formatIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sanitizeRrule(value: string) {
  return value.replace(/^RRULE:/i, '').replace(/[^A-Za-z0-9=;,+\-]/g, '').toUpperCase();
}

function serializeTaskDate(name: 'DUE' | 'DTSTART', value: string) {
  return isDateOnly(value) ? `${name};VALUE=DATE:${value.replace(/-/g, '')}` : `${name}:${formatIcsDate(value)}`;
}

function setTaskDate(data: string, name: 'DUE' | 'DTSTART', value: string | null) {
  return isDateOnly(value)
    ? setIcsField(data, name, value.replace(/-/g, ''), false, ';VALUE=DATE')
    : setIcsField(data, name, value ? formatIcsDate(value) : null, false);
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function unescapeIcs(value: string) {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== '\\' || index + 1 >= value.length) {
      result += char;
      continue;
    }
    const escaped = value[index + 1];
    if (escaped === 'n' || escaped === 'N') result += '\n';
    else if (escaped === '\\' || escaped === ',' || escaped === ';') result += escaped;
    else result += `\\${escaped}`;
    index += 1;
  }
  return result;
}
