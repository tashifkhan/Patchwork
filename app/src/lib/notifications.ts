import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { parseDate } from './format';

type NotificationsModule = typeof import('expo-notifications');

let notificationsPromise: Promise<NotificationsModule | null> | null = null;

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
}): Promise<string | null> {
  const Notifications = await getNotifications();
  if (!Notifications) return null;

  const date = parseDate(params.reminderAt);
  if (!date || date.getTime() <= Date.now()) return null;

  const granted = await ensureNotificationPermissions();
  if (!granted) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Task reminder',
      body: params.title,
      data: { taskUid: params.taskUid },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

export async function cancelReminder(notificationId: string | null): Promise<void> {
  if (!notificationId) return;

  const Notifications = await getNotifications();
  if (!Notifications) return;

  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
