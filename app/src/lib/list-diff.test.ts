import { describe, expect, test } from 'bun:test';

import type { Task } from '@/api/types';
import { diffListText, summarize } from '@/lib/list-diff';
import { parseMarkdownLists } from '@/lib/task-text';

const task = (id: string, title: string, patch: Partial<Task> = {}): Task =>
  ({
    id,
    uid: id,
    title,
    completed: false,
    tags: [],
    markdown: '',
    children: [],
    parent_uid: null,
    sort_order: null,
    etag: 'e',
    ...patch,
  }) as Task;

const parse = (md: string) => parseMarkdownLists(md, 'L')[0]?.tasks ?? [];

describe('list text diff', () => {
  const existing = [
    task('a', 'milk', { sort_order: 10 }),
    task('b', 'bread', { sort_order: 20, children: [task('c', 'sourdough', { parent_uid: 'b', sort_order: 10 })] }),
  ];

  test('an unchanged list makes no changes', () => {
    expect(diffListText(existing, parse('- [ ] milk\n- [ ] bread\n  - [ ] sourdough'))).toEqual([]);
  });

  test('ticks, reorders, adds and deletes', () => {
    const ops = diffListText(existing, parse('- [ ] eggs\n- [x] milk'));
    expect(summarize(ops)).toEqual({ created: 1, updated: 1, deleted: 2 });
    expect(ops.find((op) => op.kind === 'update')).toMatchObject({ task: { id: 'a' }, patch: { completed: true, sort_order: 20 } });
    expect(ops.filter((op) => op.kind === 'delete').map((op) => op.kind === 'delete' && op.task.id)).toEqual(['b', 'c']);
  });

  test('outdenting a checklist item lifts it to the top', () => {
    const ops = diffListText(existing, parse('- [ ] milk\n- [ ] bread\n- [ ] sourdough'));
    expect(ops).toEqual([
      { kind: 'update', task: existing[1].children[0], patch: { parent_uid: null, sort_order: 30, etag: 'e' } },
    ]);
  });
});
