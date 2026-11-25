import AsyncStorage from '@react-native-async-storage/async-storage';

import { CalDavClient } from '@/api/caldav/client';
import { DAV_NS, readDavPrincipal, readDavProperty } from '@/api/caldav/multistatus';
import { ApiError } from '@/api/error';
import type { AttachmentAccess, AttachmentUpload, TaskAttachment } from '@/api/types';
import { isNetworkError } from '@/features/sync/connectivity';

const UPLOAD_TIMEOUT_MS = 120_000;
const ATTACHMENT_FOLDER = 'Tasks';
const USER_ID_KEY = 'patchwork.nextcloud-user-id.';

export class NextcloudFiles {
  constructor(private client: CalDavClient) {}

  private userIdPromise: Promise<string> | null = null;

  /**
   * The Nextcloud user id, which names the Files WebDAV folder. It can differ
   * from the login name (email logins, LDAP), so ask the server.
   */
  userId() {
    this.userIdPromise ??= (async () => {
      const response = await this.client.request('PROPFIND', this.client.davRoot(), {
        body: `<d:propfind xmlns:d="${DAV_NS}"><d:prop><d:current-user-principal /></d:prop></d:propfind>`,
        headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
      });
      const href = readDavPrincipal(await response.text());
      const segment = href?.replace(/\/+$/, '').split('/').pop();
      const id = segment ? decodeURIComponent(segment) : this.client.account.username;
      void AsyncStorage.setItem(`${USER_ID_KEY}${this.client.account.id}`, id).catch(() => {});
      return id;
    })().catch(async (error) => {
      this.userIdPromise = null;
      // Offline, the last id the server gave still names the right folder, so
      // cached thumbnails load and files can be queued. Not memoised: the next
      // call online asks the server again.
      if (!isNetworkError(error)) throw error;
      const stored = await AsyncStorage.getItem(`${USER_ID_KEY}${this.client.account.id}`).catch(() => null);
      return stored ?? this.client.account.username;
    });
    return this.userIdPromise;
  }

  async filesRoot() {
    return `${this.client.davRoot()}files/${encodeURIComponent(await this.userId())}/`;
  }

  async attachmentAccess(): Promise<AttachmentAccess> {
    return {
      serverRoot: this.client.serverRoot(),
      filesRoot: await this.filesRoot(),
      origin: this.client.origin,
      headers: { Authorization: this.client.authorization(), 'OCS-APIRequest': 'true' },
    };
  }

  private async ensureFolder(path: string) {
    try {
      await this.client.request('MKCOL', `${await this.filesRoot()}${encodePath(path)}/`);
    } catch (error) {
      // 405 Method Not Allowed: the folder already exists.
      if (!(error instanceof ApiError && error.status === 405)) throw error;
    }
  }

  async uploadAttachment(taskUid: string, file: AttachmentUpload, operationId: string): Promise<TaskAttachment> {
    const { File } = await import('expo-file-system');
    const bytes = await new File(file.uri).arrayBuffer();
    return this.uploadBlob(taskUid, bytes, file.name, file.mime, operationId);
  }

  async uploadBlob(taskUid: string, blob: Blob | ArrayBuffer, fileName: string, mime: string, operationId?: string): Promise<TaskAttachment> {
    const taskFolder = attachmentFolder(taskUid);
    await this.ensureFolder(ATTACHMENT_FOLDER);
    await this.ensureFolder(taskFolder);
    const operation = operationId ? safeFileName(operationId) : '';
    if (operationId && !operation) throw new ApiError(400, 'Invalid attachment operation.');
    const folder = operation ? `${taskFolder}/${operation}` : taskFolder;
    if (operation) await this.ensureFolder(folder);
    const filesRoot = await this.filesRoot();
    const name = attachmentName(fileName);
    const dot = name.lastIndexOf('.');
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const candidate = attempt === 1 ? name : `${stem} (${attempt})${extension}`;
      const path = `${folder}/${candidate}`;
      const url = `${filesRoot}${encodePath(path)}`;
      let fileId: string | null = null;
      try {
        const response = await this.client.request(
          'PUT',
          url,
          { body: blob, headers: { 'Content-Type': mime, 'If-None-Match': '*' } },
          UPLOAD_TIMEOUT_MS
        );
        fileId = parseFileId(response.headers.get('oc-fileid'));
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 412)) throw error;
        // A replay uses the same operation folder, so its original upload can be linked.
        if (!operation) continue;
      }
      fileId ??= await this.fileIdOf(url);
      return {
        url: fileId ? `${this.client.serverRoot()}f/${fileId}` : url,
        name: candidate,
        mime,
        path: `/${path}`,
        file_id: fileId,
        has_preview: mime.startsWith('image/'),
      };
    }
    throw new ApiError(409, 'Too many files with this name on the task already.');
  }

  private async fileIdOf(url: string) {
    try {
      const response = await this.client.request('PROPFIND', url, {
        body: `<d:propfind xmlns:d="${DAV_NS}" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid /></d:prop></d:propfind>`,
        headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
      });
      return readDavProperty(await response.text(), 'http://owncloud.org/ns', 'fileid');
    } catch {
      return null;
    }
  }

  async downloadFile(path: string) {
    const response = await this.client.request(
      'GET',
      `${await this.filesRoot()}${encodePath(path.replace(/^\/+/, ''))}`,
      {},
      UPLOAD_TIMEOUT_MS
    );
    return response.blob();
  }

  async deleteFile(path: string) {
    try {
      await this.client.request('DELETE', `${await this.filesRoot()}${encodePath(path.replace(/^\/+/, ''))}`);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
}

export function attachmentFolder(taskUid: string) {
  const name = safeFileName(taskUid);
  if (!name) throw new ApiError(400, 'This task does not have a usable attachment folder.');
  return `${ATTACHMENT_FOLDER}/${name}`;
}

export function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** One path segment: no slashes, control characters, or names Nextcloud rejects. */
export function safeFileName(name: string) {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
}

/** `OC-FileId` is the numeric id followed by the instance id, e.g. `00004821ocabc123`. */
function parseFileId(header: string | null) {
  const digits = header?.match(/^(\d+)/)?.[1];
  return digits ? String(Number.parseInt(digits, 10)) : null;
}


export function attachmentName(name: string) {
  return safeFileName(name) || 'file';
}
