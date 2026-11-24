/**
 * Runs the real attachment code in `tasks.native.ts` against the Nextcloud
 * server in `.env.test`, or in CALDAV_TEST_* environment variables, which win.
 * Skipped unless PATCHWORK_LIVE=1, because it creates (and then deletes) a
 * scratch to-do and files on that server.
 *
 *   PATCHWORK_LIVE=1 bun test src/api/tasks-attachments.live.test.ts
 */
import { afterAll, describe, expect, mock, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

import type { OutboxAttachmentEntry, OutboxEntry, OutboxTaskEntry } from '@/lib/outbox';
import type { Task } from '@/api/types';
import type { CalDavAccount } from '@/lib/credentials-types';

const env = {
  ...readEnv(resolve(import.meta.dir, '../../.env.test')),
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[0].startsWith('CALDAV_TEST') && entry[1] != null,
    ),
  ),
};
const live = process.env.PATCHWORK_LIVE === '1' && env.CALDAV_TEST_URL != null;

const account: CalDavAccount = {
  id: 'live',
  displayName: 'Live test',
  baseUrl: env.CALDAV_TEST_URL ?? '',
  username: env.CALDAV_TEST_USERNAME ?? '',
  appPassword: env.CALDAV_TEST_PASSWORD ?? '',
  serverType: 'nextcloud',
};

/** Optional second Nextcloud login (CALDAV_TEST2_*) for the cross-account move. */
const second: CalDavAccount | null = env.CALDAV_TEST2_USERNAME
  ? {
      id: 'live-2',
      displayName: 'Live test 2',
      baseUrl: env.CALDAV_TEST2_URL ?? account.baseUrl,
      username: env.CALDAV_TEST2_USERNAME,
      appPassword: env.CALDAV_TEST2_PASSWORD ?? '',
      serverType: 'nextcloud',
    }
  : null;

const generic: CalDavAccount | null = second ? { ...second, id: 'generic', serverType: 'other' } : null;
const outbox: OutboxEntry[] = [];
const filesBase = live ? mkdtempSync(join(tmpdir(), 'patchwork-attachment-live-')) : '';

if (live) {
  // Only the device storage modules are faked; every request is real.
  const storage = new Map<string, string>();
  mock.module('@react-native-async-storage/async-storage', () => ({
    default: {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => { storage.set(key, value); },
    },
  }));
  class TestDirectory {
    readonly path: string;
    readonly uri: string;
    constructor(base: string, ...names: string[]) {
      this.path = join(base, ...names);
      this.uri = pathToFileURL(this.path).href;
    }
    create() {
      mkdirSync(this.path, { recursive: true });
    }
  }
  class TestFile {
    readonly uri: string;
    constructor(base: string | TestDirectory, name?: string) {
      this.uri = typeof base === 'string' ? base : pathToFileURL(join(base.path, name!)).href;
    }
    get exists() {
      return existsSync(fileURLToPath(this.uri));
    }
    copy(destination: TestFile) {
      copyFileSync(fileURLToPath(this.uri), fileURLToPath(destination.uri));
    }
    delete() {
      rmSync(fileURLToPath(this.uri));
    }
    arrayBuffer() {
      return Bun.file(new URL(this.uri)).arrayBuffer();
    }
    static async downloadFileAsync(url: string, destination: TestFile, options: RequestInit) {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      writeFileSync(fileURLToPath(destination.uri), Buffer.from(await response.arrayBuffer()));
      return destination;
    }
  }
  mock.module('expo-file-system', () => ({
    Directory: TestDirectory, File: TestFile, Paths: { document: filesBase, cache: filesBase },
  }));
  mock.module('@/lib/credentials', () => ({ getAccounts: async () => [account, ...(second && generic ? [second, generic] : [])] }));
  mock.module('@/lib/local-tasks', () => ({
    LOCAL_ACCOUNT_ID: 'local',
    isLocalListId: (id: string | null | undefined) => !!id?.startsWith('local:'),
    isLocalTaskId: (id: string) => id.startsWith('local://'),
    cacheRemoteLists: async () => {},
    cacheRemoteTasks: async () => {},
    cachedRemoteLists: async () => null,
    cachedRemoteTasks: async () => null,
    getLocalLists: async () => [],
    getLocalTasks: async () => [],
    getLocalTask: async () => null,
    ensureDefaultLocalList: async () => [],
    findKnownList: async () => null,
    createLocalList: async () => {
      throw new Error('not in live test');
    },
    createLocalTask: async () => {
      throw new Error('not in live test');
    },
    updateLocalTask: async () => {
      throw new Error('not in live test');
    },
    deleteLocalTask: async () => {},
    deleteLocalList: async () => {},
    renameLocalList: async () => {
      throw new Error('not in live test');
    },
  }));
  mock.module('@/lib/outbox', () => ({
    enqueue: async (input: OutboxEntry) => {
      const entry = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), attempts: 0, lastError: null };
      outbox.push(entry);
      return entry;
    },
    getEntries: async () => [...outbox],
    isPendingTaskId: (id: string) => id.startsWith('outbox://'),
    pendingEntryId: (id: string) => id.slice('outbox://'.length),
    pendingTask: (entry: OutboxTaskEntry) => ({
      id: `outbox://${entry.id}`, title: entry.payload.title, uid: entry.payload.uid,
      account_id: entry.accountId, list_id: entry.payload.list_id,
    }),
    removeEntry: async (id: string) => {
      const index = outbox.findIndex((entry) => entry.id === id);
      if (index >= 0) outbox.splice(index, 1);
    },
    updateEntry: async () => {},
  }));
}

describe.skipIf(!live)('attachments against a live Nextcloud', () => {
  // Runs even when an assertion fails, so the server is left as it was.
  const cleanups: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
    rmSync(filesBase, { recursive: true, force: true });
  });

  test(
    'upload, preview, download, survive an edit, remove, delete',
    async () => {
      const api = await import('@/api/tasks.native');
      const { attachmentFileUri, attachmentPreviewUri } = await import('@/lib/attachment-urls');

      // A scratch list of its own, so the test never touches real lists.
      const list = await api.createTaskList({ name: `Patchwork attachment test ${Date.now()}`, account_id: account.id });
      let task = await api.createTask({ list_id: list.id, title: 'Leaking sink' });
      cleanups.push(() => api.deleteTaskList(list.id));
      cleanups.push(() => api.deleteTask(task.id, account.id));

      const dir = mkdtempSync(join(tmpdir(), 'patchwork-attach-'));
      const file = join(dir, 'photo.png');
      const png = makePng(64, 48);
      writeFileSync(file, png);
      const upload = { uri: `file://${file}`, name: 'sink leak.png', mime: 'image/png' };

      task = (await api.addTaskAttachment(task.id, task, upload, task.etag))!;
      task = (await api.addTaskAttachment(task.id, task, upload, task.etag))!;
      expect(task.attachments?.map((attachment) => attachment.name)).toEqual(['sink leak.png', 'sink leak.png']);
      await expect(
        api.addTaskAttachment(task.id, task, { ...upload, name: 'stale.png' }, '"stale-attachment-test"')
      ).rejects.toMatchObject({ status: 412 });

      const [first, second] = task.attachments!;
      expect(first.path?.split('/').slice(1, 3)).toEqual(['Tasks', task.uid]);
      expect(first.path).not.toBe(second.path);
      expect(first.file_id).toMatch(/^\d+$/);
      expect(first.url).toMatch(/\/f\/\d+$/);

      const access = (await api.getAttachmentAccess(account.id))!;
      expect(access).not.toBeNull();
      const contents = await fetch(`${access.filesRoot}Tasks/${encodeURIComponent(task.uid)}/`, {
        method: 'PROPFIND', headers: { ...access.headers, Depth: 'infinity' },
      });
      expect(contents.status).toBe(207);
      expect(await contents.text()).not.toContain('stale.png');


      // Basic auth with an app password must be enough for the preview endpoint.
      const preview = await fetch(attachmentPreviewUri(access, first, 128)!, { headers: access.headers });
      expect(preview.status).toBe(200);
      expect(preview.headers.get('content-type')).toMatch(/^image\//);

      const original = await fetch(attachmentFileUri(access, first)!, { headers: access.headers });
      expect(original.status).toBe(200);
      expect(Buffer.from(await original.arrayBuffer()).equals(png)).toBe(true);

      // The server's copy parses back, and a normal edit keeps the ATTACH lines.
      task = await api.updateTask(task.id, { title: `${task.title} edited`, etag: task.etag }, account.id);
      const fetched = findTask(await api.fetchTasks(), task.uid);
      expect(fetched?.attachments).toEqual(task.attachments);
      expect(fetched?.attachments).toHaveLength(2);

      task = await api.removeTaskAttachment(task.id, first, account.id, fetched!.etag);
      expect(task.attachments).toEqual([second]);
      const gone = await fetch(attachmentFileUri(access, first)!, { headers: access.headers });
      expect(gone.status).toBe(404);

      // A soft delete keeps the file and restoring the UID relinks it.
      await api.deleteTask(task.id, account.id, task.etag, { keepAttachments: true });
      task = await api.restoreTask(
        { list_id: list.id, uid: task.uid, title: task.title },
        { account_id: account.id, attachments: task.attachments },
      );
      expect(task.attachments).toEqual([second]);
      expect((await fetch(attachmentFileUri(access, second)!, { headers: access.headers })).status).toBe(200);

      await api.deleteTask(task.id, account.id, task.etag);
      const folder = await fetch(`${access.filesRoot}Tasks/${encodeURIComponent(task.uid)}/`, {
        method: 'PROPFIND',
        headers: { ...access.headers, Depth: '0' },
      });
      expect(folder.status).toBe(404);
    },
    60_000,
  );

  test.skipIf(!second)(
    'moving to another Nextcloud account copies the images across',
    async () => {
      const api = await import('@/api/tasks.native');
      const { attachmentFileUri } = await import('@/lib/attachment-urls');
      const stamp = Date.now();
      const from = await api.createTaskList({ name: `Patchwork move from ${stamp}`, account_id: account.id });
      const to = await api.createTaskList({ name: `Patchwork move to ${stamp}`, account_id: second!.id });
      let task = await api.createTask({ list_id: from.id, title: 'Moving photo' });
      cleanups.push(() => api.deleteTaskList(from.id), () => api.deleteTaskList(to.id));
      cleanups.push(() => api.deleteTask(task.id, task.account_id));

      const dir = mkdtempSync(join(tmpdir(), 'patchwork-move-'));
      const file = join(dir, 'photo.png');
      const png = makePng(32, 32);
      writeFileSync(file, png);
      task = (await api.addTaskAttachment(task.id, task, { uri: `file://${file}`, name: 'move.png', mime: 'image/png' }, task.etag))!;
      const [original] = task.attachments!;

      task = await api.updateTask(task.id, { list_id: to.id, etag: task.etag }, account.id);
      expect(task.account_id).toBe(second!.id);
      const [moved] = task.attachments!;
      expect(moved.path).toBe(`/Tasks/${task.uid}/move.png`);
      expect(moved.file_id).not.toBe(original.file_id);

      const fromAccess = (await api.getAttachmentAccess(account.id))!;
      const toAccess = (await api.getAttachmentAccess(second!.id))!;
      const copy = await fetch(attachmentFileUri(toAccess, moved)!, { headers: toAccess.headers });
      expect(Buffer.from(await copy.arrayBuffer()).equals(png)).toBe(true);
      const old = await fetch(attachmentFileUri(fromAccess, original)!, { headers: fromAccess.headers });
      expect(old.status).toBe(404);
    },
    60_000,
  );

  test('queues a document for an offline task and sends it after the task exists', async () => {
    const api = await import('@/api/tasks.native');
    const { useConnectivityStore } = await import('@/lib/connectivity');
    const list = await api.createTaskList({ name: `Offline documents ${Date.now()}`, account_id: account.id });
    cleanups.push(() => api.deleteTaskList(list.id));
    const file = documentUpload();
    let task: Task;
    useConnectivityStore.getState().setQuality('offline');
    try {
      task = await api.createTask({ list_id: list.id, title: 'Offline document' });
      expect(task.id).toStartWith('outbox://');
      expect(await api.addTaskAttachment(task.id, task, file)).toBeNull();
    } finally {
      useConnectivityStore.getState().setQuality('online');
    }
    const pending = outbox.find((entry) => entry.kind === 'task' && entry.payload.uid === task.uid) as OutboxTaskEntry;
    const queued = queuedFile(task.uid);
    expect(queued.file.uri).not.toBe(file.uri);
    expect(existsSync(fileURLToPath(queued.file.uri))).toBe(true);
    await expect(api.sendQueuedAttachment(queued)).rejects.toMatchObject({ status: 409 });
    const remote = await api.createRemoteTask(pending.payload);
    cleanups.push(() => api.deleteTask(remote.id, remote.account_id));
    outbox.splice(outbox.indexOf(pending), 1);
    await api.sendQueuedAttachment(queued);
    expect(outbox).not.toContain(queued);
    expect(existsSync(fileURLToPath(queued.file.uri))).toBe(false);
    const saved = findTask(await api.fetchTasks(), task.uid);
    expect(saved?.attachments?.map((attachment) => attachment.name)).toEqual(['receipt.txt']);
    const downloaded = await api.downloadTaskAttachment(account.id, saved!.attachments![0]);
    expect(readFileSync(fileURLToPath(downloaded), 'utf8')).toBe('Test receipt');
  }, 60_000);

  test('replays an upload whose CalDAV write succeeded before its connection dropped', async () => {
    const api = await import('@/api/tasks.native');
    const list = await api.createTaskList({ name: `Attachment retry ${Date.now()}`, account_id: account.id });
    const task = await api.createTask({ list_id: list.id, title: 'Lost response' });
    cleanups.push(() => api.deleteTaskList(list.id), () => api.deleteTask(task.id, account.id));
    const fetchNormally = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const response = await fetchNormally(input, init);
      if (String(input) === task.id && init?.method === 'PUT' && response.ok) throw new Error('Connection dropped');
      return response;
    }) as typeof fetch;
    try {
      expect(await api.addTaskAttachment(task.id, task, documentUpload())).toBeNull();
    } finally {
      globalThis.fetch = fetchNormally;
    }
    const queued = queuedFile(task.uid);
    const before = findTask(await api.fetchTasks(), task.uid);
    await api.sendQueuedAttachment(queued);
    await api.sendQueuedAttachment(queued);
    const after = findTask(await api.fetchTasks(), task.uid);
    expect(before?.attachments).toHaveLength(1);
    expect(after?.attachments).toEqual(before?.attachments);
  }, 60_000);

  test.skipIf(!generic)('moves a task out of Nextcloud with a plain link to its original file', async () => {
    const api = await import('@/api/tasks.native');
    const { attachmentFileUri } = await import('@/lib/attachment-urls');
    const from = await api.createTaskList({ name: `Link source ${Date.now()}`, account_id: account.id });
    const to = await api.createTaskList({ name: `Link destination ${Date.now()}`, account_id: generic!.id });
    let task = await api.createTask({ list_id: from.id, title: 'Move this file link' });
    cleanups.push(() => api.deleteTaskList(from.id), () => api.deleteTaskList(to.id), () => api.deleteTask(task.id, task.account_id));
    task = (await api.addTaskAttachment(task.id, task, documentUpload(), task.etag))!;
    const original = task.attachments![0];
    const access = (await api.getAttachmentAccess(account.id))!;
    const fileUrl = attachmentFileUri(access, original)!;
    cleanups.push(async () => { await fetch(fileUrl, { method: 'DELETE', headers: access.headers }); });
    task = await api.updateTask(task.id, { list_id: to.id, etag: task.etag }, account.id);
    expect(task.attachments).toEqual([{ ...original, path: null, file_id: null, has_preview: false }]);
    expect((await fetch(fileUrl, { headers: access.headers })).status).toBe(200);
  }, 60_000);
});

function documentUpload() {
  const file = join(filesBase, 'receipt.txt');
  writeFileSync(file, 'Test receipt');
  return { uri: pathToFileURL(file).href, name: 'receipt.txt', mime: 'text/plain' };
}

function queuedFile(taskUid: string): OutboxAttachmentEntry {
  const entry = outbox.find((candidate) => candidate.kind === 'attachment' && candidate.taskUid === taskUid);
  if (entry?.kind !== 'attachment') throw new Error('Attachment was not queued');
  return entry;
}

function findTask(tasks: import('@/api/types').Task[], uid: string): import('@/api/types').Task | null {
  for (const task of tasks) {
    if (task.uid === uid) return task;
    const child = findTask(task.children, uid);
    if (child) return child;
  }
  return null;
}

function readEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

/** A real (gradient) PNG, so the server can render a preview of it. */
function makePng(width: number, height: number) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      rows[offset + 1 + x * 3] = (x * 4) & 0xff;
      rows[offset + 2 + x * 3] = (y * 5) & 0xff;
      rows[offset + 3 + x * 3] = 160;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
