import type { BucketKey } from '@/lib/task-buckets';

/** Compact, JSON-serializable subset of Task used by widget extensions. */
export interface WidgetTask {
  id: string;
  uid: string;
  title: string;
  due_at: string | null;
  list_name: string;
  account_name: string;
  bucket: BucketKey;
}

export interface TodayProps {
  generatedAt: number;
  tasks: WidgetTask[];
  totalToday: number;
  totalOverdue: number;
}

export interface UpcomingProps {
  generatedAt: number;
  overdue: WidgetTask[];
  today: WidgetTask[];
  tomorrow: WidgetTask[];
  upcoming: WidgetTask[];
}

export interface ListProps {
  generatedAt: number;
  listId: string | null;
  listName: string;
  tasks: WidgetTask[];
}

export interface LockProps {
  generatedAt: number;
  totalToday: number;
  totalOverdue: number;
  nextTitle: string | null;
  nextDueAt: string | null;
}
