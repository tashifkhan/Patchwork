import { Platform } from 'react-native';

import type { Task } from '@/api/types';
import { queryClient, queryKeys } from '@/lib/query-client';

import { pushAllWidgets } from './snapshot';

let unsubscribe: (() => void) | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

/** Subscribes to the React Query cache and pushes a widget snapshot whenever ['tasks'] settles. */
export function startWidgetObserver(): () => void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return () => {};
  if (unsubscribe) return unsubscribe;

  const cache = queryClient.getQueryCache();
  unsubscribe = cache.subscribe(() => {
    const data = queryClient.getQueryData<Task[]>(queryKeys.tasks);
    if (!data) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      pushAllWidgets(data).catch(() => {});
    }, 500);
  });
  return unsubscribe;
}
