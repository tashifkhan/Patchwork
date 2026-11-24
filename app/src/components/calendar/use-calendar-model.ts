import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import type { Task } from '@/api/types';
import { useTaskLists, useTasks, useUpdateTask } from '@/hooks/use-tasks';
import { playSound } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { nextDue } from '@/lib/recurrence';
import { togglePatch } from '@/lib/task-actions';
import { flattenTasks } from '@/lib/task-buckets';
import { type Block, blockMinutes, blockOf } from '@/lib/time-block';
import { atDay, startOfDay } from '@/lib/when';
import { setCreateHandoff } from '@/stores/create-handoff';
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
    return map;
  }, [tasksQuery.data, horizonKey]);

  const dayItems = byDay.get(selected) ?? [];

  function toggle(task: Task) {
    const { patch } = togglePatch(task);
    if (!task.completed) playSound('complete');
    haptics.selection();
    updateTask.mutate({ taskId: task.id, accountId: task.account_id, patch });
  }

  function open(task: Task) {
    haptics.tap();
    router.push({ pathname: '/task/[uid]', params: { uid: task.uid } });
  }

  /** Focus on a to-do: a timer the length of its block, or a stopwatch when it has none. */
  function focus(task: Task) {
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
    haptics.impact('medium');
    let start: string | null = null;
    let due = atDay(selectedDate);
    if (hour != null) {
      const begin = new Date(selectedDate);
      begin.setHours(hour, 0, 0, 0);
      start = begin.toISOString();
      due = new Date(begin.getTime() + 60 * 60_000).toISOString();
    }
    setCreateHandoff({
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
    router.push('/new-task');
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
