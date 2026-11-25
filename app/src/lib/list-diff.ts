import type { Task, TaskUpdate } from '@/api/types';
import { normalizeTags } from '@/features/tasks/tags';
import { flattenTasks } from '@/features/tasks/task-buckets';
import type { TextTask } from '@/lib/task-text';

/**
 * Turns an edited Markdown checklist back into changes for one list ("edit
 * as text"). Lines are matched to existing to-dos by title, so
 * retyping a title makes a new to-do and drops the old one; everything else
 * (ticking, tags, notes, order, indenting under another item) is an update.
 */

export type ListOp =
  | { kind: 'update'; task: Task; patch: TaskUpdate }
  | { kind: 'create'; key: string; parentKey: string | null; parentUid: string | null; item: TextTask; sortOrder: number }
  | { kind: 'delete'; task: Task };

const norm = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase();

export function diffListText(existing: Task[], edited: TextTask[]): ListOp[] {
  const pool = flattenTasks(existing);
  const used = new Set<string>();
  const ops: ListOp[] = [];
  let counter = 0;

  const take = (title: string, parentUid: string | null) => {
    const candidates = pool.filter((task) => !used.has(task.id) && norm(task.title) === norm(title));
    // Prefer the one already under the same parent.
    const match = candidates.find((task) => (task.parent_uid ?? null) === parentUid) ?? candidates[0];
    if (match) used.add(match.id);
    return match;
  };

  const walk = (items: TextTask[], parent: { uid: string | null; key: string | null }) => {
    items.forEach((item, index) => {
      const sortOrder = (index + 1) * 10;
      const match = take(item.title, parent.uid);
      if (!match) {
        const key = `new${(counter += 1)}`;
        ops.push({ kind: 'create', key, parentKey: parent.key, parentUid: parent.uid, item, sortOrder });
        walk(item.children, { uid: null, key });
        return;
      }
      const patch: TaskUpdate = {};
      if (match.completed !== item.completed) patch.completed = item.completed;
      const tags = normalizeTags(item.tags);
      if (tags.join('\u0000') !== normalizeTags(match.tags).join('\u0000')) patch.tags = tags;
      if (item.notes.trim() !== match.markdown.trim()) patch.markdown = item.notes;
      if ((match.parent_uid ?? null) !== parent.uid && parent.key == null) patch.parent_uid = parent.uid;
      if (match.sort_order !== sortOrder) patch.sort_order = sortOrder;
      if (item.title.trim() !== match.title) patch.title = item.title.trim();
      if (Object.keys(patch).length) ops.push({ kind: 'update', task: match, patch: { ...patch, etag: match.etag } });
      walk(item.children, { uid: match.uid, key: null });
    });
  };
  walk(edited, { uid: null, key: null });

  for (const task of pool) if (!used.has(task.id)) ops.push({ kind: 'delete', task });
  return ops;
}

export function summarize(ops: ListOp[]) {
  const count = (kind: ListOp['kind']) => ops.filter((op) => op.kind === kind).length;
  return { created: count('create'), updated: count('update'), deleted: count('delete') };
}
