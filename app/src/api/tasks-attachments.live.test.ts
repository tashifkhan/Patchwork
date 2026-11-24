/**
 * Runs the real attachment code in `tasks.native.ts` against the Nextcloud
 * server in `.env.test`, or in CALDAV_TEST_* environment variables, which win.
 * Skipped unless PATCHWORK_LIVE=1, because it creates (and then deletes) a
 * scratch to-do and files on that server.
 *
 *   PATCHWORK_LIVE=1 bun test src/api/tasks-attachments.live.test.ts
 */
import { afterAll, describe, expect, mock, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

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

if (live) {
  // Only the device storage modules are faked; every request is real.
  mock.module('expo-file-system', () => ({
    File: class {
      constructor(private uri: string) {}
      arrayBuffer() {
        return Bun.file(new URL(this.uri)).arrayBuffer();
      }
    },
  }));
  mock.module('@/lib/credentials', () => ({ getAccounts: async () => (second ? [account, second] : [account]) }));
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
    enqueue: async () => {
      throw new Error('not in live test');
    },
    getEntries: async () => [],
    isPendingTaskId: (id: string) => id.startsWith('outbox://'),
    pendingEntryId: (id: string) => id,
    pendingTask: () => {
      throw new Error('not in live test');
    },
    removeEntry: async () => {},
    updateEntry: async () => {},
  }));
}

describe.skipIf(!live)('attachments against a live Nextcloud', () => {
  // Runs even when an assertion fails, so the server is left as it was.
  const cleanups: (() => Promise<unknown>)[] = [];
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup().catch(() => {});
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

      task = await api.addTaskAttachment(task.id, upload, account.id, task.etag);
      task = await api.addTaskAttachment(task.id, upload, account.id, task.etag);
      expect(task.attachments?.map((attachment) => attachment.name)).toEqual(['sink leak.png', 'sink leak (2).png']);
      const [first, second] = task.attachments!;
      expect(first.path).toBe(`/Tasks/${task.uid}/sink leak.png`);
      expect(first.file_id).toMatch(/^\d+$/);
      expect(first.url).toMatch(/\/f\/\d+$/);

      const access = (await api.getAttachmentAccess(account.id))!;
      expect(access).not.toBeNull();

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
      task = await api.addTaskAttachment(task.id, { uri: `file://${file}`, name: 'move.png', mime: 'image/png' }, account.id, task.etag);
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
});

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
