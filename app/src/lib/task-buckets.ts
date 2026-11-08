import type { Task } from '@/api/types';

export type BucketKey = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'none';

export const BUCKET_ORDER: BucketKey[] = ['overdue', 'today', 'tomorrow', 'upcoming', 'none'];

export const BUCKET_LABELS: Record<BucketKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  upcoming: 'Upcoming',
  none: 'No due date',
};

export function bucketOf(task: Pick<Task, 'due_at'>, now: Date = new Date()): BucketKey {
  if (!task.due_at) return 'none';
  const date = new Date(task.due_at);
  if (Number.isNaN(date.getTime())) return 'none';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((dueDay - startOfToday) / 86_400_000);
  if (dayDiff < 0) return 'overdue';
  if (dayDiff === 0) return 'today';
  if (dayDiff === 1) return 'tomorrow';
  return 'upcoming';
}

export function byManualOrder(a: Task, b: Task): number {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  const ad = a.due_at ?? '';
  const bd = b.due_at ?? '';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/** Recursively walk the parent/child tree and return all tasks flat. */
export function flattenTasks(tasks: Task[]): Task[] {
  const out: Task[] = [];
  const walk = (items: Task[]) => {
    for (const item of items) {
      out.push(item);
      if (item.children?.length) walk(item.children);
    }
  };
  walk(tasks);
  return out;
}

/**
 * Moves open subtasks out from under finished parents to the top level.
 *
 * Other clients (Nextcloud Tasks, tasks.org) let you complete a parent while
 * its subtasks stay open. Left nested, those subtasks ride along into the
 * collapsed Completed section and never count as open. The tree from the API
 * stays as it is; this only changes what the list screen shows.
 */
export function liftOpenSubtasks(tasks: Task[]): Task[] {
  const lifted: Task[] = [];
  const prune = (task: Task): Task => {
    if (task.children.length === 0) return task;
    const kept: Task[] = [];
    for (const child of task.children) {
      const next = prune(child);
      if (task.completed && !child.completed) lifted.push(next);
      else kept.push(next);
    }
    const unchanged = kept.length === task.children.length && kept.every((c, i) => c === task.children[i]);
    return unchanged ? task : { ...task, children: kept };
  };
  const roots = tasks.map(prune);
  return lifted.length === 0 ? tasks : [...roots, ...lifted];
}
