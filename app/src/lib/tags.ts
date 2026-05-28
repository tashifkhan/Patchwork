import type { Task } from '@/api/types';

// Gathers every distinct tag across the task tree, sorted, for the tag picker.
export function collectAllTags(tasks: Task[]): string[] {
  const set = new Set<string>();
  const walk = (items: Task[]) => {
    for (const item of items) {
      item.tags.forEach((tag) => set.add(tag));
      walk(item.children);
    }
  };
  walk(tasks);
  return [...set].sort();
}
