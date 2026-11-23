import { describe, expect, test } from 'bun:test';

import type { Task, TaskList } from '@/api/types';

import { listSwatch, LIST_SWATCHES, matchesSmart, smartCounts, summarizeLists } from './smart-lists';

const NOW = new Date(2026, 10, 23, 12, 0, 0);
const day = (offset: number) => new Date(2026, 10, 23 + offset, 9, 0, 0).toISOString();

function task(partial: Partial<Task>): Task {
  return {
    id: partial.id ?? Math.random().toString(36),
    uid: partial.uid ?? 'uid',
    list_id: 'a',
    list_name: 'A',
    title: 't',
    description: '',
    markdown: '',
    completed: false,
    priority: null,
    due_at: null,
    reminder_at: null,
    tags: [],
    ...partial,
  } as Task;
}

describe('smart lists', () => {
  test('sorts open to-dos into today, scheduled and overdue', () => {
    const tasks = [
      task({ due_at: day(0) }),
      task({ due_at: day(1) }),
      task({ due_at: day(9) }),
      task({ due_at: day(-2) }),
      task({ due_at: null }),
      task({ due_at: day(0), completed: true }),
    ];
    expect(smartCounts(tasks, NOW)).toEqual({ today: 1, scheduled: 2, all: 5, overdue: 1 });
  });

  test('only All keeps finished to-dos', () => {
    const done = task({ due_at: day(0), completed: true });
    expect(matchesSmart(done, 'today', NOW)).toBe(false);
    expect(matchesSmart(done, 'all', NOW)).toBe(true);
  });

  test('summarizes lists with subtasks and skips boards', () => {
    const lists: TaskList[] = [
      { id: 'a', href: '', name: 'A', is_deck: false },
      { id: 'b', href: '', name: 'B', is_deck: false },
      { id: 'deck', href: '', name: 'Board', is_deck: true },
    ];
    const tasks = [
      task({ list_id: 'a', children: [task({ list_id: 'a', completed: true })] }),
      task({ list_id: 'b', completed: true }),
      task({ list_id: 'deck' }),
    ];
    expect(summarizeLists(lists, tasks).map(({ list, open, done }) => [list.id, open, done])).toEqual([
      ['a', 1, 1],
      ['b', 0, 1],
    ]);
  });

  test('list colours wrap around', () => {
    expect(listSwatch(LIST_SWATCHES.length)).toBe(LIST_SWATCHES[0]);
  });
});

describe('theme tones', () => {
  test('container tones keep the role hue, pale in light and deep in dark', async () => {
    const { containerTone } = await import('./smart-lists');
    const light = parseInt(containerTone('#0F7A6C', false).fill.slice(1), 16);
    expect((light >> 8) & 255).toBeGreaterThan(light >> 16);
    expect(light >> 16).toBeGreaterThan(170);
    const dark = parseInt(containerTone('#0F7A6C', true).fill.slice(1), 16);
    expect((dark >> 8) & 255).toBeLessThan(110);
  });
});
