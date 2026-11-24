import { expect, test } from 'bun:test';
import { parseVtodo, serializeVtodo, updateVtodo } from '@/api/tasks.native';
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
