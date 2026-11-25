import { expect, test } from 'bun:test';

import { buildTaskTree, matchesTask, taskLink, taskRef, type Task } from './model';
import { findTaskRow, liftOpenSubtasks } from './task-buckets';

function task(id: string, uid: string, listId: string, parentUid: string | null = null): Task {
  return {
    id, uid, list_id: listId, list_name: listId, account_id: 'account',
    title: id, description: '', markdown: '', completed: false, priority: null,
    due_at: null, reminder_at: null, tags: [], sort_order: null, parent_uid: parentUid,
    children: [], etag: null, updated_at: null,
  };
}

test('a copied UID is visible in both calendars and each parent owns its own child', () => {
  const work = task('work/parent.ics', 'parent', 'account:work');
  const home = task('home/parent.ics', 'parent', 'account:home');
  const child = task('work/child.ics', 'child', 'account:work', 'parent');
  const roots = buildTaskTree([work, home, child]);

  expect(roots.map((root) => root.id)).toEqual([work.id, home.id]);
  expect(roots[0]?.children.map((item) => item.id)).toEqual([child.id]);
  expect(roots[1]?.children).toEqual([]);
  expect(matchesTask(home, taskRef(work))).toBe(false);
  expect(taskLink(taskRef(work))).toBe('/task/parent?account=account&list=account%3Awork');
});

test('a cyclic CalDAV relationship leaves both tasks visible', () => {
  const first = task('first', 'first', 'account:work', 'second');
  const second = task('second', 'second', 'account:work', 'first');
  expect(buildTaskTree([first, second])).toEqual([first, second]);
});

test('opening a checklist result selects its own parent when another calendar has a copy', () => {
  const work = task('work/parent.ics', 'parent', 'account:work');
  const home = task('home/parent.ics', 'parent', 'account:home');
  const child = task('home/child.ics', 'child', 'account:home', home.uid);
  const roots = buildTaskTree([work, home, child]);

  expect(findTaskRow(roots, taskRef(child))?.id).toBe(home.id);

  const lifted = liftOpenSubtasks(buildTaskTree([work, { ...home, completed: true }, child]));
  expect(findTaskRow(lifted, taskRef(child))?.id).toBe(child.id);
});
