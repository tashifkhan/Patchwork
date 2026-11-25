import { expect, test } from 'bun:test';

import { boardSearchNodes, createSearchIndex } from '@/features/search/search-index';

test('boards are searchable by name and open by ref', () => {
  const nodes = boardSearchNodes([
    { ref: 'deck:3', source: 'deck', title: 'NovaBoard Mobile App', subtitle: 'cloud.example.com' },
    { ref: 'jira:12', source: 'jira', title: 'Platform sprint board', subtitle: 'PLAT' },
  ]);
  const hits = createSearchIndex(nodes).search('nova');
  expect(hits.map((hit) => hit.item.boardRef)).toEqual(['deck:3']);
  expect(nodes[1].listName).toBe('Jira board · PLAT');
});
