import { afterEach, describe, expect, test } from 'bun:test';

import {
  buildGitHubIssueQuery,
  fetchGitHubIssues,
  validatePublicGitHubRepo,
} from '@/api/github.native';
import { credentialsNeedRefresh } from '@/lib/github-auth';
import { parseGitHubNextLink } from './pagination';
import { normalizeGitHubRepository } from './repository-ref';
import type { GitHubCredentialsV2 } from './types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('GitHub repository references', () => {
  test('normalizes owner/repo and canonical GitHub URLs', () => {
    expect(normalizeGitHubRepository(' openai/openai-node ')).toBe('openai/openai-node');
    expect(normalizeGitHubRepository('https://github.com/openai/openai-node.git')).toBe(
      'openai/openai-node'
    );
  });

  test('rejects hosts, query strings, and extra path segments', () => {
    expect(() => normalizeGitHubRepository('https://example.com/openai/openai-node')).toThrow();
    expect(() =>
      normalizeGitHubRepository('https://github.com/openai/openai-node?tab=readme')
    ).toThrow();
    expect(() => normalizeGitHubRepository('openai/openai-node/issues')).toThrow();
  });
});

describe('GitHub pagination', () => {
  test('extracts only the next link', () => {
    const header =
      '<https://api.github.com/repositories?page=1>; rel="prev", <https://api.github.com/repositories?page=3>; rel="next", <https://api.github.com/repositories?page=9>; rel="last"';
    expect(parseGitHubNextLink(header)).toBe('https://api.github.com/repositories?page=3');
    expect(parseGitHubNextLink(null)).toBeNull();
  });
});

describe('GitHub credential expiry', () => {
  const base: GitHubCredentialsV2 = {
    schemaVersion: 2,
    authKind: 'github-app',
    accessToken: 'token',
    account: { id: 1, login: 'octocat', avatarUrl: 'https://example.com/avatar.png' },
    validatedAt: new Date().toISOString(),
  };

  test('refreshes expiring credentials but not non-expiring PATs', () => {
    expect(credentialsNeedRefresh(base)).toBe(false);
    expect(
      credentialsNeedRefresh({
        ...base,
        accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
      })
    ).toBe(true);
    expect(
      credentialsNeedRefresh({
        ...base,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
    ).toBe(false);
  });
});

describe('GitHub REST integration', () => {
  test('uses the authenticated login for repository issue scopes', () => {
    const cases = [
      ['assigned', 'assignee'],
      ['created', 'creator'],
      ['mentioned', 'mentioned'],
    ] as const;

    for (const [scope, parameter] of cases) {
      const query = buildGitHubIssueQuery({
        scope,
        state: 'open',
        authenticated: true,
        viewerLogin: 'tashifkhan',
      });
      expect(query.get(parameter)).toBe('tashifkhan');
      expect(query.toString()).not.toContain('%40me');
    }
  });

  test('requires account identity for authenticated issue scopes', () => {
    expect(() =>
      buildGitHubIssueQuery({
        scope: 'assigned',
        state: 'open',
        authenticated: true,
      })
    ).toThrow('missing its login');
  });

  test('validates and maps a public repository before selection', async () => {
    globalThis.fetch = async () =>
      jsonResponse({
        id: 42,
        full_name: 'openai/openai-node',
        description: 'Official JavaScript library',
        html_url: 'https://github.com/openai/openai-node',
        private: false,
        visibility: 'public',
        archived: false,
        has_issues: true,
        owner: { login: 'openai', avatar_url: 'https://example.com/openai.png' },
      });

    const repository = await validatePublicGitHubRepo('openai/openai-node');
    expect(repository.id).toBe(42);
    expect(repository.full_name).toBe('openai/openai-node');
    expect(repository.canWriteIssues).toBe(false);
  });

  test('follows issue pagination and filters pull requests', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes('page=2')) {
        return jsonResponse([issue(2, 102, 'Second page')]);
      }
      return jsonResponse(
        [
          issue(1, 101, 'First page'),
          { ...issue(3, 103, 'Pull request'), pull_request: { url: 'https://example.com' } },
        ],
        {
          link: '<https://api.github.com/repos/openai/openai-node/issues?page=2>; rel="next"',
        }
      );
    };

    const result = await fetchGitHubIssues({
      repositories: [{ id: 42, fullName: 'openai/openai-node' }],
      scope: 'all',
      state: 'all',
      authenticated: false,
    });
    expect(result.issues.map((entry) => entry.number)).toEqual([102, 101]);
    expect(result.issues.every((entry) => entry.readOnly)).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  test('reports rate limiting as a source warning instead of an empty success', async () => {
    globalThis.fetch = async () =>
      jsonResponse(
        { message: 'API rate limit exceeded' },
        {
          status: 403,
          'x-ratelimit-limit': '60',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '2000000000',
        }
      );

    const result = await fetchGitHubIssues({
      repositories: [{ id: 42, fullName: 'openai/openai-node' }],
      scope: 'all',
      state: 'open',
      authenticated: false,
    });
    expect(result.issues).toEqual([]);
    expect(result.warnings[0].code).toBe('rate_limited');
    expect(result.warnings[0].rateLimit?.remaining).toBe(0);
  });
});

function issue(id: number, number: number, title: string) {
  return {
    id,
    number,
    title,
    body: '',
    state: 'open',
    labels: [],
    assignees: [],
    created_at: `2026-07-${String(number - 100).padStart(2, '0')}T00:00:00.000Z`,
    updated_at: `2026-07-${String(number - 100).padStart(2, '0')}T00:00:00.000Z`,
    html_url: `https://github.com/openai/openai-node/issues/${number}`,
  };
}

function jsonResponse(
  body: unknown,
  init: Record<string, string | number> & { status?: number } = {}
) {
  const { status = 200, ...headers } = init;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...stringValues(headers) },
  });
}

function stringValues(values: Record<string, string | number>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, String(value)])
  );
}
