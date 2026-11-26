import { afterEach, describe, expect, test } from 'bun:test';

import type { JiraCredentials } from '@/lib/credentials-types';

import {
  createJiraIssue,
  fetchJiraBoardDetail,
  fetchJiraIssueSprint,
  jiraDescriptionMedia,
  jiraSearchJql,
  moveJiraIssuesToSprint,
  updateJiraIssue,
  jiraViewKey,
  parseJiraViewKey,
  resolveJiraView,
  searchJiraIssues,
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

describe('jira search', () => {
  test('builds a prefix text search and drops Lucene characters', () => {
    expect(jiraSearchJql('login cra')).toBe('text ~ "login cra*" ORDER BY updated DESC');
    expect(jiraSearchJql('fix "auth" (v2)')).toBe('text ~ "fix auth v2*" ORDER BY updated DESC');
    expect(jiraSearchJql('  ***  ')).toBeNull();
  });

  test('matches an issue key exactly as well as by text', () => {
    expect(jiraSearchJql('scrum-266')).toBe('(key = "SCRUM-266" OR text ~ "scrum 266*") ORDER BY updated DESC');
  });

  test('retries without the key clause when Jira rejects it', async () => {
    const calls = mockJira((_method, path) => {
      const jql = decodeURIComponent(path);
      if (jql.includes('key =')) return { status: 400, json: { errorMessages: ['The value NOPE-1 does not exist'] } };
      return {
        json: { issues: [{ id: '1', key: 'SCRUM-9', fields: { summary: 'Nope handling', status: { id: '1', name: 'To Do' } } }] },
      };
    });
    const issues = await searchJiraIssues(creds, 'nope-1');
    expect(issues.map((issue) => issue.key)).toEqual(['SCRUM-9']);
    expect(calls).toHaveLength(2);
    expect(calls[0].path).toContain('/rest/api/3/search/jql');
  });
});

describe('moving issues between sprints', () => {
  test('into a sprint posts to that sprint', async () => {
    const calls = mockJira(() => ({ status: 204 }));
    await moveJiraIssuesToSprint(creds, ['SCRUM-4'], 15);
    expect(calls).toEqual([{ method: 'POST', path: '/rest/agile/1.0/sprint/15/issue', body: { issues: ['SCRUM-4'] } }]);
  });

  test('null moves to the backlog', async () => {
    const calls = mockJira(() => ({ status: 204 }));
    await moveJiraIssuesToSprint(creds, ['SCRUM-4', 'SCRUM-5'], null);
    expect(calls).toEqual([
      { method: 'POST', path: '/rest/agile/1.0/backlog/issue', body: { issues: ['SCRUM-4', 'SCRUM-5'] } },
    ]);
  });

  test('Jira refusing the move surfaces its message', async () => {
    mockJira(() => ({ status: 400, json: { errorMessages: ['Sprint is closed'] } }));
    await expect(moveJiraIssuesToSprint(creds, ['SCRUM-4'], 3)).rejects.toThrow('Sprint is closed');
  });
});

describe('fetchJiraIssueSprint', () => {
  test('the open sprint, and the board it was made on', async () => {
    const calls = mockJira(() => ({
      json: { fields: { sprint: { id: 15, name: 'SCRUM Sprint 15', state: 'active', originBoardId: 7 } } },
    }));
    expect(await fetchJiraIssueSprint(creds, 'SCRUM-4')).toEqual({
      sprint: { id: 15, name: 'SCRUM Sprint 15', state: 'active' },
      boardId: 7,
    });
    expect(calls).toHaveLength(1);
  });

  test('backlog issues use the board of their last closed sprint', async () => {
    mockJira(() => ({
      json: {
        fields: {
          sprint: null,
          closedSprints: [
            { id: 1, name: 'Old', state: 'closed', originBoardId: 3, completeDate: '2026-01-01' },
            { id: 2, name: 'Newer', state: 'closed', originBoardId: 4, completeDate: '2026-06-01' },
          ],
        },
      },
    }));
    expect(await fetchJiraIssueSprint(creds, 'SCRUM-4')).toEqual({ sprint: null, boardId: 4 });
  });

  test('never in a sprint: the first scrum board of its project', async () => {
    const calls = mockJira((_method, path) =>
      path.startsWith('/rest/agile/1.0/board?')
        ? { json: { values: [{ id: 9, name: 'Kanban', type: 'kanban' }, { id: 11, name: 'Scrum', type: 'scrum' }] } }
        : { json: { fields: { project: { key: 'SCRUM' } } } }
    );
    expect(await fetchJiraIssueSprint(creds, 'SCRUM-4')).toEqual({ sprint: null, boardId: 11 });
    expect(calls[1].path).toBe('/rest/agile/1.0/board?projectKeyOrId=SCRUM&maxResults=50');
  });
});

describe('updateJiraIssue', () => {
  test('an ADF description is sent as it is', async () => {
    const calls = mockJira(() => ({ status: 204 }));
    const description = { type: 'doc' as const, version: 1 as const, content: [{ type: 'mediaSingle', content: [] }] };
    await updateJiraIssue(creds, 'SCRUM-4', { description });
    expect((calls[0].body as { fields: { description: unknown } }).fields.description).toEqual(description);
  });

  test('null clears the description', async () => {
    const calls = mockJira(() => ({ status: 204 }));
    await updateJiraIssue(creds, 'SCRUM-4', { description: null });
    expect(calls[0].body).toEqual({ fields: { description: null } });
  });
});

describe('jiraDescriptionMedia', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'uuid-a', type: 'file', alt: 'shot.png' } }] },
      { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'uuid-b', type: 'file' } }] },
      { type: 'mediaSingle', content: [{ type: 'media', attrs: { type: 'external', url: 'https://x.dev/a.png' } }] },
    ],
  };
  const attachments = [
    { id: '100', filename: 'shot.png', mimeType: 'image/png', content: `${creds.site}/rest/api/3/attachment/content/100` },
    { id: '101', filename: 'diagram.png', mimeType: 'image/png', content: `${creds.site}/rest/api/3/attachment/content/101` },
    { id: '102', filename: 'evil.png', mimeType: 'image/png', content: 'https://elsewhere.dev/102' },
  ];

  test('matches by media id in the rendered HTML, then filename', () => {
    const html = '<img src="/rest/api/3/attachment/content/101" data-media-services-id="uuid-b" />';
    const media = jiraDescriptionMedia(creds, doc, attachments, html);
    expect(media['uuid-a']?.attachmentId).toBe('100');
    expect(media['uuid-b']?.attachmentId).toBe('101');
    expect(media['uuid-b']?.isImage).toBe(true);
  });

  test('falls back to the order images appear in', () => {
    const html =
      '<img src="/rest/api/3/attachment/content/101" alt="x" /><img src="/rest/api/3/attachment/content/100" />';
    const nodes = [
      { type: 'media', attrs: { id: 'first', type: 'file' } },
      { type: 'media', attrs: { id: 'second', type: 'file' } },
    ];
    const media = jiraDescriptionMedia(creds, { type: 'doc', content: nodes }, attachments, html);
    expect(media.first?.attachmentId).toBe('101');
    expect(media.second?.attachmentId).toBe('100');
    // Counts that differ are not paired, rather than risk the wrong image.
    expect(jiraDescriptionMedia(creds, { type: 'doc', content: [nodes[0]] }, attachments, html)).toEqual({});
  });

  test('off-site attachment URLs fall back to the site content URL, never another host', () => {
    const media = jiraDescriptionMedia(
      creds,
      { type: 'doc', content: [{ type: 'media', attrs: { id: 'u', alt: 'evil.png' } }] },
      attachments,
      ''
    );
    expect(media.u?.url).toBe(`${creds.site}/rest/api/3/attachment/content/102`);
  });

  test('no media, nothing to match', () => {
    expect(jiraDescriptionMedia(creds, { type: 'doc', content: [] }, attachments, '')).toEqual({});
  });
});
