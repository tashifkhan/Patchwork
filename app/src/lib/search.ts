import Fuse, { type IFuseOptions } from 'fuse.js';

import type { DeckStack, Task } from '@/api/types';

export interface SearchNode {
  id: string;
  type: 'task' | 'subtask' | 'deck-card';
  title: string;
  descriptionText: string;
  tags: string[];
  listName: string;
  parentTitle?: string;
  // Where to navigate / how to resolve the original record.
  taskUid?: string;
  boardId?: number;
  stackId?: number;
  cardId?: number;
}

export const fuseOptions: IFuseOptions<SearchNode> = {
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'tags', weight: 0.3 },
    { name: 'descriptionText', weight: 0.15 },
    { name: 'listName', weight: 0.05 },
  ],
  threshold: 0.3,
  includeMatches: true,
  ignoreLocation: true,
};

function flattenTask(task: Task, parentTitle: string | undefined, out: SearchNode[]) {
  out.push({
    id: `task:${task.id}`,
    type: parentTitle ? 'subtask' : 'task',
    title: task.title,
    descriptionText: task.markdown || task.description || '',
    tags: task.tags,
    listName: task.list_name,
    parentTitle,
    taskUid: task.uid,
  });
  for (const child of task.children) {
    flattenTask(child, task.title, out);
  }
}

export function buildSearchNodes(
  tasks: Task[],
  deck: { boardId: number; boardTitle: string; stacks: DeckStack[] }[]
): SearchNode[] {
  const nodes: SearchNode[] = [];

  for (const task of tasks) {
    flattenTask(task, undefined, nodes);
  }

  for (const board of deck) {
    for (const stack of board.stacks) {
      for (const card of stack.cards ?? []) {
        nodes.push({
          id: `deck-card:${board.boardId}:${card.id ?? card.title}`,
          type: 'deck-card',
          title: card.title ?? 'Untitled card',
          descriptionText: card.description ?? '',
          tags: (card.labels ?? []).map((label) => label.title ?? '').filter(Boolean),
          listName: `${board.boardTitle} › ${stack.title ?? ''}`,
          boardId: board.boardId,
          stackId: stack.id,
          cardId: card.id,
        });
      }
    }
  }

  return nodes;
}

export function createSearchIndex(nodes: SearchNode[]) {
  return new Fuse(nodes, fuseOptions);
}
