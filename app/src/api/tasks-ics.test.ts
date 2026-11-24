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
