import { describe, expect, test } from 'bun:test';

import { jiraBoardJql } from '@/api/jira';
import { githubAccountKey, jiraAccountKey } from '@/lib/account-keys';

import { boardRef, parseBoardRef, parseJiraBoardId } from './model';

describe('Jira issue scope', () => {
  test('"all" loads every issue; the others filter by you', () => {
    expect(jiraBoardJql('all', true)).toBe('');
    expect(jiraBoardJql('all', false)).toBe('(statusCategory != Done OR updated >= -14d)');
    expect(jiraBoardJql('assigned', true)).toBe('assignee = currentUser()');
    expect(jiraBoardJql('reported', false)).toBe(
      'reporter = currentUser() AND (statusCategory != Done OR updated >= -14d)'
    );
  });
});

describe('board refs with several Jira logins', () => {
  test('a ref names the board and its login', () => {
    const accountId = jiraAccountKey({
      site: 'https://acme.atlassian.net',
      account: { accountId: '712020:4f1e-aa', displayName: 'Sam' },
    });
    expect(accountId).toBe('acme.atlassian.net_712020_4f1e-aa');
    const parsed = parseBoardRef(boardRef('jira', `12@${accountId}`));
    expect(parsed?.source).toBe('jira');
    expect(parseJiraBoardId(parsed!.id)).toEqual({ boardId: 12, accountId });
  });

  test('refs saved before multiple logins still parse, with no login', () => {
    expect(parseJiraBoardId('12')).toEqual({ boardId: 12 });
    expect(parseJiraBoardId('nope')).toBeNull();
  });
});

describe('GitHub account keys', () => {
  test('use the user id, or the login for old records without one', () => {
    expect(githubAccountKey({ account: { id: 42, login: 'Sam', avatarUrl: '' } })).toBe('42');
    expect(githubAccountKey({ account: { id: 0, login: 'Sam', avatarUrl: '' } })).toBe('login-sam');
  });
});
