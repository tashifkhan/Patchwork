import { describe, expect, test } from 'bun:test';

import type { Task } from '@/api/types';
import { listsToMarkdown, parseMarkdownLists } from '@/lib/task-text';

const task = (title: string, patch: Partial<Task> = {}): Task =>
  ({ title, completed: false, tags: [], markdown: '', children: [], ...patch }) as Task;

describe('markdown lists', () => {
  test('round-trips lists, nesting, tags and notes', () => {
    const md = listsToMarkdown([
      {
        name: 'Groceries',
        tasks: [
          task('oat milk', { tags: ['shop'], children: [task('the barista one', { completed: true })] }),
          task('bread', { completed: true, markdown: 'sourdough\nif they have it' }),
        ],
      },
      { name: 'Work', tasks: [task('ship it')] },
    ]);
    const lists = parseMarkdownLists(md);
    expect(lists.map((l) => l.name)).toEqual(['Groceries', 'Work']);
    expect(lists[0].tasks[0]).toEqual({
      title: 'oat milk',
      completed: false,
      tags: ['shop'],
      notes: '',
      children: [{ title: 'the barista one', completed: true, tags: [], notes: '', children: [] }],
    });
    expect(lists[0].tasks[1]).toMatchObject({ title: 'bread', completed: true, notes: 'sourdough\nif they have it' });
  });

  test('plain bullets and no heading still import', () => {
    const lists = parseMarkdownLists('- eggs\n* [X] milk\n+ #1 priority', 'Pasted');
    expect(lists).toEqual([
      {
        name: 'Pasted',
        tasks: [
          { title: 'eggs', completed: false, tags: [], notes: '', children: [] },
          { title: 'milk', completed: true, tags: [], notes: '', children: [] },
          { title: '#1 priority', completed: false, tags: [], notes: '', children: [] },
        ],
      },
    ]);
  });

  test('a document title over lists is skipped', () => {
    const lists = parseMarkdownLists('# Patchwork export\n\n## A\n- [ ] one\n');
    expect(lists.map((l) => l.name)).toEqual(['A']);
  });
});
