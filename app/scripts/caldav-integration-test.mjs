import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

loadEnv(resolve(process.cwd(), '.env.test'));

const config = {
  calendarHomeUrl: requiredEnv('CALDAV_TEST_URL').replace(/\/+$/, '') + '/',
  username: requiredEnv('CALDAV_TEST_USERNAME'),
  password: requiredEnv('CALDAV_TEST_PASSWORD'),
};

const baseUrl = new URL(config.calendarHomeUrl).origin;
const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;

const DAV_NS = 'DAV:';
const CALDAV_NS = 'urn:ietf:params:xml:ns:caldav';

const results = {
  lists: await fetchTaskLists(),
  tasks: [],
  deckBoards: await fetchDeckBoards(),
  deckDetails: [],
};

for (const list of results.lists) {
  results.tasks.push(...await fetchTasksForList(list));
}

for (const board of results.deckBoards) {
  results.deckDetails.push(await fetchDeckBoard(board.id));
}

assertTaskLists(results.lists);
assertTasks(results.tasks);
assertDeckBoards(results.deckBoards);
assertDeckDetails(results.deckDetails);

console.log(JSON.stringify({
  ok: true,
  list_count: results.lists.length,
  task_count: results.tasks.length,
  deck_board_count: results.deckBoards.length,
  deck_stack_count: results.deckDetails.reduce((sum, detail) => sum + detail.stacks.length, 0),
  sample_list: results.lists[0] ?? null,
  sample_task: results.tasks[0] ?? null,
  sample_deck_board: results.deckBoards[0] ?? null,
  sample_deck_detail: results.deckDetails[0] ?? null,
}, null, 2));

async function fetchTaskLists() {
  const xml = await davRequest('PROPFIND', config.calendarHomeUrl, {
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

  return responseBlocks(xml).flatMap((block) => {
    const href = readTagText(block, 'href');
    const name = readTagText(block, 'displayname');
    if (!href || !name || !block.includes(':calendar')) return [];
    return [{
      id: href.replace(/\/+$/, '').split('/').pop() ?? href,
      href: absoluteUrl(href),
      name,
      is_deck: isDeckCalendar(name, href),
      supported_components: supportedCalendarComponents(block),
    }];
  }).filter((list) => !list.is_deck && listSupportsTasks(list));
}

async function fetchTasksForList(list) {
  const xml = await davRequest('REPORT', list.href, {
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

  return responseBlocks(xml).flatMap((block) => {
    const href = readTagText(block, 'href');
    const etag = readTagText(block, 'getetag');
    const calendarData = readTagText(block, 'calendar-data');
    if (!href || !calendarData) return [];
    const task = parseVtodo(calendarData, absoluteUrl(href), etag, list);
    return task ? [task] : [];
  });
}

async function fetchDeckBoards() {
  const response = await fetch(`${baseUrl}/index.php/apps/deck/api/v1.0/boards`, {
    headers: { Authorization: authHeader, Accept: 'application/json', 'OCS-APIRequest': 'true' },
  });
  if (response.status === 404) return [];
  const text = await response.text();
  if (!response.ok) throw new Error(`Deck request failed ${response.status}: ${text}`);
  const parsed = text ? JSON.parse(text) : [];
  return Array.isArray(parsed)
    ? parsed
      .filter(isActiveDeckItem)
      .map((board) => ({ id: board.id, title: board.title, raw: board }))
    : [];
}

async function fetchDeckBoard(boardId) {
  const response = await fetch(`${baseUrl}/index.php/apps/deck/api/v1.0/boards/${boardId}/stacks`, {
    headers: { Authorization: authHeader, Accept: 'application/json', 'OCS-APIRequest': 'true' },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Deck board request failed ${response.status}: ${text}`);
  const parsed = text ? JSON.parse(text) : [];
  return { board_id: boardId, stacks: normalizeStacks(parsed) };
}

async function davRequest(method, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    method,
    headers: {
      Authorization: authHeader,
      Accept: 'application/xml,text/calendar,*/*',
      ...options.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${url} failed ${response.status}: ${text}`);
  return text;
}

function parseVtodo(calendarData, href, etag, list) {
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
    title: fields.get('SUMMARY')?.[0] ?? 'Untitled task',
    description,
    markdown: description,
    completed: status === 'COMPLETED',
    priority: parseOptionalInt(fields.get('PRIORITY')?.[0]),
    due_at: parseIcsDate(fields.get('DUE')?.[0]),
    reminder_at: parseIcsDate(fields.get('TRIGGER')?.[0]),
    tags: (fields.get('CATEGORIES') ?? []).flatMap((value) => value.split(',').map((tag) => tag.trim()).filter(Boolean)),
    parent_uid: fields.get('RELATED-TO')?.[0] ?? null,
    children: [],
    etag,
    updated_at: parseIcsDate(fields.get('LAST-MODIFIED')?.[0]),
  };
}

function assertTaskLists(lists) {
  assert(Array.isArray(lists), 'task lists must be an array');
  for (const list of lists) {
    assert.equal(typeof list.id, 'string', 'list.id must be string');
    assert.equal(typeof list.href, 'string', 'list.href must be string');
    assert.equal(typeof list.name, 'string', 'list.name must be string');
    assert.equal(typeof list.is_deck, 'boolean', 'list.is_deck must be boolean');
    assert(list.supported_components === undefined || Array.isArray(list.supported_components), 'list.supported_components must be array when present');
  }
}

function assertTasks(tasks) {
  assert(Array.isArray(tasks), 'tasks must be an array');
  for (const task of tasks) {
    assert.equal(typeof task.id, 'string', 'task.id must be string');
    assert.equal(typeof task.uid, 'string', 'task.uid must be string');
    assert.equal(typeof task.list_id, 'string', 'task.list_id must be string');
    assert.equal(typeof task.list_name, 'string', 'task.list_name must be string');
    assert.equal(typeof task.title, 'string', 'task.title must be string');
    assert.equal(typeof task.description, 'string', 'task.description must be string');
    assert.equal(typeof task.markdown, 'string', 'task.markdown must be string');
    assert.equal(typeof task.completed, 'boolean', 'task.completed must be boolean');
    assert(task.priority === null || typeof task.priority === 'number', 'task.priority must be number or null');
    assert(task.due_at === null || typeof task.due_at === 'string', 'task.due_at must be string or null');
    assert(task.reminder_at === null || typeof task.reminder_at === 'string', 'task.reminder_at must be string or null');
    assert(Array.isArray(task.tags), 'task.tags must be array');
    assert(task.parent_uid === null || typeof task.parent_uid === 'string', 'task.parent_uid must be string or null');
    assert(Array.isArray(task.children), 'task.children must be array');
    assert(task.etag === null || typeof task.etag === 'string', 'task.etag must be string or null');
    assert(task.updated_at === null || typeof task.updated_at === 'string', 'task.updated_at must be string or null');
  }
}

function assertDeckBoards(boards) {
  assert(Array.isArray(boards), 'deck boards must be an array');
  for (const board of boards) {
    assert.equal(typeof board.id, 'number', 'deck board.id must be number');
    assert.equal(typeof board.title, 'string', 'deck board.title must be string');
    assert.equal(typeof board.raw, 'object', 'deck board.raw must be object');
  }
}

function assertDeckDetails(details) {
  assert(Array.isArray(details), 'deck details must be an array');
  for (const detail of details) {
    assert.equal(typeof detail.board_id, 'number', 'deck detail.board_id must be number');
    assert(Array.isArray(detail.stacks), 'deck detail.stacks must be array');
    for (const stack of detail.stacks) {
      assert(stack && typeof stack === 'object', 'deck stack must be object');
      assert(stack.cards === undefined || Array.isArray(stack.cards), 'deck stack.cards must be array when present');
    }
  }
}

function normalizeStacks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isActiveDeckItem)
    .map((stack) => ({
      ...stack,
      cards: Array.isArray(stack.cards) ? stack.cards.filter(isActiveDeckItem) : [],
    }));
}

function isActiveDeckItem(item) {
  return item && typeof item === 'object' && item.archived !== true && (item.deletedAt == null || item.deletedAt === 0);
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    process.env[key] ??= value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function responseBlocks(xml) {
  return [...xml.matchAll(/<[^>]*response\b[^>]*>([\s\S]*?)<\/[^>]*response>/gi)].map((match) => match[1] ?? '');
}

function readTagText(xml, localName) {
  const match = xml.match(new RegExp(`<[^>/]*(?::)?${escapeRegExp(localName)}\\b[^>]*>([\\s\\S]*?)<\\/[^>]*(?::)?${escapeRegExp(localName)}>`, 'i'));
  return match?.[1] ? decodeXml(match[1].trim()) : null;
}

function parseIcs(calendarData) {
  const fields = new Map();
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

function absoluteUrl(href) {
  return href.startsWith('http://') || href.startsWith('https://') ? href : `${baseUrl}/${href.replace(/^\/+/, '')}`;
}

function isDeckCalendar(name, href = '') {
  return name.trim().toLowerCase().startsWith('deck:') || href.toLowerCase().includes('/deck');
}

function supportedCalendarComponents(xml) {
  return [...xml.matchAll(/<[^>]*(?::)?comp\b[^>]*\bname=["']([^"']+)["'][^>]*\/?\s*>/gi)]
    .map((match) => match[1]?.toUpperCase())
    .filter(Boolean);
}

function listSupportsTasks(list) {
  return !list.supported_components?.length || list.supported_components.includes('VTODO');
}

function parseOptionalInt(value) {
  if (value == null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseIcsDate(value) {
  if (!value) return null;
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`).toISOString();
  }
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function unescapeIcs(value) {
  return value.replace(/\\n/gi, '\n').replace(/\\([\\,;])/g, '$1');
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
