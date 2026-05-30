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
