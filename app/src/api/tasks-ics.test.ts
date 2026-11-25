import { expect, test } from 'bun:test';
import { parseVtodo, serializeVtodo, updateVtodo } from '@/api/caldav/vtodo';
const list = { id: 'a:l', href: 'https://x/l/', name: 'L', is_deck: false };
test('pinned and repeat survive a CalDAV round trip', () => {
  const { calendarData } = serializeVtodo({ list_id: 'a:l', title: 'T', pinned: true, rrule: 'FREQ=WEEKLY;BYDAY=MO', due_at: '2026-07-20T09:00:00.000Z' });
  const t = parseVtodo(calendarData, 'https://x/l/1.ics', null, list)!;
  expect(t.pinned).toBe(true); expect(t.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
  const next = updateVtodo(calendarData, { pinned: false, due_at: '2026-07-27T09:00:00.000Z' });
  const u = parseVtodo(next, 'https://x/l/1.ics', null, list)!;
  expect(u.pinned).toBe(false); expect(next).toContain('DTSTART:20260727T090000Z');
  const cleared = updateVtodo(next, { rrule: null });
  expect(parseVtodo(cleared, 'h', null, list)!.rrule).toBeNull();
});

test('VTIMEZONE rules are never read or rewritten as the task repeat', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'BEGIN:STANDARD',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VTODO',
    'UID:tz1',
    'SUMMARY:Pay rent',
    'DUE;TZID=Europe/Berlin:20260720T090000',
    'END:VTODO',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  expect(parseVtodo(ics, 'h', null, list)!.rrule).toBeNull();
  const repeated = updateVtodo(ics, { rrule: 'FREQ=MONTHLY', due_at: '2026-08-20T07:00:00.000Z' });
  expect(repeated).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nEND:STANDARD');
  expect(repeated).toContain('DTSTART:19701025T030000');
  const todo = repeated.slice(repeated.indexOf('BEGIN:VTODO'));
  expect(todo).toContain('RRULE:FREQ=MONTHLY');
  expect(todo).toContain('DTSTART:20260820T070000Z');
  expect(parseVtodo(repeated, 'h', null, list)!.rrule).toBe('FREQ=MONTHLY');
});

test('a time block round-trips as DTSTART and DUE', () => {
  const { calendarData } = serializeVtodo({
    list_id: 'a:l',
    title: 'Design meeting',
    start_at: '2026-07-20T14:00:00.000Z',
    due_at: '2026-07-20T15:30:00.000Z',
  });
  expect(calendarData).toContain('DTSTART:20260720T140000Z');
  const t = parseVtodo(calendarData, 'h', null, list)!;
  expect(t.start_at).toBe('2026-07-20T14:00:00.000Z');
  expect(t.due_at).toBe('2026-07-20T15:30:00.000Z');

  // Moving only the due date keeps the start where it was.
  const moved = updateVtodo(calendarData, { due_at: '2026-07-20T16:00:00.000Z' });
  expect(parseVtodo(moved, 'h', null, list)!.start_at).toBe('2026-07-20T14:00:00.000Z');

  // Clearing the start drops DTSTART from a one-off to-do.
  const cleared = updateVtodo(moved, { start_at: null });
  expect(cleared).not.toContain('DTSTART');
  expect(parseVtodo(cleared, 'h', null, list)!.start_at).toBeNull();
});

test('a repeat anchor equal to DUE is not a time block', () => {
  const { calendarData } = serializeVtodo({ list_id: 'a:l', title: 'T', rrule: 'FREQ=DAILY', due_at: '2026-07-20T09:00:00.000Z' });
  expect(parseVtodo(calendarData, 'h', null, list)!.start_at).toBeNull();
  // Giving the repeat a block moves DTSTART to the block's start.
  const blocked = updateVtodo(calendarData, { start_at: '2026-07-20T08:00:00.000Z' });
  expect(parseVtodo(blocked, 'h', null, list)!.start_at).toBe('2026-07-20T08:00:00.000Z');
  // Removing the block puts the anchor back on the due date.
  const unblocked = updateVtodo(blocked, { start_at: null });
  expect(unblocked).toContain('DTSTART:20260720T090000Z');
  expect(parseVtodo(unblocked, 'h', null, list)!.start_at).toBeNull();
});


test('folds long UTF-8 properties on create and update', () => {
  const title = '🚀'.repeat(32);
  const notes = 'Literal END:VTODO in notes';
  const { calendarData } = serializeVtodo({ list_id: 'a:l', title, markdown: notes });
  const changed = updateVtodo(calendarData, { title: title + ' updated', reminder_at: '2026-07-20T09:00:00Z' });
  for (const content of [calendarData, changed]) {
    expect(content.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(parseVtodo(content, 'h', null, list)?.markdown).toBe(notes);
  }
  expect(parseVtodo(changed, 'h', null, list)?.title).toBe(title + ' updated');
});
