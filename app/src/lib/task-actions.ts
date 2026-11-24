import type { Task, TaskUpdate } from '@/api/types';
import { nextDue } from '@/lib/recurrence';

/**
 * What ticking a to-do's checkbox writes. A repeating to-do doesn't finish:
 * its due date (and reminder, by the same lead) moves to the next occurrence
 * and it stays open, the way tasks.org and Apple Reminders handle it. When
 * the rule has run out, it completes like any other to-do.
 */
export function togglePatch(task: Task, now: Date = new Date()): { patch: TaskUpdate; repeated: boolean } {
  if (!task.completed && task.rrule) {
    const next = nextDue(task.due_at, task.rrule, now);
    if (next) {
      const patch: TaskUpdate = { due_at: next, completed: false, etag: task.etag };
      if (task.reminder_at && task.due_at) {
        const lead = new Date(task.due_at).getTime() - new Date(task.reminder_at).getTime();
        patch.reminder_at = new Date(new Date(next).getTime() - lead).toISOString();
      }
      // A time block moves with its due date and keeps its length.
      if (task.start_at && task.due_at) {
        const length = new Date(task.due_at).getTime() - new Date(task.start_at).getTime();
        patch.start_at = new Date(new Date(next).getTime() - length).toISOString();
      }
      return { patch, repeated: true };
    }
  }
  return { patch: { completed: !task.completed, etag: task.etag }, repeated: false };
}

/** Completion share for a set of to-dos, 0–100, or null when there are none. */
export function completionPercent(tasks: readonly Pick<Task, 'completed'>[]): number | null {
  if (tasks.length === 0) return null;
  const done = tasks.filter((task) => task.completed).length;
  return Math.round((done / tasks.length) * 100);
}

/** Words and characters, as the notes editor shows them. */
export function textStats(text: string): { words: number; characters: number } {
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    characters: [...text].length,
  };
}
