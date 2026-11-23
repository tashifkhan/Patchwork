import { describe, expect, test } from 'bun:test';

import type { BoardColumnItem } from '@/features/boards/model';

import {
  BOARD_WIDGET_CARD_CAP,
  boardUrl,
  buildBoardsProps,
  emptyBoardsProps,
  isOverdue,
  jiraWidgetSprint,
  withoutNulls,
} from './boards';

const now = new Date(2026, 10, 13, 10, 0, 0);

const card = (id: string, due: string | null = null) => ({ id, title: `Card ${id}`, labels: [], due });

describe('boards widget snapshot', () => {
  test('treats date-only due dates as local days', () => {
    expect(isOverdue('2026-11-12', now)).toBe(true);
    expect(isOverdue('2026-11-13', now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
    expect(isOverdue('not a date', now)).toBe(false);
  });

  test('counts every card but caps the cards it ships', () => {
    const columns: BoardColumnItem[] = [
      { id: '1', title: 'To do', cards: Array.from({ length: 8 }, (_, i) => card(String(i))) },
      { id: '2', title: 'Doing', cards: [card('x', '2026-11-01')] },
    ];
    const props = buildBoardsProps({ ref: 'deck:7', summary: null, columns, now });
    expect(props.totalCards).toBe(9);
    expect(props.columns[0].count).toBe(8);
    expect(props.columns[0].cards).toHaveLength(BOARD_WIDGET_CARD_CAP);
    expect(props.columns[1].cards[0].overdue).toBe(true);
    expect(props.columns[1].cards[0].url).toBe('patchwork:///deck/card/x?boardId=7&stackId=2');
    expect(props.url).toBe(boardUrl('deck:7'));
    expect(props.source).toBe('deck');
  });

  test('does not flag cards in a done column as overdue', () => {
    const columns: BoardColumnItem[] = [{ id: 'Done', title: 'Done', cards: [card('a', '2026-01-01')] }];
    const props = buildBoardsProps({ ref: 'deck:1', summary: null, columns, now });
    expect(props.columns[0].cards[0].overdue).toBe(false);
  });

  test('links Jira issues with their login and board', () => {
    const columns: BoardColumnItem[] = [
      {
        id: 'To Do',
        title: 'To Do',
        cards: [
          {
            ...card('SCRUM-1'),
            key: 'SCRUM-1',
            typeName: 'Bug',
            priorityName: 'High',
            assignee: { name: 'Tashif Ahmad Khan' },
          },
        ],
      },
    ];
    const props = buildBoardsProps({ ref: 'jira:42@acct-1', summary: null, columns, now });
    expect(props.columns[0].cards[0].url).toBe('patchwork:///deck/issue/SCRUM-1?account=acct-1&board=42');
    expect(props.columns[0].cards[0].key).toBe('SCRUM-1');
    expect(props.columns[0].cards[0].type).toBe('Bug');
    expect(props.columns[0].cards[0].priority).toBe('High');
    expect(props.columns[0].cards[0].assignee).toBe('TK');
  });

  test('strips nulls so iOS can store the snapshot', () => {
    const stripped = withoutNulls(emptyBoardsProps(1));
    expect(JSON.stringify(stripped)).not.toContain('null');
    expect(stripped.boardRef).toBeUndefined();
  });

  test('names the active sprint when the board shows every issue', () => {
    const sprints = [
      { id: 2, name: 'Sprint 25', state: 'future' as const },
      { id: 1, name: 'Sprint 24', state: 'active' as const, endDate: '2026-11-16T12:00:00.000Z' },
    ];
    const at = Date.parse('2026-11-13T12:00:00.000Z');
    expect(jiraWidgetSprint({ kind: 'board' }, undefined, sprints, at)).toEqual({ name: 'Sprint 24', timing: '3 days left' });
    expect(jiraWidgetSprint({ kind: 'sprint', sprintId: 2 }, sprints[0], sprints, at).name).toBe('Sprint 25');
    expect(jiraWidgetSprint({ kind: 'backlog' }, undefined, sprints, at)).toEqual({ name: 'Backlog', timing: null });
    expect(jiraWidgetSprint({ kind: 'board' }, undefined, [], at)).toEqual({ name: null, timing: null });
  });

  test('labels only issues outside the named sprint', () => {
    const inSprint = { key: 'sprint:1', label: 'Sprint 24', state: 'active' as const, rank: 0 };
    const backlog = { key: 'backlog', label: 'Backlog', state: 'backlog' as const, rank: 99 };
    const columns: BoardColumnItem[] = [
      { id: 'To Do', title: 'To Do', cards: [{ ...card('A-1'), sprint: inSprint }, { ...card('A-2'), sprint: backlog }] },
    ];
    const props = buildBoardsProps({ ref: 'jira:1@a', summary: null, columns, sprintName: 'Sprint 24', now });
    expect(props.columns[0].cards[0].sprint).toBeNull();
    expect(props.columns[0].cards[1].sprint).toBe('Backlog');
  });
});
