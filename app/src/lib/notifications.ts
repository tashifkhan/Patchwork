import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Task } from '@/api/types';
import { useSettingsStore } from '@/stores/settings-store';

import { parseDate } from './format';

type NotificationsModule = typeof import('expo-notifications');

let notificationsPromise: Promise<NotificationsModule | null> | null = null;
const REMINDER_KEY_PREFIX = 'patchwork.reminder.';

interface StoredReminder {
  notificationId: string;
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

// Schedules a local reminder for a task and returns the notification id (to be
// stored against the task UID so it can be cancelled/rescheduled later).
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
  const { notificationsEnabled, defaultReminderMinutes } = useSettingsStore.getState();
  const explicitDate = parseDate(params.reminderAt);
  const dueDate = parseDate(params.dueAt ?? null);
  const effectiveDate = explicitDate ?? (dueDate
    ? new Date(dueDate.getTime() - Math.max(0, defaultReminderMinutes) * 60_000)
    : null);

  if (!Notifications || !notificationsEnabled || !effectiveDate || effectiveDate.getTime() <= Date.now()) {
    if (stored) await cancelReminder(stored.notificationId);
    await AsyncStorage.removeItem(key);
    return null;
  }

  const signature = `${params.title}\n${effectiveDate.toISOString()}`;
  if (stored?.signature === signature) return stored.notificationId;
  if (stored) await cancelReminder(stored.notificationId);

  const granted = await ensureNotificationPermissions();
  if (!granted) return null;

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Task reminder',
      body: params.title,
      data: { taskUid: params.taskUid, href: `/task/${encodeURIComponent(params.taskUid)}` },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: effectiveDate },
  });
  await AsyncStorage.setItem(key, JSON.stringify({ notificationId, signature } satisfies StoredReminder));
  return notificationId;
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
  if (stored) await cancelReminder(stored.notificationId);
  await AsyncStorage.removeItem(key);
}

export async function cancelAllTaskReminders(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(REMINDER_KEY_PREFIX));
  const reminders = await AsyncStorage.multiGet(keys);
  await Promise.allSettled(
    reminders.map(([, value]) => {
      if (!value) return Promise.resolve();
      try {
        return cancelReminder((JSON.parse(value) as StoredReminder).notificationId);
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
    const parsed = JSON.parse(value) as StoredReminder;
    return parsed.notificationId && parsed.signature ? parsed : null;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

function flattenTasks(tasks: Task[]): Task[] {
  return tasks.flatMap((task) => [task, ...flattenTasks(task.children)]);
}
