import type { Task } from '@/api/types';

/**
 * Trims, drops empties, and removes case-insensitive duplicates while keeping
 * the first spelling seen. CalDAV `CATEGORIES` is case-sensitive, so without
 * this a user who types "work" next to an existing "Work" ends up with two
 * tags that look identical in the UI.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw
      .normalize('NFC')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/** Finds an existing tag that differs only by case, so we reuse its spelling. */
export function matchTagIgnoringCase(
  tags: readonly string[],
  candidate: string
): string | undefined {
  const normalized = normalizeTags([candidate])[0];
  if (!normalized) return undefined;
  const key = normalized.toLowerCase();
  return tags.find((tag) => normalizeTags([tag])[0]?.toLowerCase() === key);
}

// Gathers every distinct tag across the task tree, sorted, for the tag picker.
export function collectAllTags(tasks: Task[]): string[] {
  const all: string[] = [];
  const walk = (items: Task[]) => {
    for (const item of items) {
      all.push(...item.tags);
      walk(item.children);
    }
  };
  walk(tasks);
  return normalizeTags(all).sort((a, b) => a.localeCompare(b));
}
