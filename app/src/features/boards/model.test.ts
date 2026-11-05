import { describe, expect, test } from 'bun:test';

import { activeFilterCount, applyFilters, EMPTY_FILTERS, filterFacets, type BoardColumnItem } from './model';

const columns: BoardColumnItem[] = [
  {
    id: 'todo',
    title: 'To Do',
    cards: [
      { id: 'A-1', title: 'Bug one', typeName: 'Bug', priorityName: 'High', labels: [{ title: 'api' }] },
      { id: 'A-2', title: 'Task one', typeName: 'Task', priorityName: 'Low', labels: [] },
    ],
  },
  {
    id: 'doing',
    title: 'Doing',
    cards: [{ id: 'A-3', title: 'Task two', typeName: 'Task', priorityName: 'Highest', labels: [{ title: 'ui' }] }],
  },
];

describe('board filters', () => {
  test('facets list only values on the board, priorities in Jira order', () => {
    const facets = filterFacets(columns);
    expect(facets.types).toEqual(['Bug', 'Task']);
    expect(facets.priorities).toEqual(['Highest', 'High', 'Low']);
    expect(facets.labels).toEqual(['api', 'ui']);
  });

  test('no filters keeps every card', () => {
    expect(applyFilters(columns, EMPTY_FILTERS)).toBe(columns);
  });

  test('values within a group are OR, groups are AND', () => {
    const filtered = applyFilters(columns, { types: ['Task'], priorities: ['Low', 'Highest'], labels: [] });
    expect(filtered.map((column) => column.cards.map((card) => card.id))).toEqual([['A-2'], ['A-3']]);

    const narrower = applyFilters(columns, { types: ['Task'], priorities: [], labels: ['ui'] });
    expect(narrower.flatMap((column) => column.cards.map((card) => card.id))).toEqual(['A-3']);
  });

  test('columns stay even when filtered empty', () => {
    const filtered = applyFilters(columns, { types: ['Bug'], priorities: [], labels: [] });
    expect(filtered).toHaveLength(2);
    expect(filtered[1].cards).toHaveLength(0);
    expect(activeFilterCount({ types: ['Bug'], priorities: ['High'], labels: [] })).toBe(2);
  });
});
