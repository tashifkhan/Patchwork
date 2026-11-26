import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { taskLink, taskRef, type Task } from '@/features/tasks/model';
import { bucketOf, byManualOrder, flattenTasks } from '@/features/tasks/task-buckets';
import type { TaskList } from '@/api/types';
import { queryClient, queryKeys } from '@/lib/query-client';
import { LAST_LIST_STORAGE_KEY } from '@/stores/ui-store';

import { setAssistantSnapshot } from '../../modules/patchwork-shortcuts/src';

import ListWidget from './ListWidget';
import LockWidget from './LockWidget';
import TodayWidget from './TodayWidget';
import UpcomingWidget from './UpcomingWidget';
import type {
  ListProps,
  LockProps,
  TodayProps,
  UpcomingProps,
  WidgetTask,
} from './shared/types';

const BUCKET_CAP = 20;
const isIOS = Platform.OS === 'ios';
const isAndroid = Platform.OS === 'android';

function toWidgetTask(task: Task): WidgetTask {
  return {
    id: task.id,
    uid: task.uid,
    href: `patchwork://${taskLink(taskRef(task))}`,
    title: task.title,
    due_at: task.due_at,
    list_name: task.list_name,
    account_name: task.account_name ?? '',
    bucket: bucketOf(task),
  };
}

function startOfTomorrow(now = new Date()): Date {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next;
}

function pickNext(active: Task[]): Task | undefined {
  return active
    .filter((task) => task.due_at)
    .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))[0];
}

export interface SnapshotInputs {
  tasks: Task[];
  lastListId: string | null;
  now?: Date;
}

export function buildSnapshots(inputs: SnapshotInputs): {
  today: TodayProps;
  upcoming: UpcomingProps;
  list: ListProps;
  lock: LockProps;
} {
  const now = inputs.now ?? new Date();
  const generatedAt = now.getTime();
  const all = flattenTasks(inputs.tasks);
  const active = all.filter((task) => !task.completed).sort(byManualOrder);

  const overdue = active.filter((t) => bucketOf(t, now) === 'overdue').map(toWidgetTask).slice(0, BUCKET_CAP);
  const today = active.filter((t) => bucketOf(t, now) === 'today').map(toWidgetTask).slice(0, BUCKET_CAP);
  const tomorrow = active.filter((t) => bucketOf(t, now) === 'tomorrow').map(toWidgetTask).slice(0, BUCKET_CAP);
  const upcoming = active.filter((t) => bucketOf(t, now) === 'upcoming').map(toWidgetTask).slice(0, BUCKET_CAP);

  const next = pickNext(active);

  const list = active
    .filter((t) => (inputs.lastListId ? t.list_id === inputs.lastListId : false))
    .map(toWidgetTask)
    .slice(0, BUCKET_CAP);
  const listName = active.find((t) => t.list_id === inputs.lastListId)?.list_name ?? '';

  return {
    today: {
      generatedAt,
      tasks: [...overdue, ...today],
      totalToday: today.length,
      totalOverdue: overdue.length,
    },
    upcoming: { generatedAt, overdue, today, tomorrow, upcoming },
    list: {
      generatedAt,
      listId: inputs.lastListId,
      listName,
      tasks: list,
    },
    lock: {
      generatedAt,
      totalToday: today.length,
      totalOverdue: overdue.length,
      nextTitle: next?.title ?? null,
      nextDueAt: next?.due_at ?? null,
    },
  };
}

/** Kotlin's `Instant.parse` wants a full UTC timestamp. */
function isoInstant(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function pushAssistantSnapshot(tasks: Task[], today: TodayProps) {
  const cachedLists = queryClient.getQueryData<TaskList[]>(queryKeys.taskLists);
  const lists = new Map<string, { name: string; account: string }>();
  for (const list of cachedLists ?? []) {
    if (!list.is_deck) lists.set(list.id, { name: list.name, account: list.account_name ?? '' });
  }
  for (const task of flattenTasks(tasks)) {
    if (!lists.has(task.list_id)) lists.set(task.list_id, { name: task.list_name, account: task.account_name ?? '' });
  }
  setAssistantSnapshot({
    generatedAt: today.generatedAt,
    dueTodayCount: today.totalToday,
    overdueCount: today.totalOverdue,
    today: today.tasks.map((task) => ({
      title: task.title,
      list: task.list_name,
      dueAt: isoInstant(task.due_at),
      overdue: task.bucket === 'overdue',
    })),
    lists: [...lists.values()],
  });
}

/** Push fresh props to every widget kind. No-op on web. */
export async function pushAllWidgets(tasks: Task[]): Promise<void> {
  if (!isIOS && !isAndroid) return;
  const lastListId = await AsyncStorage.getItem(LAST_LIST_STORAGE_KEY).catch(() => null);
  const snaps = buildSnapshots({ tasks, lastListId });

  // On Android these resolve to the *.android.tsx Jetpack Compose widgets.
  TodayWidget.updateSnapshot(snaps.today);
  UpcomingWidget.updateSnapshot(snaps.upcoming);
  ListWidget.updateSnapshot(snaps.list);

  // Android AppFunctions (Gemini) answer "what's due today" from this copy,
  // since the tasks themselves only exist on the JS side.
  if (isAndroid) pushAssistantSnapshot(tasks, snaps.today);

  // Lock Screen widgets and timelines exist only on iOS.
  if (isIOS) {
    LockWidget.updateSnapshot(snaps.lock);

    // Schedule bucket rollover at next midnight so the widget recomputes Today/Tomorrow on its own.
    const rollover = startOfTomorrow();
    const rolloverSnaps = buildSnapshots({ tasks, lastListId, now: rollover });
    TodayWidget.updateTimeline([
      { date: new Date(), props: snaps.today },
      { date: rollover, props: rolloverSnaps.today },
    ]);
    UpcomingWidget.updateTimeline([
      { date: new Date(), props: snaps.upcoming },
      { date: rollover, props: rolloverSnaps.upcoming },
    ]);
  }
}
