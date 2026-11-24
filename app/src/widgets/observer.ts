import { Platform } from 'react-native';

import type { Task } from '@/api/types';
import { queryClient, queryKeys } from '@/lib/query-client';
import { useSettingsStore } from '@/stores/settings-store';

import { pushBoardsWidget } from './boards-snapshot';
import { pushAllWidgets } from './snapshot';

let unsubscribe: (() => void) | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

function schedulePush() {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    const tasks = queryClient.getQueryData<Task[]>(queryKeys.tasks);
    if (tasks) pushAllWidgets(tasks).catch(() => {});
    try {
      pushBoardsWidget();
    } catch {
      // A bad board snapshot must not stop the task widgets from updating.
    }
  }, 500);
}

/**
 * Subscribes to the React Query cache and pushes widget snapshots once it settles.
 * Also listens for a newly opened board, which changes what the Boards widget shows.
 */
export function startWidgetObserver(): () => void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return () => {};
  if (unsubscribe) return unsubscribe;

  const stopCache = queryClient.getQueryCache().subscribe(schedulePush);
  const stopSettings = useSettingsStore.subscribe((state, previous) => {
    if (state.recentBoards[0] !== previous.recentBoards[0] || state.hydrated !== previous.hydrated) {
      schedulePush();
    }
  });
  unsubscribe = () => {
    stopCache();
    stopSettings();
    if (debounce) clearTimeout(debounce);
    debounce = null;
    unsubscribe = null;
  };
  return unsubscribe;
}
