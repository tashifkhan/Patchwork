import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import type { Task } from '@/api/types';
import { bucketOf, byManualOrder, flattenTasks } from '@/lib/task-buckets';
import { LAST_LIST_STORAGE_KEY } from '@/stores/ui-store';

import ListWidget from './ListWidget';
import LockWidget from './LockWidget';
import TodayWidget from './TodayWidget';
import UpcomingWidget from './UpcomingWidget';
import { ListAndroidWidget } from './android/ListWidget';
import { TodayAndroidWidget } from './android/TodayWidget';
import { UpcomingAndroidWidget } from './android/UpcomingWidget';
import { saveSnapshot } from './android/storage';
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

/** Push fresh props to every widget kind. No-op on web. */
export async function pushAllWidgets(tasks: Task[]): Promise<void> {
  if (!isIOS && !isAndroid) return;
  const lastListId = await AsyncStorage.getItem(LAST_LIST_STORAGE_KEY).catch(() => null);
  const snaps = buildSnapshots({ tasks, lastListId });

  if (isIOS) {
    TodayWidget.updateSnapshot(snaps.today);
    UpcomingWidget.updateSnapshot(snaps.upcoming);
    ListWidget.updateSnapshot(snaps.list);
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

  if (isAndroid) {
    // Persist for the background widgetTaskHandler (system-driven updates / resizes).
    await saveSnapshot(snaps);
    // Push immediately so foreground updates feel instant.
    await Promise.all([
      requestWidgetUpdate({
        widgetName: 'Today',
        renderWidget: () => <TodayAndroidWidget props={snaps.today} />,
        widgetNotFound: () => {},
      }),
      requestWidgetUpdate({
        widgetName: 'Upcoming',
        renderWidget: () => <UpcomingAndroidWidget props={snaps.upcoming} />,
        widgetNotFound: () => {},
      }),
      requestWidgetUpdate({
        widgetName: 'List',
        renderWidget: () => <ListAndroidWidget props={snaps.list} />,
        widgetNotFound: () => {},
      }),
    ]).catch(() => {});
  }
}
