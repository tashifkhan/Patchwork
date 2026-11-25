import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { taskKey, taskLink, taskRef, type Task, type TaskRef } from '@/features/tasks/model';
import { useSettingsStore } from '@/stores/settings-store';

import { parseDate } from './format';
import { reminderBody, reminderTimes } from './reminder-offsets';

type NotificationsModule = typeof import('expo-notifications');

let notificationsPromise: Promise<NotificationsModule | null> | null = null;
const REMINDER_KEY_PREFIX = 'patchwork.reminder.';
const SCOPED_REMINDER_PREFIX = 'patchwork.task-reminder.v2.';

function isReminderKey(key: string) {
  return key.startsWith(REMINDER_KEY_PREFIX) || key.startsWith(SCOPED_REMINDER_PREFIX);
}

/** The notifications scheduled for one task (several with multiple default reminders). */
interface StoredReminder {
  notificationIds: string[];
  signature: string;
}

function canUseNotifications() {
  return !(Platform.OS === 'web' || (Platform.OS === 'android' && Constants.appOwnership === 'expo'));
}

async function getNotifications() {
  if (!canUseNotifications()) return null;

  notificationsPromise ??= import('expo-notifications')
    .then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      return Notifications;
    })
    .catch(() => null);

  return notificationsPromise;
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  const Notifications = await getNotifications();
  if (!Notifications) return false;

  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const request = await Notifications.requestPermissionsAsync();
  return request.granted;
}

async function syncTaskReminder(params: {
  ref: TaskRef;
  title: string;
  reminderAt: string | null;
  dueAt?: string | null;
}): Promise<string | null> {
  const Notifications = await getNotifications();
  const key = reminderStorageKey(params.ref);
  const stored = await readStoredReminder(key);
  const { notificationsEnabled, defaultReminderOffsets } = useSettingsStore.getState();
  // The task's own reminder wins; otherwise one per default before the due time.
  const times = reminderTimes({
    reminderAt: parseDate(params.reminderAt),
    dueAt: parseDate(params.dueAt ?? null),
    offsets: defaultReminderOffsets,
  });

  if (!Notifications || !notificationsEnabled || times.length === 0) {
    if (stored) await cancelReminders(stored.notificationIds);
    await AsyncStorage.removeItem(key);
    return null;
  }

  const signature = [params.title, ...times.map((time) => time.date.toISOString())].join('\n');
  if (stored?.signature === signature) return stored.notificationIds[0] ?? null;
  if (stored) await cancelReminders(stored.notificationIds);

  const granted = await ensureNotificationPermissions();
  if (!granted) return null;

  const notificationIds: string[] = [];
  for (const time of times) {
    const body = reminderBody(time.offset);
    notificationIds.push(
      await Notifications.scheduleNotificationAsync({
        content: {
          title: params.title,
          body: body ?? 'Task reminder',
          data: {
            taskUid: params.ref.uid,
            taskAccount: params.ref.account ?? null,
            taskList: params.ref.list ?? null,
            href: taskLink(params.ref),
          },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: time.date },
      })
    );
  }
  await AsyncStorage.setItem(key, JSON.stringify({ notificationIds, signature } satisfies StoredReminder));
  return notificationIds[0] ?? null;
}

/** A single notification at `date` that isn't tied to a task (the focus timer). */
export async function scheduleOneOffNotification(params: {
  title: string;
  body: string;
  date: Date;
}): Promise<string | null> {
  const Notifications = await getNotifications();
  if (!Notifications || params.date.getTime() <= Date.now()) return null;
  if (!(await ensureNotificationPermissions())) return null;
  return Notifications.scheduleNotificationAsync({
    content: { title: params.title, body: params.body, data: { href: '/pomodoro' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: params.date },
  }).catch(() => null);
}

const DAILY_KEY_PREFIX = 'patchwork.daily.';

/**
 * Replaces the repeating daily notifications stored under `key` with one per
 * `HH:MM` in `times`. An empty list (or notifications off) just cancels them.
 */
export function syncDailyNotifications(
  key: string,
  times: string[],
  content: { title: string; body: string; href: string }
): Promise<void> {
  // One run at a time: each run cancels what the last one stored, so
  // overlapping runs would leave unstored (uncancellable) repeats behind.
  const run = dailyQueue.then(() => syncDailyNow(key, times, content));
  dailyQueue = run.catch(() => {});
  return run;
}

let dailyQueue: Promise<void> = Promise.resolve();

async function syncDailyNow(
  key: string,
  times: string[],
  content: { title: string; body: string; href: string }
): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  const storageKey = `${DAILY_KEY_PREFIX}${key}`;
  const previous = await AsyncStorage.getItem(storageKey).catch(() => null);
  const ids = new Set<string>(previous ? (JSON.parse(previous) as string[]) : []);
  // Also anything scheduled under this key that we lost track of (an
  // interrupted sync, an app update): every daily repeat carries its key.
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const request of scheduled) {
    const data = request.content.data;
    // `href` catches repeats scheduled before the `daily` tag existed.
    if (data?.daily === key || data?.href === content.href) ids.add(request.identifier);
  }
  await cancelReminders([...ids]);
  await AsyncStorage.removeItem(storageKey);
  if (times.length === 0 || !useSettingsStore.getState().notificationsEnabled) return;
  if (!(await ensureNotificationPermissions())) return;
  const next: string[] = [];
  for (const time of times) {
    const [hour, minute] = time.split(':').map((part) => Number.parseInt(part, 10));
    if (!(hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59)) continue;
    next.push(
      await Notifications.scheduleNotificationAsync({
        content: { title: content.title, body: content.body, data: { href: content.href, daily: key } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
      })
    );
  }
  await AsyncStorage.setItem(storageKey, JSON.stringify(next));
}

async function cancelReminders(notificationIds: string[]): Promise<void> {
  await Promise.allSettled(notificationIds.map((id) => cancelReminder(id)));
}

export async function cancelReminder(notificationId: string | null): Promise<void> {
  if (!notificationId) return;

  const Notifications = await getNotifications();
  if (!Notifications) return;

  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export function cancelTaskReminder(ref: TaskRef): Promise<void> {
  return cancelStoredReminder(reminderStorageKey(ref));
}

async function cancelStoredReminder(key: string): Promise<void> {
  const stored = await readStoredReminder(key);
  if (stored) await cancelReminders(stored.notificationIds);
  await AsyncStorage.removeItem(key);
}

export async function cancelAllTaskReminders(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter(isReminderKey);
  const reminders = await AsyncStorage.multiGet(keys);
  await Promise.allSettled(
    reminders.map(([, value]) => {
      if (!value) return Promise.resolve();
      try {
        return cancelReminders(parseStoredReminder(JSON.parse(value))?.notificationIds ?? []);
      } catch {
        return Promise.resolve();
      }
    })
  );
  if (keys.length) await AsyncStorage.multiRemove(keys);
}

/**
 * Brings every task's reminders in line with the task list. Runs one at a
 * time: two overlapping runs (a quick refetch after a save) each found no
 * stored record and both scheduled, leaving duplicate reminders behind.
 */
export function syncTaskReminders(tasks: Task[], complete: boolean): Promise<void> {
  const run = reminderQueue.then(() => syncTaskRemindersNow(tasks, complete));
  reminderQueue = run.catch(() => {});
  return run;
}

let reminderQueue: Promise<void> = Promise.resolve();

async function syncTaskRemindersNow(tasks: Task[], complete: boolean): Promise<void> {
  const flat = flattenTasks(tasks);
  const activeKeys = new Set(flat.map((task) => reminderStorageKey(taskRef(task))));
  const allKeys = (await AsyncStorage.getAllKeys()).filter(isReminderKey);
  const legacyKeys = new Set(flat.map((task) => `${REMINDER_KEY_PREFIX}${task.uid}`));
  await Promise.allSettled(allKeys.filter((key) => legacyKeys.has(key)).map(cancelStoredReminder));
  const storedKeys = complete
    ? allKeys.filter((key) => !legacyKeys.has(key))
    : [];
  await Promise.allSettled([
    ...flat.map((task) =>
      task.completed
        ? cancelTaskReminder(taskRef(task))
        : syncTaskReminder({
            ref: taskRef(task),
            title: task.title,
            reminderAt: task.reminder_at,
            dueAt: task.due_at,
          })
    ),
    ...storedKeys
      .filter((key) => !activeKeys.has(key))
      .map(cancelStoredReminder),
  ]);
  await sweepUntrackedTaskReminders();
}

/** Cancels task reminders that no stored record knows about (left by an earlier race). */
async function sweepUntrackedTaskReminders() {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const tracked = new Map<string, Set<string>>();
  for (const request of scheduled) {
    const data = request.content.data;
    const uid = data?.taskUid;
    if (typeof uid !== 'string' || !uid) continue;
    const account = typeof data?.taskAccount === 'string' ? data.taskAccount : undefined;
    const list = typeof data?.taskList === 'string' ? data.taskList : undefined;
    const key = reminderStorageKey({ uid, account, list });
    if (!tracked.has(key)) {
      const stored = await readStoredReminder(key);
      tracked.set(key, new Set(stored?.notificationIds ?? []));
    }
    if (!tracked.get(key)!.has(request.identifier)) await cancelReminder(request.identifier).catch(() => {});
  }
}

export async function startNotificationResponseObserver(
  onOpenTask: (ref: TaskRef) => void,
  onHref?: (href: string) => void
): Promise<() => void> {
  const Notifications = await getNotifications();
  if (!Notifications) return () => {};

  let lastResponseId: string | null = null;
  const handleResponse = (response: Awaited<ReturnType<typeof Notifications.getLastNotificationResponseAsync>>) => {
    if (!response || response.notification.request.identifier === lastResponseId) return;
    lastResponseId = response.notification.request.identifier;
    const data = response.notification.request.content.data;
    const uid = data?.taskUid;
    const account = typeof data?.taskAccount === 'string' ? data.taskAccount : undefined;
    const list = typeof data?.taskList === 'string' ? data.taskList : undefined;
    if (typeof uid === 'string' && uid) onOpenTask({ uid, account, list });
    else if (typeof data?.href === 'string' && data.href.startsWith('/')) onHref?.(data.href);
  };

  handleResponse(await Notifications.getLastNotificationResponseAsync());
  const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
  return () => subscription.remove();
}

function reminderStorageKey(ref: TaskRef) {
  return `${SCOPED_REMINDER_PREFIX}${encodeURIComponent(taskKey(ref))}`;
}

async function readStoredReminder(key: string): Promise<StoredReminder | null> {
  const value = await AsyncStorage.getItem(key);
  if (!value) return null;
  try {
    return parseStoredReminder(JSON.parse(value));
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

function flattenTasks(tasks: Task[]): Task[] {
  return tasks.flatMap((task) => [task, ...flattenTasks(task.children)]);
}

/** Reads both shapes: `{ notificationIds }` now, `{ notificationId }` from before multiple reminders. */
function parseStoredReminder(value: unknown): StoredReminder | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { notificationIds?: unknown; notificationId?: unknown; signature?: unknown };
  if (typeof record.signature !== 'string') return null;
  const ids = Array.isArray(record.notificationIds)
    ? record.notificationIds.filter((id): id is string => typeof id === 'string')
    : typeof record.notificationId === 'string'
      ? [record.notificationId]
      : [];
  return ids.length > 0 ? { notificationIds: ids, signature: record.signature } : null;
}
