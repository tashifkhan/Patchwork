import type { Task } from '@/api/types';
import { planFromLists, type ImportPlan } from '@/lib/backup';
import { shorthandToRrule } from '@/lib/recurrence';
import { flattenTasks } from '@/lib/task-buckets';
import type { TextTask } from '@/lib/task-text';

/**
 * Karui's QR format, so the two apps can scan each other's codes.
 *
 * A tab is JSON: `{ v: 1, t: "Tab", m: null, n: [{ i, x, c, u, p?, s?, r?, tm? }] }`
 * where `x` is the note text, `c` done, `p` pinned, `s` a `YYYY-MM-DD` date,
 * `r` a repeat token (`1d`, `wmo`…) and `tm` an `HH:MM` time. Anything over
 * 1250 bytes is split into frames: `KARUI1/<id>/<seq>/<total>/<chunk>`.
 */

const PREFIX = 'KARUI1';
const MAX_CHUNK_BYTES = 1250;

interface KaruiNote {
  i: number;
  x: string;
  c: 0 | 1;
  u: number;
  p?: 1;
  s?: string;
  r?: string;
  tm?: string;
}

export interface KaruiPayload {
  v: 1;
  t: string;
  m: null;
  n: KaruiNote[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A list as a Karui tab. Checklist items become their own notes, indented with "  - ". */
export function buildKaruiPayload(name: string, tasks: Task[]): string {
  const now = Date.now();
  const notes: KaruiNote[] = [];
  let id = now;
  const add = (task: Task, depth: number) => {
    const text = [depth ? `${'  '.repeat(depth - 1)}- ${task.title}` : task.title, task.markdown.trim()]
      .filter(Boolean)
      .join('\n');
    const note: KaruiNote = { i: (id += 1), x: text, c: task.completed ? 1 : 0, u: now };
    if (task.pinned) note.p = 1;
    if (task.due_at) {
      const d = new Date(task.due_at);
      note.s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      if (d.getHours() !== 23 || d.getMinutes() !== 59) note.tm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    notes.push(note);
    task.children.forEach((child) => add(child, depth + 1));
  };
  tasks.forEach((task) => add(task, 0));
  return JSON.stringify({ v: 1, t: name, m: null, n: notes } satisfies KaruiPayload);
}

/** One string per QR frame. A short payload is a single bare JSON frame. */
export function karuiFrames(payload: string, maxBytes = MAX_CHUNK_BYTES): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(payload).length <= maxBytes) return [payload];
  const id = Math.random().toString(36).slice(2, 8).toUpperCase();
  const chunks: string[] = [];
  let i = 0;
  while (i < payload.length) {
    let lo = i + 1;
    let hi = payload.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (encoder.encode(payload.slice(i, mid)).length <= maxBytes) lo = mid;
      else hi = mid - 1;
    }
    // Never cut between the two halves of an emoji.
    const code = payload.charCodeAt(lo - 1);
    if (lo < payload.length && lo - 1 > i && code >= 0xd800 && code <= 0xdbff) lo -= 1;
    chunks.push(payload.slice(i, lo));
    i = lo;
  }
  return chunks.map((data, index) => `${PREFIX}/${id}/${index + 1}/${chunks.length}/${data}`);
}

/**
 * Collects scanned frames until a payload is complete. Feed every scan to
 * `add`; it returns the joined payload once all frames of a batch are in.
 */
export class FrameCollector {
  private batches = new Map<string, { total: number; parts: (string | undefined)[] }>();

  add(text: string): { complete: string | null; progress: { have: number; total: number } | null } {
    if (!text.startsWith(`${PREFIX}/`)) return { complete: text, progress: null };
    const parts = text.slice(PREFIX.length + 1).split('/');
    if (parts.length < 4) return { complete: null, progress: null };
    const [id, seqRaw, totalRaw] = parts;
    const seq = Number.parseInt(seqRaw, 10);
    const total = Number.parseInt(totalRaw, 10);
    if (!id || !(seq >= 1 && seq <= total)) return { complete: null, progress: null };
    const batch = this.batches.get(id) ?? { total, parts: [] };
    batch.parts[seq - 1] = parts.slice(3).join('/');
    this.batches.set(id, batch);
    const have = batch.parts.filter((part) => part !== undefined).length;
    if (have === batch.total) {
      this.batches.delete(id);
      return { complete: batch.parts.join(''), progress: { have, total } };
    }
    return { complete: null, progress: { have, total } };
  }
}

/** Reads a Karui tab payload into an import plan, or null when it isn't one. */
export function planFromKarui(text: string): ImportPlan | null {
  let payload: Partial<KaruiPayload>;
  try {
    payload = JSON.parse(text) as Partial<KaruiPayload>;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.n)) return null;
  const tasks: (TextTask & { due?: string | null; rrule?: string | null; pinned?: boolean })[] = [];
  for (const note of payload.n) {
    if (!note || typeof note.x !== 'string' || !note.x.trim()) continue;
    // Locked Karui tabs travel encrypted; there's no way to read those here.
    if (note.x.startsWith('[enc]')) continue;
    const [first, ...rest] = note.x.replace(/^\d{4}-\d{2}-\d{2}\s+/, '').split('\n');
    tasks.push({
      title: first.replace(/^\s*-\s+/, '').trim(),
      completed: note.c === 1,
      tags: [],
      notes: rest.join('\n').trim(),
      children: [],
      pinned: note.p === 1,
      rrule: note.r ? shorthandToRrule(note.r) : null,
      due: karuiDue(note.s, note.tm),
    });
  }
  const plan = planFromLists([{ name: typeof payload.t === 'string' && payload.t ? payload.t : 'Karui', tasks }]);
  // planFromLists only knows the text fields; add dates, repeats and pins.
  plan.lists[0]?.tasks.forEach((entry, index) => {
    const source = tasks[index];
    entry.payload = { ...entry.payload, due_at: source.due ?? null, rrule: source.rrule ?? null, pinned: source.pinned };
  });
  return plan;
}

function karuiDue(date?: string, time?: string): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time && /^\d{2}:\d{2}$/.test(time) ? time.split(':').map(Number) : [23, 59];
  return new Date(y, m - 1, d, h, mi).toISOString();
}

/** Every to-do in the list as Karui frames, open ones only unless asked. */
export function listToKaruiFrames(name: string, tasks: Task[]) {
  return karuiFrames(buildKaruiPayload(name, tasks));
}

export const countTasks = (tasks: Task[]) => flattenTasks(tasks).length;
