import { describe, expect, test } from 'bun:test';

import type { JiraBoardDetail } from '@/api/jira';

import {
  activeFilterCount,
  checklistItems,
  searchColumns,
  noteOf,
  applyFilters,
  EMPTY_FILTERS,
  filterFacets,
  groupBySprint,
  withIssueSprint,
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


test('card note skips headings markers and checklists', () => {
  expect(noteOf('## Brief\n- [ ] one\nClient wants **more** whitespace.')).toBe('Brief');
  expect(noteOf('- [ ] one\n- [x] two\n\nCheck [iOS](https://x) spacing')).toBe('Check iOS spacing');
  expect(noteOf('   ')).toBeUndefined();
});

test('checklist lines become subtasks', () => {
  expect(checklistItems('- [x] a\n- [ ] b\n* [X] c')).toEqual([
    { title: 'a', done: true },
    { title: 'b', done: false },
    { title: 'c', done: true },
  ]);
  expect(checklistItems('plain')).toBeUndefined();
});

test('search matches title, key, labels and subtasks', () => {
  const columns = [
    {
      id: 'c',
      title: 'C',
      cards: [
        { id: '1', key: 'NOVA-1', title: 'Wireframe', labels: [{ title: 'ui' }] },
        { id: '2', title: 'API', labels: [], subtasks: [{ title: 'auth endpoint', done: false }] },
      ],
    },
  ];
  expect(searchColumns(columns, 'nova-1')[0].cards.map((c) => c.id)).toEqual(['1']);
  expect(searchColumns(columns, 'auth')[0].cards.map((c) => c.id)).toEqual(['2']);
  expect(searchColumns(columns, 'ui wire')[0].cards.map((c) => c.id)).toEqual(['1']);
  expect(searchColumns(columns, '  ')[0].cards).toHaveLength(2);
});

describe('withIssueSprint', () => {
  const issue = (key: string, sprint: { id: number; name: string; state: 'active' | 'future' } | null) => ({
    id: key,
    key,
    summary: key,
    statusId: '1',
    statusName: 'To Do',
    statusCategory: 'new',
    labels: [],
    sprint,
  });
  const s15 = { id: 15, name: 'Sprint 15', state: 'active' as const };
  const s16 = { id: 16, name: 'Sprint 16', state: 'future' as const };
  const detail = (view: JiraBoardDetail['view']): JiraBoardDetail => ({
    board: { id: 7, accountId: 'a', name: 'B', type: 'scrum' },
    view,
    sprints: [s15, s16],
    columns: [{ name: 'To Do', statusIds: ['1'], issues: [issue('A-1', s15), issue('A-2', s15)] }],
  });

  test('the whole board keeps the issue and regroups it', () => {
    const next = withIssueSprint(detail({ kind: 'board' }), 'A-1', s16);
    expect(next.columns[0].issues.map((entry) => entry.sprint?.id)).toEqual([16, 15]);
  });

  test('a sprint view drops an issue moved out of it', () => {
    const next = withIssueSprint(detail({ kind: 'sprint', sprintId: 15 }), 'A-1', null);
    expect(next.columns[0].issues.map((entry) => entry.key)).toEqual(['A-2']);
  });

  test('the backlog view keeps an issue moved to the backlog', () => {
    const next = withIssueSprint(detail({ kind: 'backlog' }), 'A-1', null);
    expect(next.columns[0].issues[0].sprint).toBeNull();
  });
});
