import { ApiError } from './client';
import type { GitHubIssue, GitHubIssueUpdate, GitHubRepo } from './types';
import { getGitHubCredentials } from '@/lib/credentials';
import { useSettingsStore } from '@/stores/settings-store';

const GITHUB_API = 'https://api.github.com';

class GitHubClient {
  private token?: string;

  constructor(token?: string) {
    this.token = token;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    if (!response.ok) {
      let detail: unknown;
      try {
        detail = JSON.parse(text);
      } catch {
        detail = text;
      }
      const message =
        detail && typeof detail === 'object' && 'message' in detail
          ? (detail as { message: string }).message
          : `GitHub API returned ${response.status}`;
      throw new ApiError(response.status, message, detail);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(502, 'GitHub returned non-JSON response', text);
    }
  }
}

async function getClient(): Promise<GitHubClient> {
  const creds = await getGitHubCredentials();
  if (!creds?.token) {
    throw new ApiError(401, 'GitHub is not connected. Add a token in Settings → GitHub.');
  }
  return new GitHubClient(creds.token);
}

async function getOptionalClient(): Promise<GitHubClient> {
  const creds = await getGitHubCredentials();
  return new GitHubClient(creds?.token);
}

function getConfiguredRepos(): string[] {
  return useSettingsStore.getState().githubRepos;
}

function getGitHubMode() {
  return useSettingsStore.getState().githubMode;
}

interface GitHubApiIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: { id: number; name: string; color: string }[];
  assignees: { login: string; avatar_url: string }[];
  created_at: string;
  updated_at: string;
  html_url: string;
  repository?: { full_name: string };
  pull_request?: unknown;
}

function mapIssue(raw: GitHubApiIssue, repoFallback?: string, readOnly = false): GitHubIssue {
  const repo = raw.repository?.full_name ?? repoFallback ?? '';
  return {
    id: raw.id,
    number: raw.number,
    repo,
    title: raw.title,
    body: raw.body ?? '',
    state: raw.state,
    labels: raw.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
    assignees: raw.assignees.map((a) => ({ login: a.login, avatar_url: a.avatar_url })),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    html_url: raw.html_url,
    completed: raw.state === 'closed',
    source: 'github',
    readOnly,
  };
}

export async function fetchGitHubIssues(): Promise<GitHubIssue[]> {
  const mode = getGitHubMode();
  const client = mode === 'private' ? await getClient() : await getOptionalClient();
  const repos = getConfiguredRepos();

  if (repos.length === 0) return [];

  const allIssues: GitHubIssue[] = [];

  for (const repo of repos) {
    try {
      const raw = await client.request<GitHubApiIssue[]>(
        'GET',
        `/repos/${repo}/issues?state=all${mode === 'private' ? '&assignee=@me' : ''}&per_page=100&sort=updated&direction=desc`
      );
      // GitHub's issues endpoint also returns PRs — filter them out
      const issues = raw
        .filter((item) => !item.pull_request)
        .map((item) => mapIssue(item, repo, mode === 'public'));
      allIssues.push(...issues);
    } catch (error) {
      // If one repo fails (e.g. no access), continue with others
      if (error instanceof ApiError && error.status === 404) continue;
      throw error;
    }
  }

  // Sort by updated_at descending
  allIssues.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return allIssues;
}

export async function fetchGitHubRepos(): Promise<GitHubRepo[]> {
  const mode = getGitHubMode();

  if (mode === 'public') {
    const client = await getOptionalClient();
    const repos = getConfiguredRepos();
    const publicRepos: GitHubRepo[] = [];

    for (const repo of repos) {
      try {
        const raw = await client.request<GitHubRepo>('GET', `/repos/${repo}`);
        publicRepos.push({
          full_name: raw.full_name,
          description: raw.description,
          html_url: raw.html_url,
          private: raw.private,
          owner: { login: raw.owner.login, avatar_url: raw.owner.avatar_url },
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) continue;
        throw error;
      }
    }

    return publicRepos;
  }

  const client = await getClient();
  const raw = await client.request<GitHubRepo[]>(
    'GET',
    '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member'
  );
  return raw.map((r) => ({
    full_name: r.full_name,
    description: r.description,
    html_url: r.html_url,
    private: r.private,
    owner: { login: r.owner.login, avatar_url: r.owner.avatar_url },
  }));
}

export async function updateGitHubIssue(
  repo: string,
  issueNumber: number,
  patch: GitHubIssueUpdate
): Promise<GitHubIssue> {
  const client = await getClient();
  const raw = await client.request<GitHubApiIssue>(
    'PATCH',
    `/repos/${repo}/issues/${issueNumber}`,
    patch
  );
  return mapIssue(raw, repo);
}

export async function closeGitHubIssue(repo: string, issueNumber: number): Promise<GitHubIssue> {
  return updateGitHubIssue(repo, issueNumber, { state: 'closed' });
}

export async function reopenGitHubIssue(repo: string, issueNumber: number): Promise<GitHubIssue> {
  return updateGitHubIssue(repo, issueNumber, { state: 'open' });
}
