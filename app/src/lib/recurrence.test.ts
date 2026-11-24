import { describe, expect, test } from 'bun:test';

import type { Task } from '@/api/types';
import { parseQuickAdd } from '@/lib/quick-add';
import { describeRrule, firstDue, nextDue, parseRrule, shorthandToRrule } from '@/lib/recurrence';
import { completionPercent, textStats, togglePatch } from '@/lib/task-actions';

// Local-time constructors keep these independent of the machine's zone.
const local = (y: number, m: number, d: number, h = 9, mi = 0) => new Date(y, m - 1, d, h, mi);
const iso = (y: number, m: number, d: number, h = 9, mi = 0) => local(y, m, d, h, mi).toISOString();

describe('rrule parsing', () => {
  test('reads the supported subset', () => {
    expect(parseRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).toEqual({ freq: 'WEEKLY', interval: 2, weekday: 1 });
    expect(parseRrule('RRULE:FREQ=MONTHLY;BYMONTHDAY=31')).toEqual({ freq: 'MONTHLY', interval: 1, monthDay: 31 });
  });

  test('refuses rules it would get wrong', () => {
    expect(parseRrule('FREQ=WEEKLY;BYDAY=MO,WE')).toBeNull();
    expect(parseRrule('FREQ=MONTHLY;BYDAY=1MO')).toBeNull();
    expect(parseRrule('FREQ=DAILY;COUNT=5')).toBeNull();
    expect(parseRrule('FREQ=HOURLY')).toBeNull();
    expect(describeRrule('FREQ=DAILY;COUNT=5')).toBe('Repeats');
  });

  test('describes rules in words', () => {
    expect(describeRrule('FREQ=DAILY;INTERVAL=3')).toBe('Every 3 days');
    expect(describeRrule('FREQ=WEEKLY;BYDAY=FR')).toBe('Every week on Friday');
    expect(describeRrule('FREQ=MONTHLY;BYMONTHDAY=22')).toBe('Every month on the 22nd');
    expect(describeRrule('FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25')).toBe('Every year on Dec 25');
  });
});

describe('next due date', () => {
  const now = local(2026, 7, 20, 8);

  test('steps from the due date and keeps the time', () => {
    expect(nextDue(iso(2026, 7, 20, 18), 'FREQ=DAILY', now)).toBe(iso(2026, 7, 21, 18));
    expect(nextDue(iso(2026, 7, 20), 'FREQ=WEEKLY;BYDAY=MO', now)).toBe(iso(2026, 7, 27));
    expect(nextDue(iso(2026, 7, 22), 'FREQ=WEEKLY;BYDAY=MO', now)).toBe(iso(2026, 7, 27));
  });

  test('skips past occurrences instead of landing in the past', () => {
    expect(nextDue(iso(2026, 7, 1), 'FREQ=DAILY', now)).toBe(iso(2026, 7, 20));
  });

  test('clamps month ends', () => {
    const jan = local(2027, 1, 31);
    expect(nextDue(jan.toISOString(), 'FREQ=MONTHLY;BYMONTHDAY=31', local(2027, 1, 31, 8))).toBe(iso(2027, 2, 28));
    expect(nextDue(iso(2027, 2, 28), 'FREQ=MONTHLY;BYMONTHDAY=31', local(2027, 2, 28, 8))).toBe(iso(2027, 3, 31));
  });

  test('stops at UNTIL', () => {
    expect(nextDue(iso(2026, 7, 20), 'FREQ=DAILY;UNTIL=20260720', now)).toBeNull();
  });
});

describe('repeat shorthand', () => {
  test('maps every token form', () => {
    expect(shorthandToRrule('3d')).toBe('FREQ=DAILY;INTERVAL=3');
    expect(shorthandToRrule('1w')).toBe('FREQ=WEEKLY');
    expect(shorthandToRrule('m15')).toBe('FREQ=MONTHLY;BYMONTHDAY=15');
    expect(shorthandToRrule('wmo')).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(shorthandToRrule('y12-25')).toBe('FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25');
    expect(shorthandToRrule('0d')).toBeNull();
    expect(shorthandToRrule('y13-01')).toBeNull();
  });

  test('first due date lands on the next match', () => {
    // 2026-07-20 is a Monday.
    expect(firstDue('FREQ=WEEKLY;BYDAY=WE', local(2026, 7, 20))).toBe(local(2026, 7, 22, 0).toISOString());
    expect(firstDue('FREQ=MONTHLY;BYMONTHDAY=5', local(2026, 7, 20))).toBe(local(2026, 8, 5, 0).toISOString());
  });
});

describe('quick add', () => {
  const now = local(2026, 7, 20, 10);

  test('makes a list from /Name', () => {
    expect(parseQuickAdd('/Groceries', now)).toEqual({ kind: 'list', name: 'Groceries' });
  });

  test('pulls out repeat, time and tags', () => {
    const parsed = parseQuickAdd('water plants !wmo @0730 #home', now);
    expect(parsed).toEqual({
      kind: 'task',
      title: 'water plants',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      due_at: iso(2026, 7, 20, 7, 30),
      tags: ['home'],
    });
  });

  test('a time already past means tomorrow', () => {
    const parsed = parseQuickAdd('call mum @0900', now);
    expect(parsed.kind === 'task' && parsed.due_at).toBe(iso(2026, 7, 21, 9));
    const pm = parseQuickAdd('call mum @0630p', now);
    expect(pm.kind === 'task' && pm.due_at).toBe(iso(2026, 7, 20, 18, 30));
  });

  test('leaves look-alikes in the title', () => {
    const parsed = parseQuickAdd('email bob@1800.com about !important', now);
    expect(parsed).toMatchObject({ title: 'email bob@1800.com about !important', rrule: null, due_at: null });
  });

  test('a title of only tokens stays as typed', () => {
    expect(parseQuickAdd('#home', now)).toMatchObject({ title: '#home', tags: [] });
  });
});

describe('task actions', () => {
  const task = (patch: Partial<Task>) => ({ completed: false, etag: 'e', ...patch }) as Task;

  test('a repeating to-do moves forward with its reminder', () => {
    const result = togglePatch(
      task({ rrule: 'FREQ=DAILY', due_at: iso(2026, 7, 20, 18), reminder_at: iso(2026, 7, 20, 17, 30) }),
      local(2026, 7, 20, 12)
    );
    expect(result.repeated).toBe(true);
    expect(result.patch).toEqual({
      completed: false,
      due_at: iso(2026, 7, 21, 18),
      reminder_at: iso(2026, 7, 21, 17, 30),
      etag: 'e',
    });
  });

  test('other to-dos just toggle', () => {
    expect(togglePatch(task({ completed: true, rrule: 'FREQ=DAILY' })).patch).toEqual({ completed: false, etag: 'e' });
    expect(togglePatch(task({})).patch).toEqual({ completed: true, etag: 'e' });
  });

  test('percent and text stats', () => {
    expect(completionPercent([])).toBeNull();
    expect(completionPercent([{ completed: true }, { completed: false }, { completed: false }])).toBe(33);
    expect(textStats('  two words\n')).toEqual({ words: 2, characters: 12 });
  });
});
