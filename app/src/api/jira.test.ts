import { afterEach, describe, expect, test } from 'bun:test';

import type { JiraCredentials } from '@/lib/credentials-types';

import {
  createJiraIssue,
  fetchJiraBoardDetail,
  jiraViewKey,
  parseJiraViewKey,
  resolveJiraView,
  sprintTiming,
  type JiraBoard,
  type JiraSprint,
} from './jira';

const creds: JiraCredentials = {
  schemaVersion: 1,
  id: 'acme.atlassian.net_me',
  site: 'https://acme.atlassian.net',
  email: 'me@acme.dev',
  apiToken: 'token',
  account: { accountId: 'me', displayName: 'Me' },
  validatedAt: '2026-11-06T00:00:00Z',
};
const board: JiraBoard = { id: 7, accountId: creds.id, name: 'Board', type: 'scrum', projectKey: 'SCRUM' };

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockJira(handler: (method: string, path: string, body: unknown) => { status?: number; json?: unknown }) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = url.replace(creds.site, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const result = handler(method, path, body);
    return new Response(result.json === undefined ? null : JSON.stringify(result.json), {
      status: result.status ?? 200,
    });
  }) as typeof fetch;
  return calls;
}

describe('createJiraIssue', () => {
  test('sends every field, assigned to you, into the sprint and column', async () => {
    const calls = mockJira((method, path) => {
      if (path.startsWith('/rest/api/3/issue/createmeta')) return { json: { issueTypes: [{ id: '1', name: 'Task' }] } };
      if (method === 'POST' && path === '/rest/api/3/issue') return { status: 201, json: { id: '10', key: 'SCRUM-9' } };
      if (path.endsWith('/transitions') && method === 'GET') {
        return { json: { transitions: [{ id: '31', to: { id: '3' } }] } };
      }
      return { status: 204 };
    });
    const created = await createJiraIssue(creds, {
      board,
      summary: '  Ship it ',
      description: 'Do **this**',
      labels: ['front end', 'ui', 'ui'],
      priorityId: '2',
      duedate: '2026-11-10',
      column: { name: 'Doing', statusIds: ['3'], issues: [] },
      firstColumn: { name: 'To do', statusIds: ['1'], issues: [] },
      sprintId: 5,
    });
    expect(created.key).toBe('SCRUM-9');
    const post = calls.find((call) => call.method === 'POST' && call.path === '/rest/api/3/issue');
    expect(post?.body).toMatchObject({
      fields: {
        project: { key: 'SCRUM' },
        summary: 'Ship it',
        issuetype: { id: '1' },
        labels: ['front-end', 'ui'],
        priority: { id: '2' },
        duedate: '2026-11-10',
        assignee: { accountId: 'me' },
        description: { type: 'doc', version: 1 },
      },
    });
    expect(calls.some((call) => call.path === '/rest/agile/1.0/sprint/5/issue')).toBe(true);
    expect(calls.some((call) => call.method === 'POST' && call.path === '/rest/api/3/issue/SCRUM-9/transitions')).toBe(true);
  });

  test('retries without the assignee when the project refuses it, then assigns', async () => {
    let posts = 0;
    const calls = mockJira((method, path, body) => {
      if (method === 'POST' && path === '/rest/api/3/issue') {
        posts += 1;
        const fields = (body as { fields: Record<string, unknown> }).fields;
        return fields.assignee
          ? { status: 400, json: { errors: { assignee: 'cannot be set' } } }
          : { status: 201, json: { id: '11', key: 'SCRUM-10' } };
      }
      return { status: 204 };
    });
    await createJiraIssue(creds, { board, summary: 'x', issueTypeId: '1' });
    expect(posts).toBe(2);
    expect(calls.some((call) => call.method === 'PUT' && call.path === '/rest/api/3/issue/SCRUM-10/assignee')).toBe(true);
  });

  test('turning off "assign to me" sends no assignee', async () => {
    const calls = mockJira((method, path) =>
      method === 'POST' && path === '/rest/api/3/issue' ? { status: 201, json: { id: '1', key: 'SCRUM-1' } } : { status: 204 }
    );
    await createJiraIssue(creds, { board, summary: 'x', issueTypeId: '1', assignToMe: false });
    const post = calls.find((call) => call.method === 'POST');
    expect((post?.body as { fields: Record<string, unknown> }).fields.assignee).toBeUndefined();
  });
});

describe('sprint views', () => {
  const active: JiraSprint = { id: 1, name: 'Sprint 12', state: 'active', endDate: '2026-11-11T00:00:00Z' };
  const next: JiraSprint = { id: 2, name: 'Sprint 13', state: 'future', startDate: '2026-11-11T00:00:00Z' };

  test('boards open on every issue; a saved open sprint or the backlog is kept', () => {
    expect(resolveJiraView({ type: 'scrum' }, [active, next])).toEqual({ kind: 'board' });
    expect(resolveJiraView({ type: 'simple' }, [active])).toEqual({ kind: 'board' });
    expect(resolveJiraView({ type: 'scrum' }, [active, next], { kind: 'sprint', sprintId: 2 })).toEqual({
      kind: 'sprint',
      sprintId: 2,
    });
    expect(resolveJiraView({ type: 'scrum' }, [active], { kind: 'sprint', sprintId: 99 })).toEqual({ kind: 'board' });
    expect(resolveJiraView({ type: 'simple' }, [active], { kind: 'backlog' })).toEqual({ kind: 'backlog' });
  });

  test('kanban boards always show everything', () => {
    expect(resolveJiraView({ type: 'kanban' }, [], { kind: 'backlog' })).toEqual({ kind: 'board' });
    expect(resolveJiraView({ type: 'kanban' }, [], { kind: 'sprint', sprintId: 1 })).toEqual({ kind: 'board' });
  });

  test('view keys round-trip', () => {
    for (const view of [{ kind: 'sprint', sprintId: 7 }, { kind: 'backlog' }, { kind: 'board' }] as const) {
      expect(parseJiraViewKey(jiraViewKey(view))).toEqual(view);
    }
    expect(parseJiraViewKey(undefined)).toBeUndefined();
  });

  test('timing reads as days left or a start date', () => {
    expect(sprintTiming(active, Date.parse('2026-11-06T12:00:00Z'))).toBe('5 days left');
    expect(sprintTiming({ ...active, endDate: '2026-11-06T20:00:00Z' }, Date.parse('2026-11-06T12:00:00Z'))).toBe(
      '1 day left'
    );
    expect(sprintTiming({ id: 3, name: 'x', state: 'future' })).toBe('Not started');
  });

  test('the backlog view reads the board backlog with your scope', async () => {
    const calls = mockJira((_method, path) => {
      if (path.endsWith('/configuration')) {
        return { json: { columnConfig: { columns: [{ name: 'To do', statuses: [{ id: '1' }] }] } } };
      }
      if (path.includes('/sprint?')) return { json: { values: [{ id: 1, name: 'Sprint 12', state: 'active' }] } };
      if (path.includes('/backlog')) {
        return {
          json: { total: 1, issues: [{ id: '5', key: 'SCRUM-5', fields: { summary: 'Later', status: { id: '1' } } }] },
        };
      }
      return { status: 404 };
    });
    const detail = await fetchJiraBoardDetail(creds, board, 'assigned', { kind: 'backlog' });
    expect(detail.view).toEqual({ kind: 'backlog' });
    expect(detail.sprints.map((sprint) => sprint.name)).toEqual(['Sprint 12']);
    expect(detail.columns[0].issues.map((issue) => issue.key)).toEqual(['SCRUM-5']);
    const backlog = calls.find((call) => call.path.includes('/backlog'));
    expect(decodeURIComponent(backlog!.path)).toContain('jql=assignee = currentUser()');
  });
});
