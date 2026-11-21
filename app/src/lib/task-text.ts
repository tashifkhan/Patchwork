import type { Task } from '@/api/types';
import { describeRrule } from '@/lib/recurrence';

/**
 * Plain-text to-dos, the way Karui syncs them: Markdown checklists under a
 * heading per list. Used for Markdown export and import, QR sharing, and
 * editing a whole list as text.
 *
 *   ## Groceries
 *   - [ ] oat milk #shop
 *     - [x] the barista one
 *     notes are indented under their to-do
 *   - [x] bread
 */

export interface TextTask {
  title: string;
  completed: boolean;
  tags: string[];
  notes: string;
  children: TextTask[];
}

export interface TextList {
  name: string;
  tasks: TextTask[];
}

const ITEM = /^(\s*)[-*+]\s+\[( |x|X)\]\s*(.*)$/;
const PLAIN_ITEM = /^(\s*)[-*+]\s+(.+)$/;
const HEADING = /^#{1,3}\s+(.+?)\s*#*$/;

/** One list's to-dos as a Markdown checklist (no heading). */
export function tasksToMarkdown(tasks: Task[], depth = 0): string {
  const pad = '  '.repeat(depth);
  return tasks
    .map((task) => {
      const tags = task.tags.map((tag) => ` #${tag.replace(/\s+/g, '-')}`).join('');
      // A "#42" in the title is escaped so it doesn't come back as a tag.
      const title = task.title.replace(/\n/g, ' ').replace(/(^|\s)#(?=\S)/g, '$1\\#');
      const lines = [`${pad}- [${task.completed ? 'x' : ' '}] ${title}${tags}`];
      const notes = task.markdown.trim();
      // Notes lines that look like list items (or start with the escape) get a
      // backslash, or they'd read back as checklist items.
      if (notes) lines.push(...notes.split('\n').map((line) => `${pad}  ${/^\s*([-*+]\s|\\)/.test(line) ? `\\${line}` : line}`));
      if (task.children.length) lines.push(tasksToMarkdown(task.children, depth + 1));
      return lines.join('\n');
    })
    .join('\n');
}

/** Several lists, each under a `## Name` heading. */
export function listsToMarkdown(lists: { name: string; tasks: Task[] }[], options: { header?: string } = {}) {
  const parts = options.header ? [`# ${options.header}`, ''] : [];
  for (const list of lists) {
    parts.push(`## ${list.name}`, '', tasksToMarkdown(list.tasks), '');
  }
  return parts.join('\n').trimEnd() + '\n';
}

/** A single to-do as text, for sharing one item. */
export function taskToText(task: Task): string {
  const parts = [task.title];
  const repeat = task.rrule ? describeRrule(task.rrule) : null;
  if (task.due_at) parts.push(`Due ${new Date(task.due_at).toLocaleString()}${repeat ? ` (${repeat.toLowerCase()})` : ''}`);
  if (task.tags.length) parts.push(task.tags.map((tag) => `#${tag}`).join(' '));
  if (task.markdown.trim()) parts.push('', task.markdown.trim());
  if (task.children.length) parts.push('', tasksToMarkdown(task.children));
  return parts.join('\n');
}

/**
 * Reads Markdown checklists. Headings start lists; items before the first
 * heading go in a list named `fallbackName`. Plain bullets count as open
 * to-dos so a pasted shopping list still works. Indented non-item lines are
 * the notes of the item above.
 */
export function parseMarkdownLists(text: string, fallbackName = 'Imported'): TextList[] {
  const lists: TextList[] = [];
  let current: TextList | null = null;
  // Stack of [indent, task] for nesting.
  let stack: { indent: number; task: TextTask }[] = [];

  const ensureList = () => {
    if (!current) {
      current = { name: fallbackName, tasks: [] };
      lists.push(current);
    }
    return current;
  };

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = raw.match(HEADING);
    if (heading && !raw.startsWith(' ')) {
      // A top `# Title` over several `##` lists is a document title, not a list.
      if (/^#\s/.test(raw) && text.includes('\n## ')) continue;
      current = { name: heading[1].trim(), tasks: [] };
      lists.push(current);
      stack = [];
      continue;
    }
    const item = raw.match(ITEM) ?? null;
    const plain = item ? null : raw.match(PLAIN_ITEM);
    if (item || plain) {
      const indent = (item ?? plain)![1].replace(/\t/g, '  ').length;
      const body = item ? item[3] : plain![2];
      const { title, tags } = splitTags(body);
      if (!title) continue;
      const task: TextTask = { title, completed: item ? item[2].toLowerCase() === 'x' : false, tags, notes: '', children: [] };
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1]?.task;
      if (parent) parent.children.push(task);
      else ensureList().tasks.push(task);
      stack.push({ indent, task });
      continue;
    }
    const top = stack[stack.length - 1];
    if (top && /^\s+\S/.test(raw)) {
      const line = raw
        .replace(/^\s{1,}/, (spaces) => spaces.slice(Math.min(spaces.length, top.indent + 2)))
        .replace(/^(\s*)\\/, '$1');
      top.task.notes = top.task.notes ? `${top.task.notes}\n${line}` : line;
    } else if (top && raw.trim() === '' && top.task.notes) {
      top.task.notes += '\n';
    }
  }
  for (const list of lists) trimNotes(list.tasks);
  return lists.filter((list) => list.tasks.length > 0);
}

function trimNotes(tasks: TextTask[]) {
  for (const task of tasks) {
    task.notes = task.notes.trim();
    trimNotes(task.children);
  }
}

/** Trailing `#tag` words are tags (that's how export writes them); a leading `#1` stays in the title. */
function splitTags(body: string) {
  const words = body.trim().split(/\s+/);
  const tags: string[] = [];
  while (words.length > 1) {
    const m = words[words.length - 1].match(/^#([^\s#]+)$/);
    if (!m) break;
    tags.unshift(m[1]);
    words.pop();
  }
  return { title: words.join(' ').replace(/(^|\s)\\#/g, '$1#').trim(), tags };
}

export function countTextTasks(tasks: TextTask[]): number {
  return tasks.reduce((sum, task) => sum + 1 + countTextTasks(task.children), 0);
}
