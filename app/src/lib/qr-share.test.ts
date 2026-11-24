import { describe, expect, test } from 'bun:test';

import type { Task } from '@/api/types';
import { buildSharePayload, FRAME_PREFIX, FrameCollector, planFromSharePayload, shareFrames } from '@/lib/qr-share';

const task = (title: string, patch: Partial<Task> = {}): Task =>
  ({ title, completed: false, tags: [], markdown: '', children: [], ...patch }) as Task;

describe('qr share', () => {
  test('a list round-trips through the share payload', () => {
    const due = new Date(2026, 6, 20, 18, 30).toISOString();
    const payload = buildSharePayload('Home', [
      task('water plants', { pinned: true, due_at: due, markdown: 'the big ones' }),
      task('done thing', { completed: true }),
    ]);
    const plan = planFromSharePayload(payload)!;
    expect(plan.lists[0].name).toBe('Home');
    expect(plan.lists[0].tasks.map((t) => t.payload)).toEqual([
      expect.objectContaining({ title: 'water plants', markdown: 'the big ones', pinned: true, due_at: due }),
      expect.objectContaining({ title: 'done thing', completed: true, due_at: null }),
    ]);
  });

  test('reads a shared list with repeats and skips encrypted notes', () => {
    const plan = planFromSharePayload(
      JSON.stringify({
        v: 1,
        t: 'Main',
        m: null,
        n: [
          { i: 1, x: 'gym', c: 0, u: 1, r: 'wmo', s: '2026-07-20', tm: '07:00' },
          { i: 2, x: '[enc]abcd', c: 0, u: 1 },
        ],
      })
    )!;
    expect(plan.total).toBe(1);
    expect(plan.lists[0].tasks[0].payload).toMatchObject({
      title: 'gym',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      due_at: new Date(2026, 6, 20, 7, 0).toISOString(),
    });
  });

  test('long payloads split into frames and join back in any order', () => {
    const payload = buildSharePayload('Big', Array.from({ length: 80 }, (_, i) => task(`item number ${i} with some words`)));
    const frames = shareFrames(payload);
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.every((f) => f.startsWith(`${FRAME_PREFIX}/`))).toBe(true);
    const collector = new FrameCollector();
    let complete: string | null = null;
    for (const frame of [...frames].reverse()) complete = collector.add(frame).complete ?? complete;
    expect(complete).toBe(payload);
  });
});
