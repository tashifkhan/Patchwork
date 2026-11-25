import { ApiError } from '@/api/error';
import type { Task, TaskList, TaskListCreate } from '@/api/types';
import { base64Encode } from '@/lib/base64';
import type { CalDavAccount } from '@/lib/credentials-types';
import { assertUrlSameOrigin, originOf } from '@/lib/secure-url';
import { CALDAV_NS, DAV_NS, parseCalendarList, parseTaskReport, readDavPrincipal, readDavHome } from './multistatus';

const REQUEST_TIMEOUT_MS = 30_000;

export class CalDavClient {
  readonly account: CalDavAccount;
  private baseUrl: string;
  private calendarHome: string | null;
  private username: string;
  private authHeader: string;

  constructor(account: CalDavAccount) {
    this.account = account;
    const inputUrl = account.baseUrl.replace(/\/+$/, '');
    this.calendarHome = account.calendarHome ?? calendarHomeFromUrl(inputUrl, account.username);
    // A discovered home may live on another host of the same service (iCloud).
    this.baseUrl = account.calendarHome
      ? originOf(account.calendarHome)
      : this.calendarHome
        ? originOf(inputUrl)
        : inputUrl;
    this.username = account.username;
    this.authHeader = `Basic ${base64Encode(`${account.username}:${account.appPassword}`)}`;
  }

  /** Origin (scheme://host[:port]) of this account, for routing tasks back to it. */
  get origin() {
    return originOf(this.baseUrl);
  }

  calendarHomeUrl() {
    if (this.calendarHome) return this.calendarHome;
    // Nextcloud and ownCloud share this path; it is the default for other DAV
    // flavors too. Servers with a different layout would need discovery.
    return `${this.baseUrl}/remote.php/dav/calendars/${encodeURIComponent(this.username)}/`;
  }

  absoluteUrl(href: string) {
    const resolved =
      href.startsWith('http://') || href.startsWith('https://')
        ? href
        : `${this.baseUrl}/${href.replace(/^\/+/, '')}`;
    // Never attach this account's Basic auth to an off-origin absolute href from CalDAV XML.
    try {
      return assertUrlSameOrigin(resolved, this.origin);
    } catch (error) {
      throw new ApiError(400, error instanceof Error ? error.message : 'Refusing off-origin CalDAV URL');
    }
  }

  async request(method: string, url: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    let safeUrl = url;
    try {
      safeUrl = assertUrlSameOrigin(url, this.origin);
    } catch (error) {
      throw new ApiError(400, error instanceof Error ? error.message : 'Refusing off-origin CalDAV URL');
    }

    // A stalled connection would otherwise hang a save forever instead of
    // failing over to the offline outbox.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(safeUrl, {
        ...options,
        signal: controller.signal,
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/xml,text/calendar,*/*',
          'OCS-APIRequest': 'true',
          'X-Requested-With': 'XMLHttpRequest',
          ...options.headers,
        },
      });
    } catch (error) {
      if (controller.signal.aborted) throw new ApiError(0, 'The server took too long to respond.');
      throw new ApiError(0, error instanceof Error && error.message ? error.message : 'Could not reach the server.');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const conflictMessage = response.status === 412
        ? 'This task changed on the server. Refresh it and apply your changes again.'
        : null;
      throw new ApiError(
        response.status,
        conflictMessage ?? (davErrorMessage(detail) || `CalDAV request failed with status ${response.status}`),
        detail
      );
    }
    return response;
  }

  async listTaskCalendars(): Promise<TaskList[]> {
    const response = await this.request('PROPFIND', this.calendarHomeUrl(), {
      body: `
        <d:propfind xmlns:d="${DAV_NS}" xmlns:cal="${CALDAV_NS}" xmlns:cs="http://calendarserver.org/ns/">
          <d:prop>
            <d:displayname />
            <d:resourcetype />
            <cal:supported-calendar-component-set />
            <cs:getctag />
          </d:prop>
        </d:propfind>
      `.trim(),
      headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
    });
    return parseCalendarList(await response.text())
      .filter((list) => !list.is_deck && (!list.supported_components?.length || list.supported_components.includes('VTODO')))
      .map((list) => ({
        ...list,
        // Namespace the id by account so lists never collide across servers.
        id: `${this.account.id}:${list.id}`,
        href: this.absoluteUrl(list.href),
        account_id: this.account.id,
        account_name: this.account.displayName,
      }));
  }

  async createTaskCalendar(payload: TaskListCreate): Promise<TaskList> {
    const slug = slugify(payload.name);
    const href = `${this.calendarHomeUrl()}${slug}/`;
    await this.request('MKCALENDAR', href, {
      body: `
        <cal:mkcalendar xmlns:d="${DAV_NS}" xmlns:cal="${CALDAV_NS}">
          <d:set>
            <d:prop>
              <d:displayname>${escapeXml(payload.name)}</d:displayname>
              <cal:supported-calendar-component-set>
                <cal:comp name="VTODO" />
              </cal:supported-calendar-component-set>
            </d:prop>
          </d:set>
        </cal:mkcalendar>
      `.trim(),
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
    return {
      id: `${this.account.id}:${slug}`,
      href: this.absoluteUrl(href),
      name: payload.name,
      is_deck: false,
      supported_components: ['VTODO'],
      account_id: this.account.id,
      account_name: this.account.displayName,
    };
  }

  async renameTaskCalendar(list: TaskList, name: string): Promise<TaskList> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new ApiError(400, 'List name cannot be empty.');
    }
    await this.request('PROPPATCH', this.absoluteUrl(collectionHref(list.href)), {
      body: `
        <d:propertyupdate xmlns:d="${DAV_NS}">
          <d:set>
            <d:prop>
              <d:displayname>${escapeXml(trimmed)}</d:displayname>
            </d:prop>
          </d:set>
        </d:propertyupdate>
      `.trim(),
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
    return { ...list, name: trimmed };
  }

  async deleteTaskCalendar(list: TaskList): Promise<void> {
    await this.request('DELETE', this.absoluteUrl(collectionHref(list.href)));
  }

  async listCalendarTasks(calendar: TaskList): Promise<Task[]> {
    const response = await this.request('REPORT', this.absoluteUrl(calendar.href), {
      body: `
        <cal:calendar-query xmlns:d="${DAV_NS}" xmlns:cal="${CALDAV_NS}">
          <d:prop>
            <d:getetag />
            <cal:calendar-data />
          </d:prop>
          <cal:filter>
            <cal:comp-filter name="VCALENDAR">
              <cal:comp-filter name="VTODO" />
            </cal:comp-filter>
          </cal:filter>
        </cal:calendar-query>
      `.trim(),
      headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
    });
    return parseTaskReport(await response.text(), calendar, (href) => this.absoluteUrl(href));
  }

  /** `.../remote.php/dav/`, keeping any subpath the server is installed under. */
  davRoot() {
    const source = this.calendarHome ?? `${this.baseUrl}/remote.php/dav/`;
    const marker = '/remote.php/dav/';
    const index = source.toLowerCase().indexOf(marker);
    return index >= 0 ? `${source.slice(0, index)}${marker}` : `${this.baseUrl}${marker}`;
  }

  serverRoot() {
    return this.davRoot().slice(0, -'remote.php/dav/'.length);
  }

  authorization() {
    return this.authHeader;
  }

  async fetchTaskByHref(href: string): Promise<{ calendarData: string; list: TaskList; etag: string | null }> {
    const lists = await this.listTaskCalendars();
    const list = lists.find((item) => href.startsWith(item.href) || href.startsWith(this.absoluteUrl(item.href)));
    if (!list) {
      throw new ApiError(404, 'Task list not found for task');
    }

    return this.fetchTaskInList(href, list);
  }

  async fetchTaskInList(href: string, list: TaskList) {
    const response = await this.request('GET', this.absoluteUrl(href));
    const calendarData = await response.text();
    if (!calendarData) {
      throw new ApiError(404, 'Task calendar data not found');
    }
    return { calendarData, list, etag: response.headers.get('etag') };
  }
}

function calendarHomeFromUrl(url: string, username: string): string | null {
  try {
    const parsed = new URL(url);
    const marker = '/remote.php/dav/calendars/';
    const path = parsed.pathname;
    const markerIndex = path.toLowerCase().indexOf(marker);
    if (markerIndex < 0) return null;

    const prefix = path.slice(0, markerIndex + marker.length);
    const accountSegment = path.slice(markerIndex + marker.length).split('/').filter(Boolean)[0]
      ?? encodeURIComponent(username);
    parsed.pathname = `${prefix}${accountSegment}/`;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function collectionHref(href: string) {
  return `${href.replace(/\/+$/, '')}/`;
}

function slugify(value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || `tasks-${Date.now()}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function davErrorMessage(value: string) {
  const message = value.match(/<[^>]*(?::)?message\b[^>]*>([\s\S]*?)<\/[^>]*(?::)?message>/i)?.[1];
  if (message) return decodeXml(message.trim());
  const exception = value.match(/<[^>]*(?::)?exception\b[^>]*>([\s\S]*?)<\/[^>]*(?::)?exception>/i)?.[1];
  return exception ? decodeXml(exception.trim()).split('\\').pop() : value.trim();
}


/**
 * Checks an account can list its task calendars, and returns it with the
 * calendar home filled in when the server needed discovery to find it.
 */
export async function validateCalDavAccount(account: CalDavAccount): Promise<CalDavAccount> {
  let resolved = account;
  const nextcloudPath = calendarHomeFromUrl(account.baseUrl.replace(/\/+$/, ''), account.username);
  const nextcloudLike = account.serverType === 'nextcloud' || account.serverType === 'owncloud';
  if (!nextcloudPath && !nextcloudLike) {
    const home = await discoverCalendarHome(account);
    if (home) resolved = { ...account, calendarHome: home };
  }
  const client = new CalDavClient(resolved);
  await client.listTaskCalendars();
  return resolved;
}

/** True when two hosts share their last two labels (p42-caldav.icloud.com and caldav.icloud.com). */
function sameSite(a: string, b: string) {
  const tail = (host: string) => new URL(host).hostname.toLowerCase().split('.').slice(-2).join('.');
  try {
    return tail(a) === tail(b);
  } catch {
    return false;
  }
}

/**
 * RFC 6764 / RFC 4791 discovery: ask the URL (then its `/.well-known/caldav`)
 * for the user's principal, then the principal for its calendar home. Only
 * follows answers on the same site, so a password is never sent to a host the
 * user didn't point at.
 */
async function discoverCalendarHome(account: CalDavAccount): Promise<string | null> {
  const base = account.baseUrl.replace(/\/+$/, '');
  const auth = `Basic ${base64Encode(`${account.username}:${account.appPassword}`)}`;
  const propfind = async (url: string, prop: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'PROPFIND',
        signal: controller.signal,
        headers: { Authorization: auth, Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
        body: `<d:propfind xmlns:d="${DAV_NS}" xmlns:cal="${CALDAV_NS}"><d:prop>${prop}</d:prop></d:propfind>`,
      });
      if (response.status === 401) throw new ApiError(401, 'The server turned down that username and password.');
      if (!response.ok) return null;
      return { xml: await response.text(), url: response.url || url };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  for (const start of [base, `${originOf(base)}/.well-known/caldav`]) {
    const found = await propfind(start, '<d:current-user-principal />');
    if (!found || !sameSite(found.url, base)) continue;
    const principalHref = readDavPrincipal(found.xml);
    if (!principalHref) continue;
    const principal = new URL(principalHref, found.url).toString();
    if (!sameSite(principal, base)) continue;
    const homeSet = await propfind(principal, '<cal:calendar-home-set />');
    const homeHref = homeSet ? readDavHome(homeSet.xml) : null;
    if (!homeHref) continue;
    const home = new URL(homeHref, homeSet!.url).toString();
    if (!sameSite(home, base)) continue;
    return home.endsWith('/') ? home : `${home}/`;
  }
  return null;
}
