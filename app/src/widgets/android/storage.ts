import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ListProps, LockProps, TodayProps, UpcomingProps } from '../shared/types';

const STORAGE_KEY = 'caldav-todo.widget-snapshot';

export interface StoredWidgetSnapshot {
  today: TodayProps;
  upcoming: UpcomingProps;
  list: ListProps;
  lock: LockProps;
}

export async function saveSnapshot(snapshot: StoredWidgetSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // swallow — widget will fall back to "loading" UI
  }
}

export async function loadSnapshot(): Promise<StoredWidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredWidgetSnapshot;
  } catch {
    return null;
  }
}

export function emptySnapshot(): StoredWidgetSnapshot {
  const now = Date.now();
  return {
    today: { generatedAt: now, tasks: [], totalToday: 0, totalOverdue: 0 },
    upcoming: { generatedAt: now, overdue: [], today: [], tomorrow: [], upcoming: [] },
    list: { generatedAt: now, listId: null, listName: '', tasks: [] },
    lock: { generatedAt: now, totalToday: 0, totalOverdue: 0, nextTitle: null, nextDueAt: null },
  };
}
