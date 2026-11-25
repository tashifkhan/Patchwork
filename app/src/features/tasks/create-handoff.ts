import { randomUuid } from '@/lib/uuid';

export interface TaskCreateHandoff {
  list_id: string;
  tags: string[];
  due_at: string | null;
  /** Start of the time block, when the to-do has one. */
  start_at?: string | null;
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

let pending: { id: string; draft: CreateHandoff } | null = null;

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
  pending = draft.title.trim() || draft.body.trim() || hasTaskDraft ? { id: randomUuid(), draft } : null;
  return pending?.id;
}

export function getCreateHandoff(id: string | undefined): CreateHandoff | null {
  return id && pending?.id === id ? pending.draft : null;
}

export function clearCreateHandoff(id: string | undefined) {
  if (id && pending?.id === id) pending = null;
}
