import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { fetchTasks } from '@/api/tasks';

import { pushAllWidgets } from './snapshot';

export const WIDGET_REFRESH_TASK = 'patchwork.widget-refresh';

// Keep the BackgroundTask native module lazy: Expo Widgets also evaluates this
// file in its extension runtime, where app-only native modules are unavailable.
const backgroundTask = () => import('expo-background-task');

if (Platform.OS === 'ios' || Platform.OS === 'android') {
  // Defining the task at module top-level is required so the OS can rehydrate it
  // when the runtime is woken in the background.
  TaskManager.defineTask(WIDGET_REFRESH_TASK, async () => {
    try {
      const BackgroundTask = await backgroundTask();
      const tasks = await fetchTasks();
      await pushAllWidgets(tasks);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      // BackgroundTaskResult.Failed is the stable native enum value.
      return 2;
    }
  });
}

export async function registerWidgetBackgroundRefresh(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    const BackgroundTask = await backgroundTask();
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    await BackgroundTask.registerTaskAsync(WIDGET_REFRESH_TASK, {
      minimumInterval: 15,
    });
  } catch {
    // Re-registration is a no-op; swallow.
  }
}
