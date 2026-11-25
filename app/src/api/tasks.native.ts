import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from './client';
import type {
  AttachmentAccess,
  AttachmentTarget,
  AttachmentUpload,
  Task,
  TaskAttachment,
  TaskCreate,
  TaskList,
  TaskListCreate,
  TaskListUpdate,
  TaskUpdate,
} from './types';
import { APPLE_ACCOUNT_ID, isAppleListId, isAppleTaskId } from '@/lib/apple-reminders-ids';
import { base64Encode } from '@/lib/base64';
import { isNetworkError, knownOffline } from '@/lib/connectivity';
import { getAccounts, type CalDavAccount } from '@/lib/credentials';
import { addAttachment, attachmentAsLink, parseAttachments, removeAttachment } from '@/lib/ics-attachments';
import { attachmentFileUri } from '@/lib/attachment-urls';
import { foldIcs } from '@/lib/ics-fold';
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
  type OutboxAttachmentEntry,
  type OutboxTaskEntry,
} from '@/lib/outbox';
import { assertUrlSameOrigin, originOf } from '@/lib/secure-url';
import { normalizeTags } from '@/lib/tags';
import { useSyncStatusStore } from '@/stores/sync-status-store';

const DAV_NS = 'DAV:';
const CALDAV_NS = 'urn:ietf:params:xml:ns:caldav';
const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;
/** Folder in the user's Nextcloud Files that holds one subfolder per task. */
const ATTACHMENT_FOLDER = 'Tasks';
/** App documents subfolder holding files picked offline until they upload. */
const OUTBOX_FILES = 'outbox-attachments';
/** App cache subfolder for attachments downloaded to open in another app. */
const OPENED_FILES = 'attachments';
const USER_ID_KEY = 'patchwork.nextcloud-user-id.';

export async function fetchTaskLists() {
  const accounts = await getAccounts();
  const clients = accounts.map((account) => new CalDavClient(account));
  const [results, localLists, appleLists] = await Promise.all([
    Promise.allSettled(clients.map((client) => client.listTaskCalendars())),
    localListsToShow(accounts.length === 0),
    (await apple()).getAppleLists().catch(() => [] as TaskList[]),
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
  lists.push(...localLists, ...appleLists);
  useSyncStatusStore.getState().setTaskSync(warnings);
  if (lists.length === 0) throw firstRejected(results) ?? new ApiError(404, 'No task lists found.');
  return lists;
}

export async function fetchTasks() {
  const accounts = await getAccounts();
  const clients = accounts.map((account) => new CalDavClient(account));
  const [results, localLists, localTasks, outbox, appleTasks] = await Promise.all([
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
    (await apple()).getAppleTasks().catch(() => [] as Task[]),
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
  tasks.push(...attachChildren(localTasks), ...attachChildren(orphans), ...appleTasks);

  if (offline) warnings.unshift(OFFLINE_WARNING);
  useSyncStatusStore.getState().setTaskSync(warnings);
  if (tasks.length === 0 && localLists.length === 0 && failedWithoutCache > 0) {
    throw firstRejected(results) ?? new ApiError(404, 'No tasks found.');
  }
  return tasks;
}

/** The EventKit side of Apple Reminders, loaded on first use (iOS only in practice). */
const apple = () => import('@/lib/apple-reminders');

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
  if (payload.account_id === APPLE_ACCOUNT_ID) return (await apple()).createAppleList(payload.name);
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
  if (isAppleListId(listId)) return (await apple()).renameAppleList(listId, payload.name);
  const { client, target } = await resolveListTarget(listId);
  return client.renameTaskCalendar(target, payload.name);
}

export async function deleteTaskList(listId: string) {
  if (isLocalListId(listId)) return deleteLocalList(listId);
  if (isAppleListId(listId)) return (await apple()).deleteAppleList(listId);
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
  if (isAppleListId(payload.list_id)) {
    if (payload.parent_uid) throw new ApiError(400, 'Apple Reminders has no checklists, so this item can\'t go under a reminder.');
    return (await apple()).createAppleTask(payload);
  }
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
  return putNewTask(client, target, uid, calendarData);
}

export async function restoreTask(
  payload: TaskCreate & { uid: string },
  source?: Pick<Task, 'account_id' | 'attachments'>
): Promise<Task> {
  if (!source?.attachments?.length) return createTask(payload);
  if (isLocalListId(payload.list_id)) {
    throw new ApiError(400, 'Choose a Nextcloud list to restore this to-do with its images.');
  }

  const { client, target } = await resolveListTarget(payload.list_id);
  if (!isNextcloud(client)) {
    throw new ApiError(400, 'Choose a Nextcloud list to restore this to-do with its images.');
  }

  let { calendarData } = serializeVtodo({ ...payload, attachments: undefined });
  for (const attachment of source.attachments) calendarData = addAttachment(calendarData, attachment);
  if (source.account_id === client.account.id) {
    return putNewTask(client, target, payload.uid, calendarData);
  }

  const task = { uid: payload.uid, attachments: source.attachments };
  if (ownedAttachments(task).length !== task.attachments.length) {
    throw new ApiError(400, 'Choose the original Nextcloud account to restore this to-do with its attachments.');
  }
  const originalAccount = (await getAccounts()).find((account) => account.id === source.account_id);
  if (!originalAccount || originalAccount.serverType !== 'nextcloud') {
    throw new ApiError(400, 'Reconnect the original Nextcloud account to restore this to-do with its images.');
  }

  const original = new CalDavClient(originalAccount);
  const copied = await copyAttachments(original, client, calendarData, task);
  try {
    return await putNewTask(client, target, payload.uid, copied.calendarData);
  } catch (error) {
    await deleteCopiedFiles(client, copied.copied);
    throw error;
  }
}

async function putNewTask(client: CalDavClient, target: TaskList, uid: string, calendarData: string) {
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
  if (isAppleTaskId(taskId)) return updateAppleOrMove(taskId, payload);
  if (payload.list_id && isAppleListId(payload.list_id)) return moveIntoApple(taskId, payload, accountId);
  if (isPendingTaskId(taskId)) return updatePendingTask(taskId, payload);
  if (isLocalTaskId(taskId)) {
    if (payload.list_id && !isLocalListId(payload.list_id)) return moveLocalTaskToAccount(taskId, payload);
    return updateLocalTask(taskId, payload);
  }
  const client = await clientForTask(taskId, accountId);
  const existing = await client.fetchTaskByHref(taskId);
  let calendarData = updateVtodo(existing.calendarData, payload);
  const etag = payload.etag ?? existing.etag;

  if (payload.list_id && isLocalListId(payload.list_id)) {
    // Account to device: keep the uid so subtasks stay attached.
    const parsed = parseVtodo(calendarData, client.absoluteUrl(taskId), null, existing.list);
    if (!parsed) throw new ApiError(500, 'Task could not be read');
    await assertNoQueuedAttachments(parsed.uid, client.account.id);
    const moved = await createLocalTask({ ...taskToCreate(parsed), list_id: payload.list_id });
    try {
      await client.request('DELETE', client.absoluteUrl(taskId), {
        headers: etag ? { 'If-Match': etag } : undefined,
      });
    } catch (error) {
      await deleteLocalTask(moved.id);
      throw error;
    }
    return moved;
  }

  if (payload.list_id && payload.list_id !== existing.list.id) {
    const destination = await resolveListTarget(payload.list_id);
    const crossAccount = destination.client.account.id !== client.account.id;
    const before = parseVtodo(calendarData, client.absoluteUrl(taskId), null, existing.list);
    if (crossAccount && before) await assertNoQueuedAttachments(before.uid, client.account.id);
    const owned = before ? ownedAttachments(before) : [];
    const sharedFiles = crossAccount && owned.length > 0 && isNextcloud(client) && isNextcloud(destination.client)
      && (await client.filesRoot()) === (await destination.client.filesRoot());
    const carry = crossAccount && !sharedFiles && before && owned.length > 0
      && isNextcloud(client) && isNextcloud(destination.client)
      ? await copyAttachments(client, destination.client, calendarData, before)
      : null;
    if (carry) calendarData = carry.calendarData;
    if (crossAccount && !sharedFiles) {
      const copiedPaths = new Set((carry?.copied ?? []).map((copy) => copy.path));
      for (const attachment of parseAttachments(calendarData)) {
        if ((attachment.path || attachment.file_id) && !copiedPaths.has(attachment.path)) {
          calendarData = addAttachment(removeAttachment(calendarData, attachment.url), attachmentAsLink(attachment));
        }
      }
    }
    const fileName = new URL(taskId).pathname.split('/').filter(Boolean).pop() ?? `${randomUuid()}.ics`;
    const destinationHref = `${destination.target.href.replace(/\/+$/, '')}/${fileName}`;
    const destinationUrl = destination.client.absoluteUrl(destinationHref);
    const copied = await destination.client.request('PUT', destinationUrl, {
      body: calendarData,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'If-None-Match': '*',
      },
    }).catch(async (error: unknown) => {
      if (carry) await deleteCopiedFiles(destination.client, carry.copied);
      throw error;
    });

    try {
      await client.request('DELETE', client.absoluteUrl(taskId), {
        headers: etag ? { 'If-Match': etag } : undefined,
      });
    } catch (error) {
      await destination.client.request('DELETE', destinationUrl).catch(() => {});
      if (carry) await deleteCopiedFiles(destination.client, carry.copied);
      throw error;
    }
    if (carry) await deleteCopiedFiles(client, owned);

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
      ...(etag ? { 'If-Match': etag } : {}),
    },
  });
  const updated = parseVtodo(calendarData, client.absoluteUrl(taskId), response.headers.get('etag'), existing.list);
  if (!updated) {
    throw new ApiError(500, 'Updated task could not be parsed');
  }
  return updated;
}

export async function deleteTask(
  taskId: string,
  accountId?: string,
  etag?: string | null,
  options?: { keepAttachments?: boolean }
) {
  if (isAppleTaskId(taskId)) return (await apple()).deleteAppleTask(taskId);
  if (isPendingTaskId(taskId)) return discardQueued(pendingEntryId(taskId));
  if (isLocalTaskId(taskId)) return deleteLocalTask(taskId);
  const client = await clientForTask(taskId, accountId);
  // Read the task first so its own image folder can go with it.
  const owned = isNextcloud(client) && !options?.keepAttachments
    ? await client
        .fetchTaskByHref(taskId)
        .then(({ calendarData, list }) => parseVtodo(calendarData, client.absoluteUrl(taskId), null, list))
        .catch(() => null)
    : null;
  await client.request('DELETE', client.absoluteUrl(taskId), {
    headers: etag ? { 'If-Match': etag } : undefined,
  });
  if (owned && ownedAttachments(owned).length) {
    await client.deleteFile(`/${attachmentFolder(owned.uid)}`).catch(() => {});
  }
}

/** Edit a to-do that is still waiting in the outbox; the change goes up with it. */
async function updatePendingTask(taskId: string, patch: TaskUpdate): Promise<Task> {
  const id = pendingEntryId(taskId);
  const { etag: _etag, ...fields } = patch;
  const list = fields.list_id ? await findKnownList(fields.list_id) : null;
  if (fields.list_id) {
    const entry = (await getEntries()).find((candidate) => candidate.id === id);
    if (entry?.kind === 'task' && fields.list_id.split(':')[0] !== entry.accountId) {
      await assertNoQueuedAttachments(entry.payload.uid, entry.accountId);
    }
  }
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

/**
 * Edit an Apple reminder. EventKit can't move a reminder between lists, so a
 * list change copies it to the new list (Apple or not) and removes the old one.
 */
async function updateAppleOrMove(taskId: string, payload: TaskUpdate): Promise<Task> {
  if (!payload.list_id) return (await apple()).updateAppleTask(taskId, payload);
  const existing = await (await apple()).getAppleTask(taskId);
  if (!existing) throw new ApiError(404, 'This reminder is no longer in Reminders.');
  if (existing.list_id === payload.list_id) return (await apple()).updateAppleTask(taskId, payload);
  const { etag: _etag, ...fields } = payload;
  const created = await createTask({ ...taskToCreate(existing), ...fields, uid: undefined, list_id: payload.list_id });
  await (await apple()).deleteAppleTask(taskId);
  return created;
}

/** Move an on-device, queued or CalDAV to-do into an Apple Reminders list. */
async function moveIntoApple(taskId: string, payload: TaskUpdate, accountId?: string): Promise<Task> {
  const source = await readTask(taskId, accountId);
  const localChildren = isLocalTaskId(taskId)
    ? (await getLocalTasks()).filter((task) => task.parent_uid === source.uid)
    : [];
  if ((source.children ?? []).length || localChildren.length) {
    throw new ApiError(400, 'Apple Reminders has no checklists. Move the checklist items out first.');
  }
  if (source.attachments?.length) {
    throw new ApiError(400, 'Apple Reminders has no attachments. Remove the images first.');
  }
  const { etag: _etag, ...fields } = payload;
  const created = await (await apple()).createAppleTask({ ...taskToCreate(source), ...fields, list_id: payload.list_id! });
  try {
    await deleteTask(taskId, accountId, source.etag, { keepAttachments: true });
  } catch (error) {
    await (await apple()).deleteAppleTask(created.id).catch(() => {});
    throw error;
  }
  return created;
}

/** The current state of any to-do, for copying it somewhere else. */
async function readTask(taskId: string, accountId?: string): Promise<Task> {
  if (isLocalTaskId(taskId)) {
    const task = await getLocalTask(taskId);
    if (!task) throw new ApiError(404, 'This to-do is no longer on this device.');
    return task;
  }
  if (isPendingTaskId(taskId)) {
    const entry = (await getEntries()).find((candidate) => candidate.id === pendingEntryId(taskId));
    if (!entry || entry.kind !== 'task') throw new ApiError(404, 'This to-do was already sent. Refresh to see it.');
    return pendingTask(entry);
  }
  const client = await clientForTask(taskId, accountId);
  const existing = await client.fetchTaskByHref(taskId);
  const parsed = parseVtodo(existing.calendarData, client.absoluteUrl(taskId), existing.etag, existing.list);
  if (!parsed) throw new ApiError(500, 'Task could not be read');
  return parsed;
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
    start_at: task.start_at ?? null,
    reminder_at: task.reminder_at,
    parent_uid: task.parent_uid,
    priority: task.priority,
    sort_order: task.sort_order,
    pinned: task.pinned,
    rrule: task.rrule,
    attachments: task.attachments?.map(attachmentAsLink),
  };
}

/** Image-loading details for a Nextcloud account, or null when attachments are unsupported. */
export async function getAttachmentAccess(accountId: string | undefined): Promise<AttachmentAccess | null> {
  if (!accountId) return null;
  const account = (await getAccounts()).find((candidate) => candidate.id === accountId);
  if (!account || account.serverType !== 'nextcloud') return null;
  return new CalDavClient(account).attachmentAccess();
}

async function attachmentClient(taskId: string, accountId?: string) {
  if (isPendingTaskId(taskId) || isLocalTaskId(taskId)) {
    throw new ApiError(400, 'Files can only be attached to to-dos synced with Nextcloud.');
  }
  const client = await clientForTask(taskId, accountId);
  if (!isNextcloud(client)) {
    throw new ApiError(400, 'Files can only be attached to to-dos on a Nextcloud account.');
  }
  return client;
}

/**
 * Upload a file to the account's Nextcloud Files and link it from the task.
 * Offline, or for a to-do still waiting in the outbox, the file is copied into
 * the app's documents folder and queued; it resolves to null in that case.
 */
export async function addTaskAttachment(
  taskId: string,
  target: AttachmentTarget,
  file: AttachmentUpload,
  etag?: string | null
): Promise<Task | null> {
  if (isLocalTaskId(taskId)) {
    throw new ApiError(400, 'Files can only be attached to to-dos synced with Nextcloud.');
  }
  const account = (await getAccounts()).find((candidate) => candidate.id === target.account_id);
  if (!account) throw new ApiError(404, 'The account that owns this task is no longer configured.');
  if (account.serverType !== 'nextcloud') {
    throw new ApiError(400, 'Files can only be attached to to-dos on a Nextcloud account.');
  }
  const uploadId = randomUuid();
  const queue = async () => {
    const kept = await keepForOutbox(file, uploadId);
    try {
      await enqueue({
        kind: 'attachment',
        uploadId,
        taskId,
        taskUid: target.uid,
        taskTitle: target.title,
        accountId: account.id,
        accountName: target.account_name,
        file: kept,
      });
    } catch (error) {
      await dropOutboxFile(kept.uri);
      throw error;
    }
    return null;
  };
  if (isPendingTaskId(taskId) || knownOffline()) return queue();
  try {
    return await uploadAndLink(new CalDavClient(account), taskId, target.uid, file, uploadId, etag);
  } catch (error) {
    if (isNetworkError(error)) return queue();
    throw error;
  }
}

const processingAttachments = new Set<string>();

/** Sends one queued file, keeping its local copy until the server has linked it. */
export async function sendQueuedAttachment(entry: OutboxAttachmentEntry) {
  if (processingAttachments.has(entry.id)) return;
  processingAttachments.add(entry.id);
  try {
    const entries = await getEntries();
    if (!entries.some((candidate) => candidate.id === entry.id)) return;
    if (isPendingTaskId(entry.taskId) && entries.some((candidate) => candidate.id === pendingEntryId(entry.taskId))) {
      throw new ApiError(409, 'Waiting for its to-do to sync first.');
    }
    const account = (await getAccounts()).find((candidate) => candidate.id === entry.accountId);
    if (!account || account.serverType !== 'nextcloud') {
      throw new ApiError(404, 'The Nextcloud account for this file is no longer connected.');
    }
    const client = new CalDavClient(account);
    const href = await locateTask(client, entry);
    try {
      await uploadAndLink(client, href, entry.taskUid, entry.file, entry.uploadId);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 412)) throw error;
      await uploadAndLink(client, await locateTask(client, entry), entry.taskUid, entry.file, entry.uploadId);
    }
    await removeEntry(entry.id);
    await dropOutboxFile(entry.file.uri);
  } finally {
    processingAttachments.delete(entry.id);
  }
}

/** Discards a queued item and the local copies of its files. */
export async function discardQueued(entryId: string) {
  const entries = await getEntries();
  const entry = entries.find((candidate) => candidate.id === entryId);
  if (!entry) return;
  const files = entries.filter((candidate): candidate is OutboxAttachmentEntry =>
    candidate.kind === 'attachment' && (
      candidate.id === entryId || (entry.kind === 'task' && candidate.taskId === pendingTask(entry).id)
    )
  );
  if (files.some((file) => processingAttachments.has(file.id))) {
    throw new ApiError(409, 'This file is sending. Wait for it to finish before removing it.');
  }
  for (const file of files) processingAttachments.add(file.id);
  try {
    for (const file of files) {
      await removeEntry(file.id);
      await dropOutboxFile(file.file.uri);
    }
    if (entry.kind !== 'attachment') await removeEntry(entryId);
  } finally {
    for (const file of files) processingAttachments.delete(file.id);
  }
}

async function assertNoQueuedAttachments(uid: string, accountId: string | undefined) {
  const entries = await getEntries();
  if (entries.some((entry) => entry.kind === 'attachment' && entry.taskUid === uid && entry.accountId === accountId)) {
    throw new ApiError(409, 'Sync or discard the files waiting to upload before moving this to-do to another account.');
  }
}

/**
 * Downloads an attachment with the account's login into the app cache and
 * returns the local file URI, for handing to another app.
 */
export async function downloadTaskAttachment(accountId: string, attachment: TaskAttachment): Promise<string> {
  const account = (await getAccounts()).find((candidate) => candidate.id === accountId);
  if (!account || account.serverType !== 'nextcloud') {
    throw new ApiError(400, 'This file is a link to another account.');
  }
  const client = new CalDavClient(account);
  const access = await client.attachmentAccess();
  const url = attachmentFileUri(access, attachment);
  if (!url) throw new ApiError(400, 'This file is a link to another account.');
  const { Directory, File, Paths } = await import('expo-file-system');
  const folder = new Directory(Paths.cache, OPENED_FILES, safeFileName(account.id), safeFileName(attachment.file_id ?? randomUuid()));
  folder.create({ idempotent: true, intermediates: true });
  const destination = new File(folder, safeFileName(attachment.name) || 'file');
  const output = await File.downloadFileAsync(url, destination, {
    headers: access.headers,
    idempotent: true,
  });
  return output.uri;
}

async function uploadAndLink(
  client: CalDavClient, taskId: string, uid: string, file: AttachmentUpload, uploadId: string, etag?: string | null,
) {
  const existing = await client.fetchTaskByHref(taskId);
  const match = etag ?? existing.etag;
  const current = parseVtodo(existing.calendarData, client.absoluteUrl(taskId), existing.etag, existing.list);
  if (!current || current.uid !== uid) throw new ApiError(404, 'The to-do for this file could not be found.');
  const path = `/${attachmentFolder(uid)}/${uploadId}/${attachmentName(file.name)}`;
  if (current.attachments?.some((attachment) => attachment.path === path)) return current;

  const attachment = await client.uploadAttachment(uid, file, uploadId);
  const calendarData = addAttachment(updateVtodo(existing.calendarData, {}), attachment);
  let response: Response;
  try {
    response = await client.request('PUT', client.absoluteUrl(taskId), {
      body: calendarData,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        ...(match ? { 'If-Match': match } : {}),
      },
    });
  } catch (error) {
    // The server may have accepted a write whose response was lost. The queued
    // retry checks the ATTACH line before touching the staged file.
    if (!isNetworkError(error)) await client.deleteFile(path).catch(() => {});
    throw error;
  }
  const updated = parseVtodo(calendarData, client.absoluteUrl(taskId), response.headers.get('etag'), existing.list);
  if (!updated) throw new ApiError(500, 'Updated task could not be parsed');
  return updated;
}

/**
 * The task's current href. It may have changed since the file was queued: the
 * to-do was still in the outbox, or it moved to another list. Moves keep the
 * file name, so look for it in each of the account's lists.
 */
async function locateTask(client: CalDavClient, entry: OutboxAttachmentEntry) {
  if (!isPendingTaskId(entry.taskId)) {
    try {
      const found = await client.fetchTaskByHref(entry.taskId);
      if (parseVtodo(found.calendarData, entry.taskId, null, found.list)?.uid === entry.taskUid) return entry.taskId;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
  const fileName = isPendingTaskId(entry.taskId)
    ? `${entry.taskUid}.ics`
    : (new URL(entry.taskId).pathname.split('/').filter(Boolean).pop() ?? `${entry.taskUid}.ics`);
  for (const list of await client.listTaskCalendars()) {
    const href = client.absoluteUrl(`${list.href.replace(/\/+$/, '')}/${fileName}`);
    try {
      const found = await client.fetchTaskInList(href, list);
      if (parseVtodo(found.calendarData, href, null, found.list)?.uid === entry.taskUid) return href;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
  throw new ApiError(404, `"${entry.taskTitle}" is no longer on this account.`);
}

/** Copies a picked file somewhere it survives until the outbox sends it. */
async function keepForOutbox(file: AttachmentUpload, uploadId: string): Promise<AttachmentUpload> {
  const { Directory, File, Paths } = await import('expo-file-system');
  const folder = new Directory(Paths.document, OUTBOX_FILES);
  folder.create({ idempotent: true, intermediates: true });
  const copy = new File(folder, uploadId);
  await new File(file.uri).copy(copy);
  return { ...file, uri: copy.uri };
}

async function dropOutboxFile(uri: string) {
  try {
    const { Directory, File, Paths } = await import('expo-file-system');
    const folder = new Directory(Paths.document, OUTBOX_FILES).uri.replace(/\/$/, '');
    if (!uri.startsWith(`${folder}/`) || !/^[0-9a-f-]{36}$/i.test(uri.slice(folder.length + 1))) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

/**
 * Unlink an attachment. The file is deleted too, but only when Patchwork put
 * it in this task's own folder; files linked from elsewhere stay in Files.
 */
export async function removeTaskAttachment(
  taskId: string,
  attachment: TaskAttachment,
  accountId?: string,
  etag?: string | null
): Promise<Task> {
  const client = await attachmentClient(taskId, accountId);
  const existing = await client.fetchTaskByHref(taskId);
  const match = etag ?? existing.etag;
  const calendarData = removeAttachment(updateVtodo(existing.calendarData, {}), attachment.url);
  const response = await client.request('PUT', client.absoluteUrl(taskId), {
    body: calendarData,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      ...(match ? { 'If-Match': match } : {}),
    },
  });
  const updated = parseVtodo(calendarData, client.absoluteUrl(taskId), response.headers.get('etag'), existing.list);
  if (!updated) throw new ApiError(500, 'Updated task could not be parsed');
  const original = parseAttachments(existing.calendarData).find((item) => item.url === attachment.url);
  const path = original ? ownedAttachmentPath(updated.uid, original) : null;
  if (path) await client.deleteFile(path).catch(() => {});
  return updated;
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
    const principalTag = readTagText(found.xml, 'current-user-principal');
    const principalHref = principalTag ? readTagText(principalTag, 'href') : null;
    if (!principalHref) continue;
    const principal = new URL(principalHref, found.url).toString();
    if (!sameSite(principal, base)) continue;
    const homeSet = await propfind(principal, '<cal:calendar-home-set />');
    const homeTag = homeSet ? readTagText(homeSet.xml, 'calendar-home-set') : null;
    const homeHref = homeTag ? readTagText(homeTag, 'href') : null;
    if (!homeHref) continue;
    const home = new URL(homeHref, homeSet!.url).toString();
    if (!sameSite(home, base)) continue;
    return home.endsWith('/') ? home : `${home}/`;
  }
  return null;
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

  private userIdPromise: Promise<string> | null = null;

  /**
   * The Nextcloud user id, which names the Files WebDAV folder. It can differ
   * from the login name (email logins, LDAP), so ask the server.
   */
  async userId() {
    const key = `${USER_ID_KEY}${this.account.id}`;
    if (knownOffline()) return (await AsyncStorage.getItem(key).catch(() => null)) ?? this.username;
    this.userIdPromise ??= (async () => {
      const response = await this.request('PROPFIND', this.davRoot(), {
        body: `<d:propfind xmlns:d="${DAV_NS}"><d:prop><d:current-user-principal /></d:prop></d:propfind>`,
        headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
      });
      const principal = readTagText(await response.text(), 'current-user-principal');
      const href = principal ? readTagText(principal, 'href') : null;
      const segment = href?.replace(/\/+$/, '').split('/').pop();
      const id = segment ? decodeURIComponent(segment) : this.username;
      await AsyncStorage.setItem(key, id).catch(() => {});
      return id;
    })().catch(async (error) => {
      this.userIdPromise = null;
      // Offline, the last id the server gave still names the right folder, so
      // cached thumbnails load and files can be queued. Not memoised: the next
      // call online asks the server again.
      if (!isNetworkError(error)) throw error;
      const stored = await AsyncStorage.getItem(key).catch(() => null);
      return stored ?? this.username;
    });
    return this.userIdPromise;
  }

  async filesRoot() {
    return `${this.davRoot()}files/${encodeURIComponent(await this.userId())}/`;
  }

  async attachmentAccess(): Promise<AttachmentAccess> {
    return {
      serverRoot: this.serverRoot(),
      filesRoot: await this.filesRoot(),
      origin: this.origin,
      headers: { Authorization: this.authHeader, 'OCS-APIRequest': 'true' },
    };
  }

  private async ensureFolder(path: string) {
    try {
      await this.request('MKCOL', `${await this.filesRoot()}${encodePath(path)}/`);
    } catch (error) {
      // 405 Method Not Allowed: the folder already exists.
      if (!(error instanceof ApiError && error.status === 405)) throw error;
    }
  }

  /** Uploads a picked file to Files/Tasks/<uid>/ and returns the ATTACH entry for it. */
  async uploadAttachment(taskUid: string, file: AttachmentUpload, uploadId: string): Promise<TaskAttachment> {
    const { File } = await import('expo-file-system');
    const bytes = await new File(file.uri).arrayBuffer();
    return this.uploadFile(taskUid, bytes, file.name, file.mime, uploadId);
  }

  async uploadFile(taskUid: string, bytes: ArrayBuffer, fileName: string, mime: string, uploadId?: string): Promise<TaskAttachment> {
    const taskFolder = attachmentFolder(taskUid);
    const folder = uploadId ? `${taskFolder}/${uploadId}` : taskFolder;
    await this.ensureFolder(ATTACHMENT_FOLDER);
    await this.ensureFolder(taskFolder);
    if (uploadId) await this.ensureFolder(folder);
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
        const response = await this.request(
          'PUT',
          url,
          { body: bytes, headers: { 'Content-Type': mime, 'If-None-Match': '*' } },
          UPLOAD_TIMEOUT_MS
        );
        fileId = parseFileId(response.headers.get('oc-fileid'));
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 412)) throw error;
        if (!uploadId) continue;
        // This upload owns its own directory, so the file already exists from
        // an earlier attempt.
      }
      fileId ??= await this.fileIdOf(url);
      return {
        url: fileId ? `${this.serverRoot()}f/${fileId}` : url,
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
      const response = await this.request('PROPFIND', url, {
        body: `<d:propfind xmlns:d="${DAV_NS}" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid /></d:prop></d:propfind>`,
        headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
      });
      return readTagText(await response.text(), 'fileid');
    } catch {
      return null;
    }
  }

  async downloadFile(path: string) {
    const response = await this.request(
      'GET',
      `${await this.filesRoot()}${encodePath(path.replace(/^\/+/, ''))}`,
      {},
      UPLOAD_TIMEOUT_MS
    );
    return { bytes: await response.arrayBuffer(), mime: response.headers.get('content-type') };
  }

  async deleteFile(path: string) {
    try {
      await this.request('DELETE', `${await this.filesRoot()}${encodePath(path.replace(/^\/+/, ''))}`);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
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
  // VTIMEZONE goes too: its STANDARD/DAYLIGHT parts carry their own RRULE and DTSTART.
  const fields = parseIcs(calendarData.replace(SUBCOMPONENT_BLOCK, ''));
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
    // A DTSTART equal to DUE only anchors a repeat; it isn't a time block.
    start_at: startsAt && startsAt !== dueAt ? startsAt : null,
    reminder_at: reminderAt,
    tags: icsTextList(fields, 'CATEGORIES'),
    sort_order: parseOptionalInt(icsRaw(fields, 'X-APPLE-SORT-ORDER')),
    pinned: /^(TRUE|1)$/i.test(icsRaw(fields, 'X-PATCHWORK-PINNED') ?? ''),
    rrule: icsRaw(fields, 'RRULE')?.trim() || null,
    parent_uid: icsText(fields, 'RELATED-TO') ?? null,
    children: [],
    etag,
    updated_at: parseIcsDate(icsField(fields, 'LAST-MODIFIED')),
    attachments: parseAttachments(calendarData),
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
  if (task.pinned) lines.push('X-PATCHWORK-PINNED:TRUE');
  // DTSTART is the start of the time block, or for a repeat with no block,
  // the due date: RFC 5545 counts a series from DTSTART.
  const start = task.start_at ?? (task.rrule ? task.due_at : null);
  if (start) lines.push(`DTSTART:${formatIcsDate(start)}`);
  if (task.rrule) lines.push(`RRULE:${sanitizeRrule(task.rrule)}`);
  const tags = normalizeTags(task.tags ?? []);
  if (tags.length) lines.push(`CATEGORIES:${serializeIcsList(tags)}`);
  if (task.parent_uid) lines.push(`RELATED-TO:${escapeIcs(task.parent_uid)}`);
  if (task.reminder_at) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeIcs(task.title)}`, `TRIGGER:${formatIcsDate(task.reminder_at)}`, 'END:VALARM');
  }
  lines.push('END:VTODO', 'END:VCALENDAR', '');
  let calendarData = foldIcs(lines.join('\r\n'));
  for (const attachment of task.attachments ?? []) calendarData = addAttachment(calendarData, attachmentAsLink(attachment));
  return { uid, calendarData };
}

export function updateVtodo(calendarData: string, patch: TaskUpdate) {
  // VALARM carries its own DESCRIPTION, so field edits run against a copy with
  // the alarm blocks masked out — otherwise `setIcsField` can rewrite the
  // alarm's text instead of the task's notes on VTODOs written by other
  // clients (which are free to put VALARM before DESCRIPTION).
  let next = editVtodoBody(calendarData, (body) => {
    let draft = body;
    // The block start as it stands, read before the due date moves.
    const before = parseIcs(body.replace(SUBCOMPONENT_BLOCK, ''));
    const startNow = parseIcsDate(icsField(before, 'DTSTART'));
    const currentBlockStart = startNow && startNow !== parseIcsDate(icsField(before, 'DUE')) ? startNow : null;
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
    if (patch.pinned !== undefined) draft = setIcsField(draft, 'X-PATCHWORK-PINNED', patch.pinned ? 'TRUE' : null, false);
    if (patch.rrule !== undefined) {
      draft = setIcsField(draft, 'RRULE', patch.rrule ? sanitizeRrule(patch.rrule) : null, false);
    }
    // DTSTART is the start of the time block. Without one, a repeat keeps it
    // on the due date (RFC 5545 counts a series from DTSTART) so other clients
    // agree on which day the series falls after we move it forward.
    if (patch.start_at !== undefined || patch.due_at !== undefined || patch.rrule !== undefined) {
      const start = patch.start_at !== undefined ? patch.start_at : (currentBlockStart ?? null);
      const due = patch.due_at !== undefined ? patch.due_at : parseIcsDate(icsField(parseIcs(draft), 'DUE'));
      if (start) {
        draft = setIcsField(draft, 'DTSTART', formatIcsDate(start), false);
      } else if (/^RRULE[:;]/im.test(draft)) {
        draft = setIcsField(draft, 'DTSTART', due ? formatIcsDate(due) : null, false);
      } else if (patch.start_at !== undefined) {
        draft = setIcsField(draft, 'DTSTART', null, false);
      }
    }
    return setIcsField(draft, 'LAST-MODIFIED', formatIcsDate(new Date().toISOString()), false);
  });
  if (patch.reminder_at !== undefined) next = setVAlarm(next, patch.reminder_at, patch.title);
  // setIcsField writes each value on one line; long notes and URLs need folding.
  return foldIcs(next);
}

const ALARM_SLOT = 'X-PATCHWORK-VALARM-SLOT';
/**
 * Sub-components whose properties must never be mistaken for the VTODO's own:
 * VALARM has a DESCRIPTION, VTIMEZONE has RRULE and DTSTART.
 */
const SUBCOMPONENT_BLOCK = /BEGIN:(VALARM|VTIMEZONE)\r?\n[\s\S]*?END:\1/gi;

/** Runs `edit` over the VTODO with VALARM sub-components swapped for placeholders. */
function editVtodoBody(calendarData: string, edit: (body: string) => string) {
  const alarms: string[] = [];
  const masked = calendarData.replace(SUBCOMPONENT_BLOCK, (match) => {
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
  return withoutAlarm.replace(/^END:VTODO(?=\r?$)/im, (end) => `${alarm}\r\n${end}`);
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
  return calendarData.replace(/^END:VTODO(?=\r?$)/im, (end) => `${line}\r\n${end}`);
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

/** RRULE values are written raw, so strip anything that could break the line. */
function sanitizeRrule(value: string) {
  return value.replace(/^RRULE:/i, '').replace(/[^A-Za-z0-9=;,+\-]/g, '').toUpperCase();
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

function attachmentFolder(taskUid: string) {
  return `${ATTACHMENT_FOLDER}/${safeFileName(taskUid)}`;
}

/** Attachments Patchwork uploaded into this task's own folder, which it may move or delete. */
function ownedAttachmentPath(uid: string, attachment: TaskAttachment) {
  const folder = `/${attachmentFolder(uid)}/`;
  const path = attachment.path;
  if (!path?.startsWith(folder)) return null;
  const parts = path.slice(folder.length).split('/');
  const name = parts.at(-1);
  if (!name || name === '.' || name === '..' || name.includes('\\')) return null;
  return parts.length === 1 || (parts.length === 2 && /^[0-9a-f-]{36}$/i.test(parts[0])) ? path : null;
}

function ownedAttachments(task: Pick<Task, 'uid' | 'attachments'>) {
  return (task.attachments ?? []).flatMap((attachment) => {
    const path = ownedAttachmentPath(task.uid, attachment);
    return path ? [{ ...attachment, path }] : [];
  });
}

function isNextcloud(client: CalDavClient) {
  return client.account.serverType === 'nextcloud';
}

/**
 * Copies a task's own images to another Nextcloud account and points its
 * ATTACH lines at the copies. Links to anything else are left as they are.
 */
async function copyAttachments(source: CalDavClient, destination: CalDavClient, calendarData: string, task: Pick<Task, 'uid' | 'attachments'>) {
  let next = calendarData;
  const copied: TaskAttachment[] = [];
  try {
    for (const attachment of ownedAttachments(task)) {
      const file = await source.downloadFile(attachment.path);
      const copy = await destination.uploadFile(
        task.uid,
        file.bytes,
        attachment.name,
        attachment.mime ?? file.mime ?? 'application/octet-stream'
      );
      copied.push(copy);
      next = addAttachment(removeAttachment(next, attachment.url), copy);
    }
  } catch (error) {
    await deleteCopiedFiles(destination, copied);
    throw error;
  }
  return { calendarData: next, copied };
}

async function deleteCopiedFiles(client: CalDavClient, copies: TaskAttachment[]) {
  await Promise.all(copies.map(({ path }) => path && client.deleteFile(path).catch(() => {})));
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function attachmentName(name: string) {
  return safeFileName(name) || 'file';
}

/** One path segment: no slashes, control characters, or names Nextcloud rejects. */
function safeFileName(name: string) {
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
