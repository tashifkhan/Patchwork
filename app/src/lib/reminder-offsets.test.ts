import { describe, expect, test } from 'bun:test';

import { formatReminderOffset, normalizeReminderOffsets, reminderBody, reminderTimes } from './reminder-offsets';

describe('formatReminderOffset', () => {
  test('uses the largest whole unit', () => {
    expect(formatReminderOffset(0)).toBe('At due time');
    expect(formatReminderOffset(15)).toBe('15 minutes before');
    expect(formatReminderOffset(60)).toBe('1 hour before');
    expect(formatReminderOffset(2880)).toBe('2 days before');
    expect(formatReminderOffset(10080)).toBe('1 week before');
    expect(reminderBody(1440)).toBe('Due tomorrow');
    expect(reminderBody(30)).toBe('Due in 30 minutes');
  });
});

describe('reminderTimes', () => {
  const due = new Date('2026-11-10T10:00:00Z');
  const now = new Date('2026-11-09T12:00:00Z').getTime();

  test('one per offset before the due time, past ones dropped, soonest first', () => {
    const times = reminderTimes({ reminderAt: null, dueAt: due, offsets: [0, 60, 1440], now });
    expect(times.map((time) => time.offset)).toEqual([60, 0]);
    expect(times[0].date.toISOString()).toBe('2026-11-10T09:00:00.000Z');
  });

  test("a task's own reminder replaces the defaults", () => {
    const own = new Date('2026-11-10T08:00:00Z');
    expect(reminderTimes({ reminderAt: own, dueAt: due, offsets: [0, 60], now })).toEqual([
      { date: own, offset: null },
    ]);
  });

  test('no due date and no reminder means no notifications', () => {
    expect(reminderTimes({ reminderAt: null, dueAt: null, offsets: [0], now })).toEqual([]);
  });
});

describe('normalizeReminderOffsets', () => {
  test('dedupes, sorts earliest reminder first and caps the count', () => {
    expect(normalizeReminderOffsets([0, 60, 60, -5, 1440, 5, 10, 15])).toEqual([1440, 60, 15, 10, 5]);
  });
});
