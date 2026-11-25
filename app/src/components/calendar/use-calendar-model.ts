import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import type { Task } from '@/api/types';
import { useDeviceEvents } from '@/hooks/use-device-events';
import { useTaskLists, useTasks } from '@/features/tasks/queries';
import { useUpdateTask } from '@/features/tasks/mutations';
import { taskRef } from '@/features/tasks/model';
import { type DeviceEvent, openDeviceEvent } from '@/lib/device-events';
import { playSound } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { nextDue } from '@/lib/recurrence';
import { togglePatch } from '@/lib/task-actions';
import { flattenTasks } from '@/features/tasks/task-buckets';
import { type Block, blockMinutes, blockOf } from '@/lib/time-block';
import { atDay, startOfDay } from '@/features/tasks/when';
import { setCreateHandoff } from '@/features/tasks/create-handoff';
import { dayKey, usePomodoroStore } from '@/stores/pomodoro-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';

/** Upcoming repeats are drawn too, so a weekly to-do shows on every week. */
const REPEAT_PREVIEW = 60;

export interface DayItem {
  task: Task;
  /** A future repeat of the to-do, drawn but not tickable. */
  projected: boolean;
  /** Where it sits on the timeline, or null for a to-do with no time of day. */
  block: Block | null;
  /**
   * Set for an event from the phone's calendars. `task` then only carries its
   * title and times; the event can't be ticked or focused, and opens in the
   * system calendar.
   */
  event?: DeviceEvent;
}

/** An event drawn like a to-do on one day: all-day, or a block clipped to that day. */
function eventItems(event: DeviceEvent): { key: string; item: DayItem }[] {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const task: Task = {
    id: `event:${event.id}:${event.start}`,
    uid: `event:${event.id}`,
    list_id: `device-calendar:${event.calendarId}`,
    list_name: event.calendarTitle,
    title: event.title,
    description: event.location ?? '',
    markdown: event.location ?? '',
    completed: false,
    priority: null,
    due_at: event.end,
    start_at: event.start,
    reminder_at: null,
    tags: [],
    sort_order: null,
    parent_uid: null,
    children: [],
    etag: null,
    updated_at: null,
  };
  const out: { key: string; item: DayItem }[] = [];
  // All-day and multi-day events sit in the all-day row of every day they cover.
  const multiDay = dayKey(start) !== dayKey(new Date(end.getTime() - 1));
  if (event.allDay || multiDay) {
    // Android stores all-day events at UTC midnight; read their dates in UTC so
    // they don't slide a day west or east of Greenwich. iOS uses local midnight.
    const utc = event.allDay && Platform.OS === 'android';
    const asDay = (d: Date) => (utc ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : startOfDay(d));
    const day = asDay(start);
    const last = asDay(new Date(end.getTime() - 1));
    for (let i = 0; i < 62 && day <= last; i += 1) {
      out.push({ key: dayKey(day), item: { task, projected: false, block: null, event } });
      day.setDate(day.getDate() + 1);
    }
    return out;
  }
  const block = { start, end: end > start ? end : new Date(start.getTime() + 30 * 60_000) };
  out.push({ key: dayKey(start), item: { task, projected: false, block, event } });
  return out;
}

export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The seven days of the week holding `date`. */
export function weekOf(date: Date, mondayFirst: boolean): Date[] {
  const start = startOfDay(date);
  const offset = (start.getDay() - (mondayFirst ? 1 : 0) + 7) % 7;
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** Moves a whole repeat occurrence: keeps the block's length on the new day. */
function shiftTask(task: Task, due: string): Task {
  if (!task.start_at || !task.due_at) return { ...task, due_at: due };
  const length = new Date(task.due_at).getTime() - new Date(task.start_at).getTime();
  return { ...task, due_at: due, start_at: new Date(new Date(due).getTime() - length).toISOString() };
}

/**
 * Everything both calendar screens share: to-dos by day (with repeats drawn
 * ahead), the selected day, list colours, the clock, and the actions.
 */
export function useCalendarModel() {
  const mondayFirst = useSettingsStore((s) => s.weekStartsMonday);
  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const updateTask = useUpdateTask();
  const selectedListId = useUiStore((s) => s.selectedListId);
  const runningUid = usePomodoroStore((s) => (s.phase === 'idle' ? null : s.taskUid));

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Tick on the minute so the now line moves with the clock.
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const todayKey = dayKey(now);
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const selectedDate = keyToDate(selected);

  const lists = useMemo(() => (listsQuery.data ?? []).filter((list) => !list.is_deck), [listsQuery.data]);
  const targetList = lists.find((l) => l.id === selectedListId) ?? lists[0];
  /** A stable colour slot per list, in list order. */
  const colorIndex = useMemo(() => {
    const map = new Map<string, number>();
    lists.forEach((list, i) => map.set(list.id, i));
    return map;
  }, [lists]);

  /** The horizon for drawing repeats follows the selected month only. */
  const horizonKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}`;
  // Phone calendar events for the month before through the month after.
  const [eventFrom, eventTo] = useMemo(() => {
    const [y, m] = horizonKey.split('-').map(Number);
    return [new Date(y, m - 1, 1), new Date(y, m + 2, 1)];
  }, [horizonKey]);
  const eventsQuery = useDeviceEvents(eventFrom, eventTo);
  const byDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    const add = (task: Task, projected: boolean) => {
      if (!task.due_at) return;
      const key = dayKey(new Date(task.start_at ?? task.due_at));
      map.set(key, [...(map.get(key) ?? []), { task, projected, block: blockOf(task) }]);
    };
    const [hy, hm] = horizonKey.split('-').map(Number);
    const horizon = new Date(hy, hm + 2, 0).getTime();
    for (const task of flattenTasks(tasksQuery.data ?? [])) {
      if (!task.due_at) continue;
      add(task, false);
      if (task.rrule && !task.completed) {
        let at: string | null = task.due_at;
        for (let i = 0; i < REPEAT_PREVIEW; i += 1) {
          at = nextDue(at, task.rrule, new Date(at));
          if (!at || new Date(at).getTime() > horizon) break;
          add(shiftTask(task, at), true);
        }
      }
    }
    for (const event of eventsQuery.data ?? []) {
      for (const { key, item } of eventItems(event)) map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [tasksQuery.data, horizonKey, eventsQuery.data]);

  const dayItems = byDay.get(selected) ?? [];

  function toggle(task: Task) {
    if (task.uid.startsWith('event:')) return;
    const { patch } = togglePatch(task);
    if (!task.completed) playSound('complete');
    haptics.selection();
    updateTask.mutate({ taskId: task.id, accountId: task.account_id, patch });
  }

  function open(task: Task) {
    haptics.tap();
    if (task.uid.startsWith('event:')) {
      void openDeviceEvent(task.uid.slice('event:'.length));
      return;
    }
    router.push({ pathname: '/calendar/task/[uid]', params: { ...taskRef(task) } });
  }

  /** Focus on a to-do: a timer the length of its block, or a stopwatch when it has none. */
  function focus(task: Task) {
    if (task.uid.startsWith('event:')) return;
    haptics.impact('medium');
    const store = usePomodoroStore.getState();
    const minutes = blockMinutes(task);
    const ref = { uid: task.uid, title: task.title };
    if (minutes) void store.startFor(minutes, ref);
    else void store.startStopwatch(ref);
    router.push('/pomodoro');
  }

  /** New to-do on the selected day; with an hour, as an hour-long block from then. */
  function create(hour?: number) {
    if (!targetList) return;
    let start: string | null = null;
    let due = atDay(selectedDate);
    if (hour != null) {
      haptics.impact('medium');
      const begin = new Date(selectedDate);
      begin.setHours(hour, 0, 0, 0);
      start = begin.toISOString();
      due = new Date(begin.getTime() + 60 * 60_000).toISOString();
    }
    const draftId = setCreateHandoff({
      title: '',
      body: '',
      task: {
        list_id: targetList.id,
        tags: [],
        due_at: due,
        start_at: start,
        reminder_at: null,
        priority: null,
        calendar_id: null,
        subtasks: [],
        subtaskDraft: '',
      },
    });
    router.push({ pathname: '/new-task', params: { draftId } });
  }

  return {
    now,
    todayKey,
    selected,
    setSelected,
    selectedDate,
    mondayFirst,
    byDay,
    dayItems,
    colorIndex,
    runningUid,
    canCreate: targetList != null,
    toggle,
    open,
    focus,
    create,
  };
}
