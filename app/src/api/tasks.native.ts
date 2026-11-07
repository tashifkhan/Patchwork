import { ApiError } from './client';
import type { Task, TaskCreate, TaskList, TaskListCreate, TaskListUpdate, TaskUpdate } from './types';
import { base64Encode } from '@/lib/base64';
import { isNetworkError, knownOffline } from '@/lib/connectivity';
import { getAccounts, type CalDavAccount } from '@/lib/credentials';
import {
  LOCAL_ACCOUNT_ID,
  cacheRemoteLists,
  cacheRemoteTasks,
  cachedRemoteLists,
  cachedRemoteTasks,
  createLocalList,
  createLocalTask,
  deleteLocalList,
  deleteLocalTask,
  ensureDefaultLocalList,
  findKnownList,
  getLocalLists,
  getLocalTask,
  getLocalTasks,
  isLocalListId,
  isLocalTaskId,
  renameLocalList,
  updateLocalTask,
} from '@/lib/local-tasks';
import {
  enqueue,
  getEntries,
  isPendingTaskId,
  pendingEntryId,
  pendingTask,
  removeEntry,
  updateEntry,
  type OutboxTaskEntry,
} from '@/lib/outbox';
import { assertUrlSameOrigin, originOf } from '@/lib/secure-url';
import { normalizeTags } from '@/lib/tags';
import { useSyncStatusStore } from '@/stores/sync-status-store';

const DAV_NS = 'DAV:';
const CALDAV_NS = 'urn:ietf:params:xml:ns:caldav';
const REQUEST_TIMEOUT_MS = 30_000;

export async function fetchTaskLists() {
  const accounts = await getAccounts();
  const clients = accounts.map((account) => new CalDavClient(account));
  const [results, localLists] = await Promise.all([
    Promise.allSettled(clients.map((client) => client.listTaskCalendars())),
    localListsToShow(accounts.length === 0),
  ]);
  const lists: TaskList[] = [];
  const warnings: string[] = [];
  let offline = false;
  for (const [index, result] of results.entries()) {
    const account = accounts[index];
    if (result.status === 'fulfilled') {
      lists.push(...result.value);
      void cacheRemoteLists(account.id, result.value).catch(() => {});
      continue;
    }
    const cached = isNetworkError(result.reason) ? await cachedRemoteLists(account.id) : null;
    if (cached) {
      offline = true;
      lists.push(...cached);
    } else {
      warnings.push(errorMessage(result.reason));
    }
  }
  if (offline) warnings.unshift(OFFLINE_WARNING);
  lists.push(...localLists);
  useSyncStatusStore.getState().setTaskSync(warnings);
  if (lists.length === 0) throw firstRejected(results) ?? new ApiError(404, 'No task lists found.');
  return lists;
}

export async function fetchTasks() {
  const accounts = await getAccounts();
  const clients = accounts.map((account) => new CalDavClient(account));
  const [results, localLists, localTasks, outbox] = await Promise.all([
    Promise.allSettled(
      clients.map(async (client) => {
        const lists = await client.listTaskCalendars();
        const listResults = await Promise.allSettled(
          lists.map((list) => client.listCalendarTasks(list))
        );
        const tasks = listResults.flatMap((result) =>
          result.status === 'fulfilled' ? result.value : []
        );
        if (tasks.length === 0 && listResults.some((result) => result.status === 'rejected')) {
          throw firstRejected(listResults) ?? new ApiError(502, 'Task lists could not be synchronized.');
        }
        return { tasks, warnings: rejectionMessages(listResults) };
      })
    ),
    localListsToShow(accounts.length === 0),
    getLocalTasks(),
    getEntries(),
  ]);

  // Tasks saved offline join their account's tree, so a pending checklist item
  // still sits under its parent.
  const pending = outbox.flatMap((entry) => (entry.kind === 'task' ? [pendingTask(entry)] : []));
  const pendingFor = (accountId: string | undefined) =>
    pending.filter((task) => task.account_id === accountId);

  const tasks: Task[] = [];
  const warnings: string[] = [];
  let offline = false;
  let failedWithoutCache = 0;
  for (const [index, result] of results.entries()) {
    const account = accounts[index];
    let flat: Task[];
    if (result.status === 'fulfilled') {
      flat = result.value.tasks;
      warnings.push(...result.value.warnings);
      void cacheRemoteTasks(account.id, flat).catch(() => {});
    } else {
      const cached = isNetworkError(result.reason) ? await cachedRemoteTasks(account.id) : null;
      if (cached) {
        offline = true;
        flat = cached;
      } else {
        failedWithoutCache += 1;
        warnings.push(errorMessage(result.reason));
        flat = [];
      }
    }
    // Build the parent/child tree per account so RELATED-TO uids never
    // collide across servers.
    tasks.push(...attachChildren([...flat, ...pendingFor(account.id)]));
  }
  const knownAccounts = new Set(accounts.map((account) => account.id));
  const orphans = pending.filter((task) => !task.account_id || !knownAccounts.has(task.account_id));
  tasks.push(...attachChildren(localTasks), ...attachChildren(orphans));

  if (offline) warnings.unshift(OFFLINE_WARNING);
  useSyncStatusStore.getState().setTaskSync(warnings);
  if (tasks.length === 0 && localLists.length === 0 && failedWithoutCache > 0) {
    throw firstRejected(results) ?? new ApiError(404, 'No tasks found.');
  }
  return tasks;
}

const OFFLINE_WARNING =
  "You're offline. Showing what was last synced. New to-dos are saved on this device and sent when you're back online.";

/** On-device lists, plus a starter list when there is no account to sync with. */
async function localListsToShow(noAccounts: boolean) {
  const lists = await getLocalLists();
  if (lists.length > 0 || !noAccounts) return lists;
  return ensureDefaultLocalList();
}

function firstRejected<T>(results: PromiseSettledResult<T>[]) {
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  return rejected?.reason instanceof Error ? rejected.reason : undefined;
}

function rejectionMessages<T>(results: PromiseSettledResult<T>[]) {
  return results.flatMap((result) => result.status === 'rejected' ? [errorMessage(result.reason)] : []);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'A sync source could not be loaded.';
}

export async function createTaskList(payload: TaskListCreate) {
  if (payload.account_id === LOCAL_ACCOUNT_ID) return createLocalList(payload.name);
  const accounts = await getAccounts();
  if (accounts.length === 0 && !payload.account_id) return createLocalList(payload.name);
  const clients = accounts.map((account) => new CalDavClient(account));
  const client = payload.account_id
    ? clients.find((candidate) => candidate.account.id === payload.account_id)
    : clients.length === 1
      ? clients[0]
      : null;
  if (!client) {
    throw new ApiError(
      400,
      clients.length > 1
        ? 'Choose which account should own this task list.'
        : 'No CalDAV accounts are configured on this device.'
    );
  }
  return client.createTaskCalendar(payload);
}

export async function updateTaskList(listId: string, payload: TaskListUpdate) {
  if (isLocalListId(listId)) return renameLocalList(listId, payload.name);
  const { client, target } = await resolveListTarget(listId);
  return client.renameTaskCalendar(target, payload.name);
}

export async function deleteTaskList(listId: string) {
  if (isLocalListId(listId)) return deleteLocalList(listId);
  const { client, target } = await resolveListTarget(listId);
  await client.deleteTaskCalendar(target);
}

/**
 * Create a to-do. On-device lists save straight to storage. For an account,
 * a failure caused by the connection (or a device already known to be
 * offline) saves it to the outbox instead, and it goes up once the app is
 * back online. The returned task is marked `pending_sync` in that case.
 */
export async function createTask(payload: TaskCreate): Promise<Task> {
  if (isLocalListId(payload.list_id)) return createLocalTask(payload);
  const withUid = { ...payload, uid: payload.uid ?? randomUuid() };
  if (knownOffline()) return queueTask(withUid);
  try {
    return await createRemoteTask(withUid);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    return queueTask(withUid);
  }
}

async function queueTask(payload: TaskCreate & { uid: string }) {
  const list = await findKnownList(payload.list_id);
  const entry = await enqueue({
    kind: 'task',
    payload,
    listName: list?.name ?? 'Tasks',
    accountId: list?.account_id ?? payload.list_id.split(':')[0],
    accountName: list?.account_name,
  });
  return pendingTask(entry as OutboxTaskEntry);
}

/** Upload one to-do to its CalDAV list, with no offline fallback. Used by the outbox. */
export async function createRemoteTask(payload: TaskCreate) {
  const { client, target } = await resolveListTarget(payload.list_id);

  const { uid, calendarData } = serializeVtodo(payload);
  const href = `${target.href.replace(/\/+$/, '')}/${uid}.ics`;
  const response = await client.request('PUT', client.absoluteUrl(href), {
    body: calendarData,
    // Refuse to clobber an existing resource if the generated UID ever collides.
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*' },
  });
  const created = parseVtodo(calendarData, client.absoluteUrl(href), response.headers.get('etag'), target);

  if (!created) {
    throw new ApiError(500, 'Created task could not be parsed');
  }
  return created;
}

export async function updateTask(taskId: string, payload: TaskUpdate, accountId?: string): Promise<Task> {
  if (isPendingTaskId(taskId)) return updatePendingTask(taskId, payload);
  if (isLocalTaskId(taskId)) {
    if (payload.list_id && !isLocalListId(payload.list_id)) return moveLocalTaskToAccount(taskId, payload);
    return updateLocalTask(taskId, payload);
  }
  const client = await clientForTask(taskId, accountId);
  const existing = await client.fetchTaskByHref(taskId);
  const calendarData = updateVtodo(existing.calendarData, payload);

  if (payload.list_id && isLocalListId(payload.list_id)) {
    // Account to device: keep the uid so subtasks stay attached.
    const parsed = parseVtodo(calendarData, client.absoluteUrl(taskId), null, existing.list);
    if (!parsed) throw new ApiError(500, 'Task could not be read');
    const moved = await createLocalTask({ ...taskToCreate(parsed), list_id: payload.list_id });
    try {
      await client.request('DELETE', client.absoluteUrl(taskId), {
        headers: payload.etag ? { 'If-Match': payload.etag } : undefined,
      });
    } catch (error) {
      await deleteLocalTask(moved.id);
      throw error;
    }
    return moved;
  }

  if (payload.list_id && payload.list_id !== existing.list.id) {
    const destination = await resolveListTarget(payload.list_id);
    const fileName = new URL(taskId).pathname.split('/').filter(Boolean).pop() ?? `${randomUuid()}.ics`;
    const destinationHref = `${destination.target.href.replace(/\/+$/, '')}/${fileName}`;
    const destinationUrl = destination.client.absoluteUrl(destinationHref);
    const copied = await destination.client.request('PUT', destinationUrl, {
      body: calendarData,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'If-None-Match': '*',
      },
    });

    try {
      await client.request('DELETE', client.absoluteUrl(taskId), {
        headers: payload.etag ? { 'If-Match': payload.etag } : undefined,
      });
    } catch (error) {
      await destination.client.request('DELETE', destinationUrl).catch(() => {});
      throw error;
    }

    const moved = parseVtodo(
      calendarData,
      destinationUrl,
      copied.headers.get('etag'),
      destination.target
    );
    if (!moved) throw new ApiError(500, 'Moved task could not be parsed');
    return moved;
  }

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

export async function deleteTask(taskId: string, accountId?: string, etag?: string | null) {
  if (isPendingTaskId(taskId)) return removeEntry(pendingEntryId(taskId));
  if (isLocalTaskId(taskId)) return deleteLocalTask(taskId);
  const client = await clientForTask(taskId, accountId);
  await client.request('DELETE', client.absoluteUrl(taskId), {
    headers: etag ? { 'If-Match': etag } : undefined,
  });
}

/** Edit a to-do that is still waiting in the outbox; the change goes up with it. */
async function updatePendingTask(taskId: string, patch: TaskUpdate): Promise<Task> {
  const id = pendingEntryId(taskId);
  const { etag: _etag, ...fields } = patch;
  const list = fields.list_id ? await findKnownList(fields.list_id) : null;
  if (fields.list_id && isLocalListId(fields.list_id)) {
    // Moving it onto the device means it no longer needs to sync.
    const entry = (await getEntries()).find((candidate) => candidate.id === id);
    if (!entry || entry.kind !== 'task') throw new ApiError(404, 'This to-do was already sent.');
    const moved = await createLocalTask({ ...entry.payload, ...fields, list_id: fields.list_id });
    await removeEntry(id);
    return moved;
  }
  let updated: Task | null = null;
  await updateEntry(id, (entry) => {
    if (entry.kind !== 'task') return entry;
    const next: OutboxTaskEntry = {
      ...entry,
      payload: { ...entry.payload, ...fields },
      ...(list ? { listName: list.name, accountId: list.account_id, accountName: list.account_name } : {}),
    };
    updated = pendingTask(next);
    return next;
  });
  if (!updated) throw new ApiError(404, 'This to-do was already sent. Refresh to see it.');
  return updated;
}

async function moveLocalTaskToAccount(taskId: string, patch: TaskUpdate): Promise<Task> {
  const existing = await getLocalTask(taskId);
  if (!existing) throw new ApiError(404, 'This to-do is no longer on this device.');
  const { etag: _etag, ...fields } = patch;
  const created = await createTask({ ...taskToCreate(existing), ...fields, list_id: patch.list_id! });
  await deleteLocalTask(taskId);
  return created;
}

function taskToCreate(task: Task): TaskCreate {
  return {
    list_id: task.list_id,
    uid: task.uid,
    title: task.title,
    markdown: task.markdown,
    completed: task.completed,
    tags: task.tags,
    due_at: task.due_at,
    reminder_at: task.reminder_at,
    parent_uid: task.parent_uid,
    priority: task.priority,
    sort_order: task.sort_order,
  };
}

export async function validateCalDavAccount(account: CalDavAccount): Promise<void> {
  const client = new CalDavClient(account);
  await client.listTaskCalendars();
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

  async request(method: string, url: string, options: RequestInit = {}) {
    let safeUrl = url;
    try {
      safeUrl = assertUrlSameOrigin(url, this.origin);
    } catch (error) {
      throw new ApiError(400, error instanceof Error ? error.message : 'Refusing off-origin CalDAV URL');
    }

    // A stalled connection would otherwise hang a save forever instead of
    // failing over to the offline outbox.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

/** Resolve an exact account first; origin-only routing is safe only when unambiguous. */
async function clientForTask(taskId: string, accountId?: string): Promise<CalDavClient> {
  const clients = await allClients();
  if (accountId) {
    const exact = clients.find((candidate) => candidate.account.id === accountId);
    if (exact) return exact;
    throw new ApiError(404, 'The account that owns this task is no longer configured.');
  }
  const origin = originOf(taskId);
  const matches = clients.filter((candidate) => candidate.origin === origin);
  if (matches.length !== 1) {
    throw new ApiError(
      matches.length > 1 ? 409 : 404,
      matches.length > 1
        ? 'More than one account uses this server. Refresh the task before changing it.'
        : 'No configured account matches this task’s server. Re-add the account or refresh your lists.'
    );
  }
  return matches[0];
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

export function parseVtodo(calendarData: string, href: string, etag: string | null, list: TaskList): Task | null {
  // Read task fields from the VTODO with its VALARM sub-components removed:
  // an alarm carries its own DESCRIPTION, and a VTODO that lists the alarm
  // first would otherwise surface the reminder text as the task's notes.
  const fields = parseIcs(calendarData.replace(ALARM_BLOCK, ''));
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
    reminder_at: reminderAt,
    tags: icsTextList(fields, 'CATEGORIES'),
    sort_order: parseOptionalInt(icsRaw(fields, 'X-APPLE-SORT-ORDER')),
    parent_uid: icsText(fields, 'RELATED-TO') ?? null,
    children: [],
    etag,
    updated_at: parseIcsDate(icsField(fields, 'LAST-MODIFIED')),
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
  if (task.due_at) lines.push(`DUE:${formatIcsDate(task.due_at)}`);
  const tags = normalizeTags(task.tags ?? []);
  if (tags.length) lines.push(`CATEGORIES:${serializeIcsList(tags)}`);
  if (task.parent_uid) lines.push(`RELATED-TO:${escapeIcs(task.parent_uid)}`);
  if (task.reminder_at) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeIcs(task.title)}`, `TRIGGER:${formatIcsDate(task.reminder_at)}`, 'END:VALARM');
  }
  lines.push('END:VTODO', 'END:VCALENDAR', '');
  return { uid, calendarData: lines.join('\r\n') };
}

export function updateVtodo(calendarData: string, patch: TaskUpdate) {
  // VALARM carries its own DESCRIPTION, so field edits run against a copy with
  // the alarm blocks masked out — otherwise `setIcsField` can rewrite the
  // alarm's text instead of the task's notes on VTODOs written by other
  // clients (which are free to put VALARM before DESCRIPTION).
  let next = editVtodoBody(calendarData, (body) => {
    let draft = body;
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
    if (patch.due_at !== undefined) draft = setIcsField(draft, 'DUE', patch.due_at ? formatIcsDate(patch.due_at) : null, false);
    if (patch.tags !== undefined) {
      const tags = normalizeTags(patch.tags);
      // Escape per tag, never over the joined string: escaping afterwards would
      // also escape the separators and collapse every tag into a single one.
      draft = setIcsField(draft, 'CATEGORIES', tags.length ? serializeIcsList(tags) : null, false);
    }
    if (patch.parent_uid !== undefined) draft = setIcsField(draft, 'RELATED-TO', patch.parent_uid);
    return setIcsField(draft, 'LAST-MODIFIED', formatIcsDate(new Date().toISOString()), false);
  });
  if (patch.reminder_at !== undefined) next = setVAlarm(next, patch.reminder_at, patch.title);
  return next;
}

const ALARM_SLOT = 'X-PATCHWORK-VALARM-SLOT';
const ALARM_BLOCK = /BEGIN:VALARM\r?\n[\s\S]*?END:VALARM/gi;

/** Runs `edit` over the VTODO with VALARM sub-components swapped for placeholders. */
function editVtodoBody(calendarData: string, edit: (body: string) => string) {
  const alarms: string[] = [];
  const masked = calendarData.replace(ALARM_BLOCK, (match) => {
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
  return withoutAlarm.replace(/END:VTODO/i, `${alarm}\r\nEND:VTODO`);
}

/**
 * Writes a single occurrence of `name`, replacing *every* existing one.
 *
 * Repeating a property is legal ICS and other clients do it (notably
 * `CATEGORIES`). Rewriting only the first occurrence used to leave the rest
 * behind, so a tag the user removed reappeared on the next sync.
 */
function setIcsField(calendarData: string, name: string, value: string | null, escape = true) {
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
  return calendarData.replace(/END:VTODO/i, `${line}\r\nEND:VTODO`);
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

function parseIcsDate(field: IcsField | undefined) {
  const value = field?.value;
  if (!value) return null;
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`).toISOString();
  }
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
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
  if (!base) return null;
  return new Date(new Date(base).getTime() + offset).toISOString();
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
