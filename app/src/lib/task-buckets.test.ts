import { describe, expect, test } from 'bun:test';

import type { Task } from '@/api/types';
import { bucketOf, flattenTasks, liftOpenSubtasks } from '@/lib/task-buckets';

const now = new Date('2026-07-20T10:00:00.000Z');

describe('task buckets', () => {
  test('classifies dates relative to the supplied clock', () => {
    expect(bucketOf({ due_at: '2026-07-19T12:00:00.000Z' }, now)).toBe('overdue');
    expect(bucketOf({ due_at: '2026-07-20T12:00:00.000Z' }, now)).toBe('today');
    expect(bucketOf({ due_at: '2026-07-21T12:00:00.000Z' }, now)).toBe('tomorrow');
    expect(bucketOf({ due_at: '2026-07-24T12:00:00.000Z' }, now)).toBe('upcoming');
    expect(bucketOf({ due_at: null }, now)).toBe('none');
  });

  test('flattens nested tasks without losing order', () => {
    const child = { id: 'child', uid: 'child', children: [] } as unknown as Task;
    const parent = { id: 'parent', uid: 'parent', children: [child] } as unknown as Task;
    expect(flattenTasks([parent]).map((task) => task.id)).toEqual(['parent', 'child']);
  });

  test('lifts open subtasks out of a finished parent', () => {
    const task = (id: string, completed: boolean, children: Task[] = []) =>
      ({ id, uid: id, completed, children }) as unknown as Task;
    const openChild = task('open', false);
    const doneChild = task('done', true);
    const grandchild = task('grand', false);
    const doneMiddle = task('middle', true, [grandchild]);
    const parent = task('parent', true, [openChild, doneChild, doneMiddle]);
    const result = liftOpenSubtasks([parent]);
    expect(result.map((t) => t.id)).toEqual(['parent', 'open', 'grand']);
    expect(result[0].children.map((t) => t.id)).toEqual(['done', 'middle']);
    expect(result[0].children[1].children).toEqual([]);
  });

  test('leaves the tree alone when nothing needs lifting', () => {
    const child = { id: 'c', uid: 'c', completed: false, children: [] } as unknown as Task;
    const parent = { id: 'p', uid: 'p', completed: false, children: [child] } as unknown as Task;
    const input = [parent];
    expect(liftOpenSubtasks(input)).toBe(input);
  });
});
