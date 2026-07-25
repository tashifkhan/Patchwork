import { describe, expect, test } from 'bun:test';

import type { Task } from '@/api/types';
import { bucketOf, flattenTasks } from '@/lib/task-buckets';

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
});
