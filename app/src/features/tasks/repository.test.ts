import { expect, mock, test } from 'bun:test';

import type { CalDavAccount } from '@/lib/credentials-types';

const account: CalDavAccount = {
  id: 'fixture',
  displayName: 'Test account',
  baseUrl: 'https://caldav.example.test',
  username: 'tester',
  appPassword: 'test-only',
  serverType: 'nextcloud',
};
const home = '/remote.php/dav/calendars/tester/';

function multistatus(body: string) {
  return new Response(
    `<multistatus xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${body}</multistatus>`,
    { status: 207 },
  );
}

function propResponse(href: string, properties: string) {
  return `<response><href>${href}</href><propstat><prop>${properties}</prop><status>HTTP/1.1 200 OK</status></propstat></response>`;
}

function calendar(id: string) {
  return propResponse(
    `${home}${id}/`,
    `<displayname>${id}</displayname><resourcetype><collection/><c:calendar/></resourcetype>`,
  );
}

function report(list: string, title: string) {
  const calendarData = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VTODO', 'UID:copied-uid',
    `SUMMARY:${title}`, 'DUE;VALUE=DATE:20261201', 'END:VTODO', 'END:VCALENDAR',
  ].join('\r\n');
  return multistatus(
    propResponse(`${home}${list}/copied-uid.ics`, `<getetag>"1"</getetag><c:calendar-data>${calendarData}</c:calendar-data>`),
  );
}

test('a partial CalDAV refresh retains failed lists and leaves reminders eligible for a later complete sync', async () => {
  const storage = new Map<string, string>();
  mock.module('@react-native-async-storage/async-storage', () => ({
    default: {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => { storage.set(key, value); },
    },
  }));
  const credentials = await import('@/lib/credentials');
  mock.module('@/lib/credentials', () => ({ ...credentials, getAccounts: async () => [account] }));
  mock.module('@/lib/apple-reminders', () => ({ getAppleTasks: async () => [] }));
  const { fetchTaskSnapshot } = await import('./repository');
  const realFetch = globalThis.fetch;
  let partial = false;
  globalThis.fetch = (async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (init?.method === 'PROPFIND' && path === home) return multistatus(calendar('work') + calendar('home'));
    if (init?.method === 'REPORT' && path === `${home}home/`) {
      return partial ? new Response('', { status: 503 }) : report('home', 'Cached home task');
    }
    if (init?.method === 'REPORT' && path === `${home}work/`) {
      return report('work', partial ? 'Updated work task' : 'Original work task');
    }
    throw new Error(`Unexpected CalDAV request: ${init?.method} ${path}`);
  }) as typeof fetch;
  try {
    const initial = await fetchTaskSnapshot();
    expect(initial.complete).toBe(true);
    expect(initial.tasks.map((task) => task.due_at)).toEqual(['2026-12-01', '2026-12-01']);

    partial = true;
    const snapshot = await fetchTaskSnapshot();
    expect(snapshot.complete).toBe(false);
    expect(snapshot.warnings).toHaveLength(1);
    expect(snapshot.tasks.map((task) => task.title)).toEqual(['Updated work task', 'Cached home task']);
  } finally {
    globalThis.fetch = realFetch;
  }
});
