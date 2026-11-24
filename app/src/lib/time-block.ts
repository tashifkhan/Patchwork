import type { Task } from '@/api/types';

/**
 * Time blocks: a to-do with a start (`start_at`, VTODO DTSTART) and an end
 * (`due_at`, VTODO DUE). These helpers keep the two consistent when either
 * moves, and lay a day's blocks out on the calendar timeline.
 */

export const DEFAULT_BLOCK_MINUTES = 60;
const MIN_BLOCK_MINUTES = 15;
const MINUTE = 60_000;

/** A due time of 23:59 means "some time that day" (see `atDay`), not a time. */
export function isDateOnly(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const date = new Date(iso);
  return date.getHours() === 23 && date.getMinutes() === 59;
}

export interface Block {
  start: Date;
  end: Date;
}

/**
 * Where a to-do sits on the day's timeline: its block, or for a to-do due at a
 * set time, a short block ending then. Null for to-dos with no time of day.
 */
export function blockOf(task: Pick<Task, 'start_at' | 'due_at'>, shortMinutes = 30): Block | null {
  if (task.start_at && task.due_at) {
    const start = new Date(task.start_at);
    const end = new Date(task.due_at);
    if (end.getTime() > start.getTime()) return { start, end };
  }
  if (!task.due_at || isDateOnly(task.due_at)) return null;
  const end = new Date(task.due_at);
  return { start: new Date(end.getTime() - shortMinutes * MINUTE), end };
}

export function blockMinutes(task: Pick<Task, 'start_at' | 'due_at'>): number | null {
  if (!task.start_at || !task.due_at) return null;
  const minutes = Math.round((new Date(task.due_at).getTime() - new Date(task.start_at).getTime()) / MINUTE);
  return minutes > 0 ? minutes : null;
}

function at(day: Date, hours: number, minutes: number): Date {
  const next = new Date(day);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

/** The day a block lives on: the due day, or today. */
function blockDay(value: { start_at?: string | null; due_at: string | null }, now: Date): Date {
  return value.start_at ? new Date(value.start_at) : value.due_at ? new Date(value.due_at) : now;
}

/**
 * Moves the start. The block keeps its length, or gets an hour if it had
 * none, so the end never lands before the start.
 */
export function withStart(
  value: { start_at?: string | null; due_at: string | null },
  hours: number,
  minutes: number,
  now: Date = new Date()
): { start_at: string; due_at: string } {
  const start = at(blockDay(value, now), hours, minutes);
  const length = blockMinutes(value) ?? DEFAULT_BLOCK_MINUTES;
  return { start_at: start.toISOString(), due_at: new Date(start.getTime() + length * MINUTE).toISOString() };
}

/**
 * Moves the end. With no start yet the block begins an hour earlier; an end
 * at or before the start pushes it to a quarter hour after.
 */
export function withEnd(
  value: { start_at?: string | null; due_at: string | null },
  hours: number,
  minutes: number,
  now: Date = new Date()
): { start_at: string; due_at: string } {
  const day = blockDay(value, now);
  let end = at(day, hours, minutes);
  const start = value.start_at ? new Date(value.start_at) : new Date(end.getTime() - DEFAULT_BLOCK_MINUTES * MINUTE);
  if (end.getTime() - start.getTime() < MIN_BLOCK_MINUTES * MINUTE) {
    end = new Date(start.getTime() + MIN_BLOCK_MINUTES * MINUTE);
  }
  return { start_at: start.toISOString(), due_at: end.toISOString() };
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function formatTime(date: Date): string {
  return timeFormat.format(date);
}

/** "2:00 PM – 3:30 PM". */
export function formatBlock(block: Block): string {
  return `${formatTime(block.start)} – ${formatTime(block.end)}`;
}

/** "1h 30m", "45m". */
export function formatLength(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export interface PlacedBlock<T> {
  item: T;
  block: Block;
  /** Column within its overlap group, from 0. */
  lane: number;
  /** Columns the overlap group splits into. */
  lanes: number;
}

/**
 * Lays blocks out side by side where they overlap, like a calendar day view:
 * each overlapping group splits the width into as many columns as it needs,
 * and every block takes the first free column.
 */
export function placeBlocks<T>(items: { item: T; block: Block }[]): PlacedBlock<T>[] {
  const sorted = [...items].sort(
    (a, b) =>
      a.block.start.getTime() - b.block.start.getTime() || b.block.end.getTime() - a.block.end.getTime()
  );
  const placed: PlacedBlock<T>[] = [];
  let group: PlacedBlock<T>[] = [];
  let groupEnd = -Infinity;
  const closeGroup = () => {
    const lanes = Math.max(1, ...group.map((p) => p.lane + 1));
    for (const p of group) p.lanes = lanes;
    group = [];
  };
  for (const entry of sorted) {
    const start = entry.block.start.getTime();
    if (start >= groupEnd && group.length) {
      closeGroup();
      groupEnd = -Infinity;
    }
    // First lane whose last block has ended.
    let lane = 0;
    while (group.some((p) => p.lane === lane && p.block.end.getTime() > start)) lane += 1;
    const next: PlacedBlock<T> = { ...entry, lane, lanes: 1 };
    group.push(next);
    placed.push(next);
    groupEnd = Math.max(groupEnd, entry.block.end.getTime());
  }
  if (group.length) closeGroup();
  return placed;
}

/** Minutes since midnight, for placing a time on the timeline. */
export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}
