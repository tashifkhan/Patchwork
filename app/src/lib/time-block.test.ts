import { describe, expect, test } from 'bun:test';

import { blockMinutes, blockOf, isDateOnly, placeBlocks, withEnd, withStart } from './time-block';

const day = (h: number, m = 0) => new Date(2026, 10, 23, h, m).toISOString();

describe('time blocks', () => {
  test('23:59 is a date without a time', () => {
    expect(isDateOnly(day(23, 59))).toBe(true);
    expect(isDateOnly(day(14))).toBe(false);
  });

  test('a block, a timed due date, or nothing', () => {
    expect(blockOf({ start_at: day(9), due_at: day(10) })?.start.getHours()).toBe(9);
    const timed = blockOf({ start_at: null, due_at: day(15) });
    expect(timed?.end.getHours()).toBe(15);
    expect(timed?.start.getMinutes()).toBe(30);
    expect(blockOf({ start_at: null, due_at: day(23, 59) })).toBeNull();
  });

  test('moving the start keeps the length', () => {
    const next = withStart({ start_at: day(9), due_at: day(10, 30) }, 13, 0);
    expect(new Date(next.start_at).getHours()).toBe(13);
    expect(blockMinutes(next)).toBe(90);
  });

  test('a first start gets an hour on the due day', () => {
    const next = withStart({ start_at: null, due_at: day(23, 59) }, 8, 15);
    expect(new Date(next.due_at).getDate()).toBe(23);
    expect(blockMinutes(next)).toBe(60);
  });

  test('an end before the start is pushed past it', () => {
    const next = withEnd({ start_at: day(14), due_at: day(15) }, 13, 0);
    expect(blockMinutes(next)).toBe(15);
  });

  test('overlapping blocks split into lanes', () => {
    const placed = placeBlocks([
      { item: 'a', block: { start: new Date(day(9)), end: new Date(day(11)) } },
      { item: 'b', block: { start: new Date(day(10)), end: new Date(day(12)) } },
      { item: 'c', block: { start: new Date(day(13)), end: new Date(day(14)) } },
    ]);
    const by = Object.fromEntries(placed.map((p) => [p.item, p]));
    expect([by.a.lane, by.a.lanes]).toEqual([0, 2]);
    expect([by.b.lane, by.b.lanes]).toEqual([1, 2]);
    expect([by.c.lane, by.c.lanes]).toEqual([0, 1]);
  });
});
