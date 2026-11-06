import { describe, expect, test } from 'bun:test';

import {
  activeFilterCount,
  applyFilters,
  EMPTY_FILTERS,
  filterFacets,
  groupBySprint,
  type BoardColumnItem,
  type CardSprint,
} from './model';

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
    const filtered = applyFilters(columns, { sprints: [], types: ['Task'], priorities: ['Low', 'Highest'], labels: [] });
    expect(filtered.map((column) => column.cards.map((card) => card.id))).toEqual([['A-2'], ['A-3']]);

    const narrower = applyFilters(columns, { sprints: [], types: ['Task'], priorities: [], labels: ['ui'] });
    expect(narrower.flatMap((column) => column.cards.map((card) => card.id))).toEqual(['A-3']);
  });

  test('columns stay even when filtered empty', () => {
    const filtered = applyFilters(columns, { sprints: [], types: ['Bug'], priorities: [], labels: [] });
    expect(filtered).toHaveLength(2);
    expect(filtered[1].cards).toHaveLength(0);
    expect(activeFilterCount({ sprints: ['backlog'], types: ['Bug'], priorities: ['High'], labels: [] })).toBe(3);
  });
});

describe('sprint groups', () => {
  const active: CardSprint = { key: 'sprint:1', label: 'Sprint 12', state: 'active', rank: 0 };
  const next: CardSprint = { key: 'sprint:2', label: 'Sprint 13', state: 'future', rank: 1 };
  const backlog: CardSprint = { key: 'backlog', label: 'Backlog', state: 'backlog', rank: Number.MAX_SAFE_INTEGER };
  const mixed: BoardColumnItem[] = [
    {
      id: 'todo',
      title: 'To Do',
      cards: [
        { id: 'A-1', title: 'one', labels: [], sprint: backlog },
        { id: 'A-2', title: 'two', labels: [], sprint: next },
        { id: 'A-3', title: 'three', labels: [], sprint: active },
        { id: 'A-4', title: 'four', labels: [], sprint: active },
      ],
    },
  ];

  test('cards sort into sprint order, keeping rank inside a sprint', () => {
    const { columns, grouped } = groupBySprint(mixed);
    expect(grouped).toBe(true);
    expect(columns[0].cards.map((card) => card.id)).toEqual(['A-3', 'A-4', 'A-2', 'A-1']);
  });

  test('one sprint on screen means no groups', () => {
    const only = applyFilters(mixed, { ...EMPTY_FILTERS, sprints: ['sprint:1'] });
    expect(only[0].cards.map((card) => card.id)).toEqual(['A-3', 'A-4']);
    expect(groupBySprint(only).grouped).toBe(false);
  });

  test('the sprint facet lists sprints in board order, backlog last', () => {
    expect(filterFacets(mixed).sprints.map((sprint) => sprint.key)).toEqual(['sprint:1', 'sprint:2', 'backlog']);
  });
});
