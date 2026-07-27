export interface TaskCreateHandoff {
  list_id: string;
  tags: string[];
  due_at: string | null;
  reminder_at: string | null;
  priority: number | null;
  calendar_id: string | null;
  subtasks: string[];
  subtaskDraft: string;
}

export interface CreateHandoff {
  title: string;
  body: string;
  task?: TaskCreateHandoff;
}

/**
 * One-shot carrier for the title/notes a user has typed when they flip the
 * Create control between "Task" and "GitHub issue". The switch is a
 * `router.replace`, which tears the old form down, so the text is stashed here
 * and claimed by the screen that mounts next.
 *
 * Deliberately not a store: it is read once, during the new screen's first
 * render, and cleared immediately so a stale draft can never resurface.
 */
let pending: CreateHandoff | null = null;

export function setCreateHandoff(draft: CreateHandoff) {
  const hasTaskDraft =
    draft.task != null &&
    (draft.task.list_id.length > 0 ||
      draft.task.tags.length > 0 ||
      draft.task.due_at != null ||
      draft.task.reminder_at != null ||
      draft.task.priority != null ||
      draft.task.calendar_id != null ||
      draft.task.subtasks.length > 0 ||
      draft.task.subtaskDraft.trim().length > 0);
  pending = draft.title.trim() || draft.body.trim() || hasTaskDraft ? draft : null;
}

export function takeCreateHandoff(): CreateHandoff | null {
  const draft = pending;
  pending = null;
  return draft;
}
