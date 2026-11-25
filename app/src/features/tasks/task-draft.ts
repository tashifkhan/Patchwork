import type { Task, TaskUpdate } from './model';
import { normalizeTags } from './tags';

/** Snap an arbitrary CalDAV PRIORITY (0–9) onto the buckets the control offers. */
function toPriorityBucket(priority: number | null | undefined): number | null {
  if (priority == null || priority === 0) return null;
  if (priority <= 4) return 1;
  if (priority === 5) return 5;
  return 9;
}

export interface Draft {
  title: string;
  markdown: string;
  list_id: string;
  tags: string[];
  due_at: string | null;
  start_at: string | null;
  reminder_at: string | null;
  priority: number | null;
  rrule: string | null;
  pinned: boolean;
}

export function draftFromTask(task: Task): Draft {
  return {
    title: task.title,
    markdown: task.markdown,
    list_id: task.list_id,
    tags: normalizeTags(task.tags),
    due_at: task.due_at,
    start_at: task.start_at ?? null,
    reminder_at: task.reminder_at,
    priority: toPriorityBucket(task.priority),
    rrule: task.rrule ?? null,
    pinned: task.pinned ?? false,
  };
}

export function diffDraft(saved: Draft, next: Draft): TaskUpdate {
  const patch: TaskUpdate = {};
  const title = next.title.trim();
  if (title && title !== saved.title) patch.title = title;
  if (next.markdown !== saved.markdown) patch.markdown = next.markdown;
  if (next.list_id !== saved.list_id) patch.list_id = next.list_id;
  if (next.tags.join('\u0000') !== saved.tags.join('\u0000')) patch.tags = next.tags;
  if (next.due_at !== saved.due_at) patch.due_at = next.due_at;
  if (next.start_at !== saved.start_at) patch.start_at = next.start_at;
  if (next.reminder_at !== saved.reminder_at) patch.reminder_at = next.reminder_at;
  if (next.priority !== saved.priority) patch.priority = next.priority;
  if (next.rrule !== saved.rrule) patch.rrule = next.rrule;
  if (next.pinned !== saved.pinned) patch.pinned = next.pinned;
  return patch;
}
