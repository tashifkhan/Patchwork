import { ApiError } from './client';
import type { Task, TaskCreate, TaskList, TaskListCreate, TaskUpdate } from './types';
import { getAccounts, type CalDavAccount } from '@/lib/credentials';

const DAV_NS = 'DAV:';
const CALDAV_NS = 'urn:ietf:params:xml:ns:caldav';

export async function fetchTaskLists() {
  const clients = await allClients();
  const perAccount = await Promise.all(
    clients.map((client) => client.listTaskCalendars().catch(() => [] as TaskList[]))
  );
  return perAccount.flat();
}

export async function fetchTasks() {
  const clients = await allClients();
  const perAccount = await Promise.all(
    clients.map(async (client) => {
      try {
        const lists = await client.listTaskCalendars();
        const tasks = (await Promise.all(lists.map((list) => client.listCalendarTasks(list)))).flat();
        // Build the parent/child tree per account so RELATED-TO uids never
        // collide across servers.
        return attachChildren(tasks);
      } catch {
        return [] as Task[];
      }
    })
  );
  return perAccount.flat();
}

export async function createTaskList(payload: TaskListCreate) {
  const client = (await allClients())[0];
  if (!client) throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  return client.createTaskCalendar(payload);
}

export async function createTask(payload: TaskCreate) {
  const { client, target } = await resolveListTarget(payload.list_id);

  const { uid, calendarData } = serializeVtodo(payload);
  const href = `${target.href.replace(/\/+$/, '')}/${uid}.ics`;
  const response = await client.request('PUT', client.absoluteUrl(href), {
    body: calendarData,
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
  const created = parseVtodo(calendarData, client.absoluteUrl(href), response.headers.get('etag'), target);

  if (!created) {
    throw new ApiError(500, 'Created task could not be parsed');
  }
  return created;
}

export async function updateTask(taskId: string, payload: TaskUpdate) {
  const client = await clientForTask(taskId);
  const existing = await client.fetchTaskByHref(taskId);
  const calendarData = updateVtodo(existing.calendarData, payload);
  const response = await client.request('PUT', client.absoluteUrl(taskId), {
    body: calendarData,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      ...(payload.etag ? { 'If-Match': payload.etag } : {}),
    },
  });
  const updated = parseVtodo(calendarData, client.absoluteUrl(taskId), response.headers.get('etag'), existing.list);
  if (!updated) {
    throw new ApiError(500, 'Updated task could not be parsed');
  }
  return updated;
}

export async function deleteTask(taskId: string) {
  const client = await clientForTask(taskId);
  await client.request('DELETE', client.absoluteUrl(taskId));
}

class CalDavClient {
  readonly account: CalDavAccount;
  private baseUrl: string;
  private calendarHome: string | null;
  private username: string;
  private authHeader: string;

  constructor(account: CalDavAccount) {
    this.account = account;
    const inputUrl = account.baseUrl.replace(/\/+$/, '');
    this.calendarHome = calendarHomeFromUrl(inputUrl, account.username);
    this.baseUrl = this.calendarHome ? originOf(inputUrl) : inputUrl;
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
    return href.startsWith('http://') || href.startsWith('https://')
      ? href
      : `${this.baseUrl}/${href.replace(/^\/+/, '')}`;
  }

  async request(method: string, url: string, options: RequestInit = {}) {
    const response = await fetch(url, {
      ...options,
      method,
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/xml,text/calendar,*/*',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ApiError(response.status, detail || `CalDAV request failed with status ${response.status}`, detail);
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
      .filter((list) => !list.is_deck && listSupportsTasks(list))
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

  async fetchTaskByHref(href: string): Promise<{ calendarData: string; list: TaskList }> {
    const lists = await this.listTaskCalendars();
    const list = lists.find((item) => href.startsWith(item.href) || href.startsWith(this.absoluteUrl(item.href)));
    if (!list) {
      throw new ApiError(404, 'Task list not found for task');
    }

    const response = await this.request('GET', this.absoluteUrl(href));
    const calendarData = await response.text();
    if (!calendarData) {
      throw new ApiError(404, 'Task calendar data not found');
    }
    return { calendarData, list };
  }
}

function originOf(url: string): string {
  return url.match(/^https?:\/\/[^/]+/i)?.[0]?.toLowerCase() ?? url.toLowerCase();
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

async function allClients(): Promise<CalDavClient[]> {
  const accounts = await getAccounts();
  if (accounts.length === 0) {
    throw new ApiError(503, 'No CalDAV accounts are configured on this device.');
  }
  return accounts.map((account) => new CalDavClient(account));
}

/** Locate the account+calendar that owns a namespaced list id and return its client. */
async function resolveListTarget(listId: string): Promise<{ client: CalDavClient; target: TaskList }> {
  const accountId = listId.split(':')[0];
  const accounts = await getAccounts();
  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) {
    throw new ApiError(404, 'Account for this task list was not found');
  }
  const client = new CalDavClient(account);
  const target = (await client.listTaskCalendars()).find((list) => list.id === listId);
  if (!target) {
    throw new ApiError(404, 'Task list not found');
  }
  return { client, target };
}

/** Pick the account client whose origin owns an absolute task URL. */
async function clientForTask(taskId: string): Promise<CalDavClient> {
  const clients = await allClients();
  const origin = originOf(taskId);
  const client = clients.find((candidate) => candidate.origin === origin) ?? clients[0];
  return client;
}

function parseCalendarList(xml: string): TaskList[] {
  return responseBlocks(xml).flatMap((block) => {
    const href = readTagText(block, 'href');
    const name = readTagText(block, 'displayname');
    if (!href || !name || !block.includes(':calendar')) return [];
    return [{
      id: href.replace(/\/+$/, '').split('/').pop() ?? href,
      href,
      name,
      is_deck: isDeckCalendar(name, href),
      supported_components: supportedCalendarComponents(block),
    }];
  });
}

function supportedCalendarComponents(xml: string) {
  return [...xml.matchAll(/<[^>]*(?::)?comp\b[^>]*\bname=["']([^"']+)["'][^>]*\/?\s*>/gi)]
    .map((match) => match[1]?.toUpperCase())
    .filter((name): name is string => Boolean(name));
}

function listSupportsTasks(list: TaskList & { supported_components?: string[] }) {
  return !list.supported_components?.length || list.supported_components.includes('VTODO');
}

function parseTaskReport(
  xml: string,
  calendar: TaskList,
  toAbsolute: (href: string) => string
): Task[] {
  return responseBlocks(xml).flatMap((block) => {
    const href = readTagText(block, 'href');
    const etag = readTagText(block, 'getetag');
    const calendarData = readTagText(block, 'calendar-data');
    if (!href || !calendarData) return [];
    const task = parseVtodo(calendarData, toAbsolute(href), etag, calendar);
    return task ? [task] : [];
  });
}

function responseBlocks(xml: string) {
  return [...xml.matchAll(/<[^>]*response\b[^>]*>([\s\S]*?)<\/[^>]*response>/gi)].map((match) => match[1] ?? '');
}

function readTagText(xml: string, localName: string) {
  const match = xml.match(new RegExp(`<[^>/]*(?::)?${escapeRegExp(localName)}\\b[^>]*>([\\s\\S]*?)<\\/[^>]*(?::)?${escapeRegExp(localName)}>`, 'i'));
  return match?.[1] ? decodeXml(match[1].trim()) : null;
}

function parseVtodo(calendarData: string, href: string, etag: string | null, list: TaskList): Task | null {
  const fields = parseIcs(calendarData);
  if (!fields.has('BEGIN') || !fields.get('BEGIN')?.includes('VTODO')) return null;
  const description = fields.get('DESCRIPTION')?.[0] ?? '';
  const uid = fields.get('UID')?.[0] ?? href.split('/').pop()?.replace(/\.ics$/, '') ?? href;
  const status = fields.get('STATUS')?.[0]?.toUpperCase() ?? '';

  return {
    id: href,
    uid,
    list_id: list.id,
    list_name: list.name,
    account_id: list.account_id,
    title: fields.get('SUMMARY')?.[0] ?? 'Untitled task',
    description,
    markdown: description,
    completed: status === 'COMPLETED',
    priority: parseOptionalInt(fields.get('PRIORITY')?.[0]),
    due_at: parseIcsDate(fields.get('DUE')?.[0]),
    reminder_at: parseIcsDate(fields.get('TRIGGER')?.[0]),
    tags: (fields.get('CATEGORIES') ?? []).flatMap((value) => value.split(',').map((tag) => tag.trim()).filter(Boolean)),
    sort_order: parseOptionalInt(fields.get('X-APPLE-SORT-ORDER')?.[0]),
    parent_uid: fields.get('RELATED-TO')?.[0] ?? null,
    children: [],
    etag,
    updated_at: parseIcsDate(fields.get('LAST-MODIFIED')?.[0]),
  };
}

function serializeVtodo(task: TaskCreate) {
  const uid = randomUuid();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CalDAV Todo//Expo//EN',
    'BEGIN:VTODO',
    `UID:${escapeIcs(uid)}`,
    `SUMMARY:${escapeIcs(task.title)}`,
    `DESCRIPTION:${escapeIcs(task.markdown ?? '')}`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    'STATUS:NEEDS-ACTION',
  ];
  if (task.priority != null) lines.push(`PRIORITY:${task.priority}`);
  if (task.sort_order != null) lines.push(`X-APPLE-SORT-ORDER:${task.sort_order}`);
  if (task.due_at) lines.push(`DUE:${formatIcsDate(task.due_at)}`);
  if (task.tags?.length) lines.push(`CATEGORIES:${task.tags.map(escapeIcs).join(',')}`);
  if (task.parent_uid) lines.push(`RELATED-TO:${escapeIcs(task.parent_uid)}`);
  if (task.reminder_at) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeIcs(task.title)}`, `TRIGGER:${formatIcsDate(task.reminder_at)}`, 'END:VALARM');
  }
  lines.push('END:VTODO', 'END:VCALENDAR', '');
  return { uid, calendarData: lines.join('\r\n') };
}

function updateVtodo(calendarData: string, patch: TaskUpdate) {
  let next = calendarData;
  if (patch.title !== undefined) next = setIcsField(next, 'SUMMARY', patch.title);
  if (patch.markdown !== undefined) next = setIcsField(next, 'DESCRIPTION', patch.markdown);
  if (patch.completed !== undefined) next = setIcsField(next, 'STATUS', patch.completed ? 'COMPLETED' : 'NEEDS-ACTION');
  if (patch.priority !== undefined) next = setIcsField(next, 'PRIORITY', patch.priority == null ? null : String(patch.priority));
  if (patch.sort_order !== undefined) next = setIcsField(next, 'X-APPLE-SORT-ORDER', patch.sort_order == null ? null : String(patch.sort_order), false);
  if (patch.due_at !== undefined) next = setIcsField(next, 'DUE', patch.due_at ? formatIcsDate(patch.due_at) : null, false);
  if (patch.tags !== undefined) next = setIcsField(next, 'CATEGORIES', patch.tags.length ? patch.tags.join(',') : null);
  if (patch.parent_uid !== undefined) next = setIcsField(next, 'RELATED-TO', patch.parent_uid);
  next = setIcsField(next, 'LAST-MODIFIED', formatIcsDate(new Date().toISOString()), false);
  return next;
}

function setIcsField(calendarData: string, name: string, value: string | null, escape = true) {
  const line = value == null || value === '' ? null : `${name}:${escape ? escapeIcs(value) : value}`;
  const regex = new RegExp(`^${name}(?:;[^:]*)?:.*(?:\\r?\\n[ \\t].*)*\\r?$`, 'im');
  if (regex.test(calendarData)) {
    return line ? calendarData.replace(regex, line) : calendarData.replace(regex, '').replace(/\r?\n\r?\n/g, '\r\n');
  }
  if (!line) return calendarData;
  return calendarData.replace(/END:VTODO/i, `${line}\r\nEND:VTODO`);
}

function parseIcs(calendarData: string) {
  const fields = new Map<string, string[]>();
  const unfolded = calendarData.replace(/\r?\n[ \t]/g, '');
  for (const rawLine of unfolded.split(/\r?\n/)) {
    const separator = rawLine.indexOf(':');
    if (separator < 0) continue;
    const name = rawLine.slice(0, separator).split(';')[0]?.toUpperCase();
    if (!name) continue;
    const value = unescapeIcs(rawLine.slice(separator + 1));
    fields.set(name, [...(fields.get(name) ?? []), value]);
  }
  return fields;
}

function attachChildren(tasks: Task[]) {
  const byUid = new Map(tasks.map((task) => [task.uid, { ...task, children: [] as Task[] }]));
  const roots: Task[] = [];
  for (const task of byUid.values()) {
    if (task.parent_uid && byUid.has(task.parent_uid)) {
      byUid.get(task.parent_uid)?.children.push(task);
    } else {
      roots.push(task);
    }
  }
  return roots;
}

function isDeckCalendar(name: string, href = '') {
  return name.trim().toLowerCase().startsWith('deck:') || href.toLowerCase().includes('/deck');
}

function parseOptionalInt(value: string | undefined) {
  if (value == null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseIcsDate(value: string | undefined) {
  if (!value) return null;
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`).toISOString();
  }
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function unescapeIcs(value: string) {
  return value.replace(/\\n/gi, '\n').replace(/\\([\\,;])/g, '$1');
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function randomUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function base64Encode(value: string) {
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(value)));
  }
  throw new ApiError(500, 'Base64 encoding is unavailable in this runtime.');
}
