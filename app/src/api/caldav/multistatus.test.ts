import { expect, test } from 'bun:test';

import { bucketOf } from '@/features/tasks/task-buckets';
import { parseCalendarList } from './multistatus';
import { parseVtodo, serializeVtodo, updateVtodo } from './vtodo';

test('CalDAV identifies calendars by namespace and reads successful properties', () => {
  const calendars = parseCalendarList(`
    <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
      <d:response>
        <d:href>/tasks/</d:href>
        <d:propstat>
          <d:prop><d:displayname>Ignored</d:displayname></d:prop>
          <d:status>HTTP/1.1 404 Not Found</d:status>
        </d:propstat>
        <d:propstat>
          <d:prop>
            <d:displayname>Tasks &amp; notes</d:displayname>
            <d:resourcetype><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></d:resourcetype>
            <c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>
          </d:prop>
          <d:status>HTTP/1.1 200 OK</d:status>
        </d:propstat>
      </d:response>
    </d:multistatus>`);
  expect(calendars).toEqual([{
    id: 'tasks',
    href: '/tasks/',
    name: 'Tasks & notes',
    is_deck: false,
    supported_components: ['VTODO'],
  }]);
});

test('an all-day due date round-trips as a calendar day', () => {
  const list = { id: 'tasks', name: 'Tasks', href: '/tasks/', is_deck: false };
  const { calendarData } = serializeVtodo({
    list_id: list.id,
    uid: 'example',
    title: 'All day',
    due_at: '2026-11-25',
  });
  const moved = updateVtodo(calendarData, { due_at: '2026-11-26' });
  const parsed = parseVtodo(moved, '/tasks/example.ics', null, list);
  expect(calendarData).toContain('DUE;VALUE=DATE:20261125');
  expect(parsed?.due_at).toBe('2026-11-26');
  expect(bucketOf({ due_at: parsed?.due_at ?? null }, new Date(2026, 10, 26, 9))).toBe('today');
});
