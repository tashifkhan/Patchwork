import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { fetchTasks } from '@/api/tasks';

import { pushAllWidgets } from './snapshot';

export const WIDGET_REFRESH_TASK = 'caldav-todo.widget-refresh';

if (Platform.OS === 'ios' || Platform.OS === 'android') {
  // Defining the task at module top-level is required so the OS can rehydrate it
  // when the runtime is woken in the background.
  TaskManager.defineTask(WIDGET_REFRESH_TASK, async () => {
    try {
      const tasks = await fetchTasks();
      await pushAllWidgets(tasks);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export async function registerWidgetBackgroundRefresh(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status !== BackgroundFetch.BackgroundFetchStatus.Available) return;
    await BackgroundFetch.registerTaskAsync(WIDGET_REFRESH_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Re-registration is a no-op; swallow.
  }
}
