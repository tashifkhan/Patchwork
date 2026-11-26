import { router, useRootNavigationState, type Href } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { TaskList } from '@/api/types';
import { taskRef } from '@/features/tasks/model';
import { createTask, fetchTaskLists } from '@/features/tasks/repository';
import { atDay } from '@/features/tasks/when';
import { queryClient, queryKeys } from '@/lib/query-client';
import { useUiStore } from '@/stores/ui-store';

import {
  addPendingActionListener,
  consumePendingActions,
  type ShortcutAction,
} from '../../../modules/patchwork-shortcuts/src';

/**
 * `patchwork:///brain-dump` becomes `/brain-dump`. Anything else is ignored.
 * The links in use: `/new-task`, `/?dictate=1`, `/brain-dump`, `/search`,
 * `/?smart=today`, `/?list=<id>` and `/deck/board/<ref>`.
 */
export function hrefFromUrl(url: string): string | null {
  const match = /^patchwork:\/\/\/?(.*)$/i.exec(url.trim());
  if (!match) return null;
  return `/${match[1]}`;
}

function pickList(lists: TaskList[], wanted: string | undefined): TaskList | undefined {
  const usable = lists.filter((list) => !list.is_deck);
  const name = wanted?.trim().toLowerCase();
  if (name) {
    const found =
      usable.find((list) => list.name.toLowerCase() === name) ??
      usable.find((list) => list.name.toLowerCase().includes(name));
    if (found) return found;
  }
  const selected = useUiStore.getState().selectedListId;
  return usable.find((list) => list.id === selected) ?? usable[0];
}

function dueFrom(action: Extract<ShortcutAction, { type: 'createTask' }>): string | null {
  if (action.dueAt) {
    const date = new Date(action.dueAt);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const day = action.dueDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(action.dueDate) : null;
  if (!day) return null;
  const date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  const time = action.dueTime ? /^(\d{2}):(\d{2})/.exec(action.dueTime) : null;
  if (!time) return atDay(date);
  date.setHours(Number(time[1]), Number(time[2]), 0, 0);
  return date.toISOString();
}

/**
 * Save a to-do from Siri or an assistant through the same repository the app
 * uses (offline outbox included), then open it on Tasks. If it can't be saved
 * (no lists yet, a server error), the add screen opens with the text filled
 * in so nothing the user said is lost.
 */
async function saveTask(action: Extract<ShortcutAction, { type: 'createTask' }>) {
  try {
    const lists =
      queryClient.getQueryData<TaskList[]>(queryKeys.taskLists) ??
      (await queryClient.fetchQuery({ queryKey: queryKeys.taskLists, queryFn: fetchTaskLists }));
    const list = pickList(lists, action.list);
    if (!list) throw new Error('No list to add to.');
    const created = await createTask({
      list_id: list.id,
      title: action.title,
      markdown: action.notes,
      due_at: dueFrom(action),
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
    router.navigate('/');
    useUiStore.getState().requestOpenTask(taskRef(created));
  } catch {
    router.push({ pathname: '/new-task', params: { title: action.title, notes: action.notes } });
  }
}

function run(action: ShortcutAction) {
  if (action.type === 'createTask') {
    void saveTask(action);
    return;
  }
  const href = hrefFromUrl(action.url);
  if (href) router.navigate(href as Href);
}

/**
 * Runs what iOS quick actions, Siri and Android assistants queued: at launch
 * (once the router is up), whenever the app comes back to the foreground, and
 * the moment a new one is queued while the app is open. Android launcher and
 * pinned shortcuts don't come through here; they open deep links directly.
 */
export function useShortcutActions() {
  const navigationReady = useRootNavigationState()?.key != null;

  useEffect(() => {
    if (process.env.EXPO_OS === 'web' || !navigationReady) return;
    const drain = () => consumePendingActions().forEach(run);
    // A frame's delay lets the first screen mount before anything is pushed on it.
    const frame = requestAnimationFrame(drain);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') drain();
    });
    const queued = addPendingActionListener(drain);
    return () => {
      cancelAnimationFrame(frame);
      appState.remove();
      queued?.remove();
    };
  }, [navigationReady]);
}
