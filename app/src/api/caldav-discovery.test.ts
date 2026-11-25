import { afterEach, expect, test } from 'bun:test';

import { validateCalDavAccount } from '@/api/tasks.native';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const multistatus = (inner: string) =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><d:response>${inner}</d:response></d:multistatus>`;

/** A fake server: answers by URL, records where credentials went. */
function serve(routes: Record<string, string>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const body = routes[url];
    if (body == null) return new Response('', { status: 404 });
    return new Response(body, { status: 207 });
  }) as typeof fetch;
  return calls;
}

const account = {
  id: 'icloud',
  displayName: 'iCloud',
  baseUrl: 'https://caldav.icloud.com',
  username: 'me@icloud.com',
  appPassword: 'abcd-efgh-ijkl-mnop',
  serverType: 'other' as const,
};

test('discovery follows iCloud to the per-user host and lists its task calendars', async () => {
  const calls = serve({
    'https://caldav.icloud.com': multistatus('<d:propstat><d:prop><d:current-user-principal><d:href>/1234/principal/</d:href></d:current-user-principal></d:prop></d:propstat>'),
    'https://caldav.icloud.com/1234/principal/': multistatus(
      '<d:propstat><d:prop><cal:calendar-home-set><d:href>https://p42-caldav.icloud.com:443/1234/calendars/</d:href></cal:calendar-home-set></d:prop></d:propstat>'
    ),
    'https://p42-caldav.icloud.com/1234/calendars/': multistatus(
      '<d:href>/1234/calendars/tasks/</d:href><d:propstat><d:prop><d:displayname>Tasks</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype><cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set></d:prop></d:propstat>'
    ),
  });
  const resolved = await validateCalDavAccount(account);
  expect(resolved.calendarHome).toBe('https://p42-caldav.icloud.com/1234/calendars/');
  expect(calls.every((url) => new URL(url).hostname.endsWith('icloud.com'))).toBe(true);
});

test('a calendar home on another site is ignored, so the password never goes there', async () => {
  const calls = serve({
    'https://dav.example.com': multistatus('<d:propstat><d:prop><d:current-user-principal><d:href>/u/me/</d:href></d:current-user-principal></d:prop></d:propstat>'),
    'https://dav.example.com/u/me/': multistatus(
      '<d:propstat><d:prop><cal:calendar-home-set><d:href>https://collector.evil.test/me/</d:href></cal:calendar-home-set></d:prop></d:propstat>'
    ),
  });
  await expect(validateCalDavAccount({ ...account, baseUrl: 'https://dav.example.com' })).rejects.toThrow();
  expect(calls.some((url) => url.includes('evil.test'))).toBe(false);
});
