import { CalDavClient } from '@/api/caldav/client';
import { parseVtodo, serializeVtodo, updateVtodo } from '@/api/caldav/vtodo';
import { NextcloudFiles, attachmentFolder, attachmentName, safeFileName } from '@/api/nextcloud-files';
import { randomUuid } from '@/lib/uuid';
import { buildTaskTree } from './model';
import { ApiError } from '@/api/error';
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
} from '@/api/types';
import { APPLE_ACCOUNT_ID, isAppleListId, isAppleTaskId } from '@/lib/apple-reminders-ids';
import { isNetworkError, knownOffline } from '@/features/sync/connectivity';
import { getAccounts } from '@/lib/credentials';
import { addAttachment, attachmentAsLink, parseAttachments, removeAttachment } from '@/api/caldav/ics-attachments';
import { attachmentFileUri } from '@/lib/attachment-urls';
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
} from '@/features/tasks/local-tasks';
import {
  enqueue,
  getEntries,
  isPendingTaskId,
  pendingEntryId,
  pendingTask,
  withOutboxEntry,
  updateEntry,
  type OutboxAttachmentEntry,
  type OutboxTaskEntry,
} from '@/features/sync/outbox';
import { originOf } from '@/lib/secure-url';

/** App documents subfolder holding files picked offline until they upload. */

const OUTBOX_FILES = 'outbox-attachments';
/** App cache subfolder for attachments downloaded to open in another app. */
const OPENED_FILES = 'attachments';
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
  if (lists.length === 0) throw firstRejected(results) ?? new ApiError(404, 'No task lists found.');
  return lists;
}

export interface TaskSnapshot {
  tasks: Task[];
  complete: boolean;
  warnings: string[];
}

export async function fetchTaskSnapshot(): Promise<TaskSnapshot> {
  const accounts = await getAccounts();
  const clients = accounts.map((account) => new CalDavClient(account));
  const [results, localLists, localTasks, outbox, appleTasks] = await Promise.all([
    Promise.allSettled(
      clients.map(async (client) => {
        const lists = await client.listTaskCalendars();
        const listResults = await Promise.allSettled(
          lists.map((list) => client.listCalendarTasks(list))
        );
        if (listResults.length > 0 && listResults.every((result) => result.status === 'rejected')) {
          throw firstRejected(listResults) ?? new ApiError(502, 'Task lists could not be synchronized.');
        }
        return { lists, listResults };
      })
    ),
    localListsToShow(accounts.length === 0),
    getLocalTasks(),
    getEntries().catch(() => null),
    apple().then((module) => module.getAppleTasks()).catch(() => null),
  ]);

  // Tasks saved offline join their account's tree, so a pending checklist item
  // still sits under its parent.
  const pending = (outbox ?? []).flatMap((entry) => (entry.kind === 'task' ? [pendingTask(entry)] : []));
  const pendingFor = (accountId: string | undefined) =>
    pending.filter((task) => task.account_id === accountId);

  const tasks: Task[] = [];
  const warnings: string[] = [];
  let offline = false;
  let complete = outbox !== null && appleTasks !== null;
  let failedWithoutCache = 0;
  for (const [index, result] of results.entries()) {
    const account = accounts[index];
    let flat: Task[];
    if (result.status === 'fulfilled') {
      const { lists, listResults } = result.value;
      const failedLists = new Set(lists.filter((_, i) => listResults[i].status === 'rejected').map((list) => list.id));
      if (failedLists.size > 0) complete = false;
      const cached = failedLists.size ? await cachedRemoteTasks(account.id) : null;
      flat = listResults.flatMap((listResult) => listResult.status === 'fulfilled' ? listResult.value : []);
      flat.push(...(cached ?? []).filter((task) => failedLists.has(task.list_id)));
      warnings.push(...rejectionMessages(listResults));
      void cacheRemoteTasks(account.id, flat).catch(() => {});
    } else {
      complete = false;
      const cached = await cachedRemoteTasks(account.id);
      if (cached) {
        if (isNetworkError(result.reason)) offline = true;
        else warnings.push(errorMessage(result.reason));
        flat = cached;
      } else {
        failedWithoutCache += 1;
        warnings.push(errorMessage(result.reason));
        flat = [];
      }
    }
    // Build the parent/child tree per account so RELATED-TO uids never
    // collide across servers.
    tasks.push(...buildTaskTree([...flat, ...pendingFor(account.id)]));
  }
  const knownAccounts = new Set(accounts.map((account) => account.id));
  const orphans = pending.filter((task) => !task.account_id || !knownAccounts.has(task.account_id));
  tasks.push(...buildTaskTree(localTasks), ...buildTaskTree(orphans), ...(appleTasks ?? []));

  if (offline) warnings.unshift(OFFLINE_WARNING);
  if (tasks.length === 0 && localLists.length === 0 && failedWithoutCache > 0) {
    throw firstRejected(results) ?? new ApiError(404, 'No tasks found.');
  }
  return { tasks, complete, warnings };
}

export async function fetchTasks() {
  return (await fetchTaskSnapshot()).tasks;
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
  return createTaskWithTarget(payload, () => resolveListTarget(payload.list_id));
}

async function createTaskWithTarget(payload: TaskCreate, resolve: () => ReturnType<typeof resolveListTarget>): Promise<Task> {
  if (isLocalListId(payload.list_id)) return createLocalTask(payload);
  if (isAppleListId(payload.list_id)) {
    if (payload.parent_uid) throw new ApiError(400, 'Apple Reminders has no checklists, so this item can\'t go under a reminder.');
    return (await apple()).createAppleTask(payload);
  }
  const withUid = { ...payload, uid: payload.uid ?? randomUuid() };
  if (knownOffline()) return queueTask(withUid);
  try {
    return await writeRemoteTask(withUid, await resolve());
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    return queueTask(withUid);
  }
}

export interface TaskCreationProgress {
  parent: Task;
  completedSubtasks: Set<number>;
}

export async function createTaskWithChecklist(
  payload: TaskCreate,
  checklist: readonly { title: string; markdown?: string }[],
  existing?: TaskCreationProgress,
) {
  let target: ReturnType<typeof resolveListTarget> | undefined;
  const create = (task: TaskCreate) =>
    createTaskWithTarget(task, () => target ??= resolveListTarget(task.list_id).catch((error) => {
      target = undefined;
      throw error;
    }));

  const progress = existing ?? { parent: await create(payload), completedSubtasks: new Set<number>() };
  const failed: { title: string; message: string }[] = [];
  for (const [index, item] of checklist.entries()) {
    if (progress.completedSubtasks.has(index) || !item.title.trim()) continue;
    try {
      await create({
        list_id: progress.parent.list_id,
        parent_uid: progress.parent.uid,
        title: item.title.trim(),
        markdown: item.markdown,
        sort_order: index,
      });
      progress.completedSubtasks.add(index);
    } catch (error) {
      failed.push({ title: item.title, message: errorMessage(error) });
    }
  }
  return { progress, failed };
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
  return writeRemoteTask(payload, await resolveListTarget(payload.list_id));
}

async function writeRemoteTask(payload: TaskCreate, { client, target }: Awaited<ReturnType<typeof resolveListTarget>>) {
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
    if (serverRejectedWrite(error)) await deleteCopiedFiles(client, copied.copied);
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
      await deleteMoveSource(client, taskId, etag);
    } catch (error) {
      if (serverRejectedWrite(error)) await deleteLocalTask(moved.id);
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
      && (await new NextcloudFiles(client).filesRoot()) === (await new NextcloudFiles(destination.client).filesRoot());
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
      if (carry && serverRejectedWrite(error)) await deleteCopiedFiles(destination.client, carry.copied);
      throw error;
    });

    try {
      await deleteMoveSource(client, taskId, etag);
    } catch (error) {
      const copiedEtag = copied.headers.get('etag');
      if (serverRejectedWrite(error) && copiedEtag) {
        const removed = await destination.client.request('DELETE', destinationUrl, {
          headers: { 'If-Match': copiedEtag },
        }).then(() => true, () => false);
        if (removed && carry) await deleteCopiedFiles(destination.client, carry.copied);
      }
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
      ...(etag ? { 'If-Match': etag } : {}),
    },
  });
  const updated = parseVtodo(calendarData, client.absoluteUrl(taskId), response.headers.get('etag'), existing.list);
  if (!updated) {
    throw new ApiError(500, 'Updated task could not be parsed');
  }
  return updated;
}

function serverRejectedWrite(error: unknown) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408;
}

async function deleteMoveSource(client: CalDavClient, taskId: string, etag?: string | null) {
  const url = client.absoluteUrl(taskId);
  try {
    await client.request('DELETE', url, { headers: etag ? { 'If-Match': etag } : undefined });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return;
    if (serverRejectedWrite(error)) throw error;
    const missing = await client.request('GET', url).then(
      () => false,
      (probeError: unknown) => probeError instanceof ApiError && probeError.status === 404,
    );
    if (!missing) {
      throw new ApiError(503, 'Could not confirm the move. The destination copy was kept. Refresh both lists to check the originals.', error);
    }
  }
}

export async function deleteTask(taskId: string, accountId?: string, etag?: string | null) {
  if (isAppleTaskId(taskId)) return (await apple()).deleteAppleTask(taskId);
  if (isPendingTaskId(taskId)) return discardQueued(pendingEntryId(taskId));
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
    const listId = fields.list_id;
    const moved = await withOutboxEntry(id, async (entry, locked) => {
      if (entry.kind !== 'task') return;
      const task = await createLocalTask({ ...entry.payload, ...fields, list_id: listId });
      const attachments = queuedAttachments(await getEntries(), taskId);
      try {
        await locked.remove(attachments.map((file) => file.id));
      } catch (error) {
        await deleteLocalTask(task.id);
        throw error;
      }
      await Promise.all(attachments.map((attachment) => dropOutboxFile(attachment.file.uri)));
      return task;
    });
    if (!moved) throw new ApiError(409, 'This to-do is syncing or has already been sent.');
    return moved;
  }
  if (fields.list_id) {
    const entry = (await getEntries()).find((candidate) => candidate.id === id);
    if (entry?.kind === 'task' && fields.list_id.split(':')[0] !== entry.accountId) {
      await assertNoQueuedAttachments(entry.payload.uid, entry.accountId);
    }
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
    await deleteTask(taskId, accountId, source.etag);
  } catch (error) {
    if (serverRejectedWrite(error)) await (await apple()).deleteAppleTask(created.id).catch(() => {});
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
  return new NextcloudFiles(new CalDavClient(account)).attachmentAccess();
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

/** Sends one queued file, keeping its local copy until the server has linked it. */
export async function sendQueuedAttachment(entry: OutboxAttachmentEntry) {
  if (isPendingTaskId(entry.taskId) && (await getEntries()).some((item) => item.id === pendingEntryId(entry.taskId))) {
    throw new ApiError(409, 'Waiting for its to-do to sync first.');
  }
  const account = (await getAccounts()).find((candidate) => candidate.id === entry.accountId);
  if (!account || account.serverType !== 'nextcloud') {
    throw new ApiError(404, 'The Nextcloud account for this file is no longer connected.');
  }
  const client = new CalDavClient(account);
  const uploadId = entry.uploadId ?? entry.operationId ?? entry.id;
  try {
    await uploadAndLink(client, await locateTask(client, entry), entry.taskUid, entry.file, uploadId);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 412)) throw error;
    await uploadAndLink(client, await locateTask(client, entry), entry.taskUid, entry.file, uploadId);
  }
}

/**
 * Remove something from the outbox along with what hangs off it: a queued
 * file's local copy, or a pending to-do's queued files.
 */
export async function discardQueued(entryId: string) {
  const discarded = await withOutboxEntry(entryId, async (entry, locked) => {
    const children = entry.kind === 'task' ? queuedAttachments(await getEntries(), pendingTask(entry).id) : [];
    await locked.remove(children.map((child) => child.id));
    if (entry.kind === 'attachment') await dropOutboxFile(entry.file.uri);
    await Promise.all(children.map((child) => dropOutboxFile(child.file.uri)));
    return true;
  });
  if (!discarded && (await getEntries()).some((entry) => entry.id === entryId)) {
    throw new ApiError(409, 'This change is syncing. Try again when it finishes.');
  }
}

function queuedAttachments(entries: Awaited<ReturnType<typeof getEntries>>, taskId: string) {
  return entries.filter((entry): entry is OutboxAttachmentEntry =>
    entry.kind === 'attachment' && entry.taskId === taskId,
  );
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
  const access = await new NextcloudFiles(client).attachmentAccess();
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
  if (etag && existing.etag && etag !== existing.etag) {
    throw new ApiError(412, 'This task changed on the server. Refresh it before adding the file.');
  }
  const path = `/${attachmentFolder(uid)}/${safeFileName(uploadId)}/${attachmentName(file.name)}`;
  if (current.attachments?.some((attachment) => attachment.path === path)) return current;

  const attachment = await new NextcloudFiles(client).uploadAttachment(uid, file, uploadId);
  const calendarData = addAttachment(updateVtodo(existing.calendarData, {}), attachment);
  const response = await client.request('PUT', client.absoluteUrl(taskId), {
      body: calendarData,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        ...(match ? { 'If-Match': match } : {}),
      },
    });
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

export async function dropOutboxFile(uri: string) {
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
 * Unlink an attachment while keeping its file available in Nextcloud Files.
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
  return updated;
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

/** Attachments Patchwork uploaded into this task's own folder, which it may move or delete. */
function ownedAttachmentPath(uid: string, attachment: TaskAttachment) {
  if (!uid || safeFileName(uid) !== uid) return null;
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
      const blob = await new NextcloudFiles(source).downloadFile(attachment.path);
      const copy = await new NextcloudFiles(destination).uploadBlob(
        task.uid,
        blob,
        attachment.name,
        attachment.mime ?? (blob.type || 'application/octet-stream'),
        randomUuid()
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
  await Promise.all(copies.map(({ path }) => path && new NextcloudFiles(client).deleteFile(path).catch(() => {})));
}
