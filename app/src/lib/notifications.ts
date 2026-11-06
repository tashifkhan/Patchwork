import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Task } from '@/api/types';
import { useSettingsStore } from '@/stores/settings-store';

import { parseDate } from './format';
import { reminderBody, reminderTimes } from './reminder-offsets';

type NotificationsModule = typeof import('expo-notifications');

let notificationsPromise: Promise<NotificationsModule | null> | null = null;
const REMINDER_KEY_PREFIX = 'patchwork.reminder.';

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

// Schedules a task's local reminders and returns the first notification id.
// Stored against the task UID so they can be cancelled/rescheduled later.
export async function scheduleTaskReminder(params: {
  taskUid: string;
  title: string;
  reminderAt: string | null;
  dueAt?: string | null;
}): Promise<string | null> {
  return syncTaskReminder(params);
}

export async function syncTaskReminder(params: {
  taskUid: string;
  title: string;
  reminderAt: string | null;
  dueAt?: string | null;
}): Promise<string | null> {
  const Notifications = await getNotifications();
  const key = reminderStorageKey(params.taskUid);
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
          data: { taskUid: params.taskUid, href: `/task/${encodeURIComponent(params.taskUid)}` },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: time.date },
      })
    );
  }
  await AsyncStorage.setItem(key, JSON.stringify({ notificationIds, signature } satisfies StoredReminder));
  return notificationIds[0] ?? null;
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

export async function cancelTaskReminder(taskUid: string): Promise<void> {
  const key = reminderStorageKey(taskUid);
  const stored = await readStoredReminder(key);
  if (stored) await cancelReminders(stored.notificationIds);
  await AsyncStorage.removeItem(key);
}

export async function cancelAllTaskReminders(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(REMINDER_KEY_PREFIX));
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

export async function syncTaskReminders(tasks: Task[]): Promise<void> {
  const flat = flattenTasks(tasks);
  const activeUids = new Set(flat.map((task) => task.uid));
  const storedKeys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(REMINDER_KEY_PREFIX));
  await Promise.allSettled([
    ...flat.map((task) =>
      task.completed
        ? cancelTaskReminder(task.uid)
        : syncTaskReminder({
            taskUid: task.uid,
            title: task.title,
            reminderAt: task.reminder_at,
            dueAt: task.due_at,
          })
    ),
    ...storedKeys
      .filter((key) => !activeUids.has(key.slice(REMINDER_KEY_PREFIX.length)))
      .map((key) => cancelTaskReminder(key.slice(REMINDER_KEY_PREFIX.length))),
  ]);
}

export async function startNotificationResponseObserver(
  onTaskUid: (taskUid: string) => void
): Promise<() => void> {
  const Notifications = await getNotifications();
  if (!Notifications) return () => {};

  let lastResponseId: string | null = null;
  const handleResponse = (response: Awaited<ReturnType<typeof Notifications.getLastNotificationResponseAsync>>) => {
    if (!response || response.notification.request.identifier === lastResponseId) return;
    lastResponseId = response.notification.request.identifier;
    const taskUid = response.notification.request.content.data?.taskUid;
    if (typeof taskUid === 'string' && taskUid) onTaskUid(taskUid);
  };

  handleResponse(await Notifications.getLastNotificationResponseAsync());
  const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
  return () => subscription.remove();
}

function reminderStorageKey(taskUid: string) {
  return `${REMINDER_KEY_PREFIX}${taskUid}`;
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
