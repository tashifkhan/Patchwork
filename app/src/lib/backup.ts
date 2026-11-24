import type { Task, TaskCreate, TaskList } from '@/api/types';
import { listsToMarkdown, parseMarkdownLists, type TextList, type TextTask } from '@/lib/task-text';
import { flattenTasks } from '@/lib/task-buckets';

/**
 * Backups and moving to-dos between apps. JSON keeps every field Patchwork
 * knows; Markdown is the Karui/Obsidian-friendly checklist format.
 *
 * Imports always create new to-dos (fresh UIDs), so importing the same file
 * twice duplicates rather than overwrites.
 */

export const BACKUP_FORMAT = 'patchwork-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  lists: { id: string; name: string; account_name?: string }[];
  /** Flat; `parent_uid` rebuilds the checklist tree. */
  tasks: (TaskCreate & { uid: string; list_name: string })[];
}

export function buildBackup(lists: TaskList[], tasks: Task[]): BackupFile {
  const flat = flattenTasks(tasks);
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    lists: lists.map((list) => ({ id: list.id, name: list.name, account_name: list.account_name })),
    tasks: flat.map((task) => ({
      uid: task.uid,
      list_id: task.list_id,
      list_name: task.list_name,
      title: task.title,
      markdown: task.markdown,
      completed: task.completed,
      tags: task.tags,
      due_at: task.due_at,
      reminder_at: task.reminder_at,
      parent_uid: task.parent_uid,
      priority: task.priority,
      sort_order: task.sort_order,
      pinned: task.pinned,
      rrule: task.rrule,
    })),
  };
}

export function buildMarkdown(lists: TaskList[], tasks: Task[]): string {
  return listsToMarkdown(
    lists.map((list) => ({ name: list.name, tasks: tasks.filter((task) => task.list_id === list.id) })),
    { header: `Patchwork export, ${new Date().toLocaleDateString()}` }
  );
}

/** What an import will create, list by list, before anything is written. */
export interface ImportPlan {
  lists: { name: string; tasks: ImportTask[] }[];
  total: number;
}

export interface ImportTask {
  /** Key within the plan, for wiring up subtasks. */
  key: string;
  parentKey: string | null;
  payload: Omit<TaskCreate, 'list_id' | 'parent_uid' | 'uid'>;
}

export function planFromText(text: string, fallbackName: string): ImportPlan {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as Partial<BackupFile>;
    if (parsed.format === BACKUP_FORMAT && Array.isArray(parsed.tasks)) return planFromBackup(parsed as BackupFile);
    throw new Error("That JSON file isn't a Patchwork backup.");
  }
  return planFromLists(parseMarkdownLists(trimmed, fallbackName));
}

function planFromBackup(file: BackupFile): ImportPlan {
  const byList = new Map<string, ImportTask[]>();
  const uids = new Set(file.tasks.map((task) => task.uid));
  for (const task of file.tasks) {
    if (!task || typeof task.title !== 'string') continue;
    const name = task.list_name || 'Imported';
    const entry: ImportTask = {
      key: task.uid,
      parentKey: task.parent_uid && uids.has(task.parent_uid) ? task.parent_uid : null,
      payload: {
        title: task.title,
        markdown: task.markdown ?? '',
        completed: !!task.completed,
        tags: Array.isArray(task.tags) ? task.tags : [],
        due_at: task.due_at ?? null,
        reminder_at: task.reminder_at ?? null,
        priority: task.priority ?? null,
        sort_order: task.sort_order ?? null,
        pinned: task.pinned,
        rrule: task.rrule ?? null,
      },
    };
    byList.set(name, [...(byList.get(name) ?? []), entry]);
  }
  const lists = [...byList].map(([name, tasks]) => ({ name, tasks: parentsFirst(tasks) }));
  return { lists, total: lists.reduce((sum, list) => sum + list.tasks.length, 0) };
}

export function planFromLists(lists: TextList[]): ImportPlan {
  let counter = 0;
  const out = lists.map((list) => {
    const tasks: ImportTask[] = [];
    const walk = (items: TextTask[], parentKey: string | null) => {
      for (const item of items) {
        const key = `k${(counter += 1)}`;
        tasks.push({
          key,
          parentKey,
          payload: { title: item.title, markdown: item.notes, completed: item.completed, tags: item.tags },
        });
        walk(item.children, key);
      }
    };
    walk(list.tasks, null);
    return { name: list.name, tasks };
  });
  return { lists: out, total: out.reduce((sum, list) => sum + list.tasks.length, 0) };
}

/** Parents before children, so every subtask can point at an existing UID. */
function parentsFirst(tasks: ImportTask[]): ImportTask[] {
  const keys = new Set(tasks.map((task) => task.key));
  const done = new Set<string>();
  const out: ImportTask[] = [];
  let remaining = tasks;
  while (remaining.length) {
    const ready = remaining.filter((task) => !task.parentKey || !keys.has(task.parentKey) || done.has(task.parentKey));
    if (ready.length === 0) {
      out.push(...remaining.map((task) => ({ ...task, parentKey: null })));
      break;
    }
    for (const task of ready) {
      out.push(task);
      done.add(task.key);
    }
    remaining = remaining.filter((task) => !done.has(task.key));
  }
  return out;
}

/** Fresh UIDs for every to-do in the plan, keyed by plan key. */
export function assignUids(plan: ImportPlan): Map<string, string> {
  const map = new Map<string, string>();
  for (const list of plan.lists) for (const task of list.tasks) map.set(task.key, randomUuid());
  return map;
}

function randomUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}
