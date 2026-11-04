import type {
  GitHubIssue,
  GitHubIssueCreate,
  GitHubIssueUpdate,
  GitHubRepo,
} from './types';
import { GitHubError, asGitHubError } from '@/features/github/errors';
import { parseGitHubNextLink } from '@/features/github/pagination';
import type {
  GitHubIssuesResult,
  GitHubIssueScope,
  GitHubIssueState,
  GitHubRateLimit,
  GitHubRepositorySelection,
  GitHubReposResult,
  GitHubSourceWarning,
} from '@/features/github/types';
import { getGitHubCredentials } from '@/lib/credentials';
import { isLegacyCredential } from '@/lib/github-auth';

const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ISSUE_PAGES_PER_REPO = 5;
const MAX_AGGREGATED_ISSUES = 500;
const MAX_REPOSITORY_PAGES = 10;
const REPOSITORY_CONCURRENCY = 3;

interface GitHubResponse<T> {
  data: T;
  nextUrl: string | null;
  rateLimit?: GitHubRateLimit;
}

class GitHubClient {
  constructor(private token?: string) {}

  async request<T>(
    method: string,
    pathOrUrl: string,
    options: { body?: unknown; signal?: AbortSignal } = {}
  ): Promise<GitHubResponse<T>> {
    const url = safeGitHubUrl(pathOrUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      const rateLimit = parseRateLimit(response.headers);
      if (response.status === 204) {
        return { data: undefined as T, nextUrl: null, rateLimit };
      }

      const text = await response.text();
      const parsed = parseJson(text);
      if (!response.ok) {
        throw errorFromResponse(response.status, parsed, rateLimit);
      }
      if (parsed === undefined) {
        throw new GitHubError(
          'invalid_response',
          'GitHub returned an empty response.',
          response.status
        );
      }
      return {
        data: parsed as T,
        nextUrl: parseGitHubNextLink(response.headers.get('link')),
        rateLimit,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        if (options.signal?.aborted) {
          throw new GitHubError('cancelled', 'The GitHub request was cancelled.');
        }
        throw new GitHubError('timeout', 'GitHub took too long to respond.');
      }
      throw asGitHubError(error);
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
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
  repository?: { id?: number; full_name?: string };
  pull_request?: unknown;
}

interface GitHubApiRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  visibility?: 'public' | 'private' | 'internal';
  archived?: boolean;
  has_issues?: boolean;
  owner: { login: string; avatar_url: string };
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
    triage?: boolean;
    pull?: boolean;
  };
}

export async function fetchGitHubIssues(input: {
  repositories: GitHubRepositorySelection[];
  scope: GitHubIssueScope;
  state: GitHubIssueState;
  authenticated: boolean;
  viewerLogin?: string;
  signal?: AbortSignal;
}): Promise<GitHubIssuesResult> {
  if (input.repositories.length === 0) return { issues: [], warnings: [] };
  const client = await getClient(input.authenticated);
  const results = await mapWithConcurrency(
    input.repositories,
    REPOSITORY_CONCURRENCY,
    async (repository) =>
      fetchRepoIssues(
        client,
        repository,
        input.scope,
        input.state,
        input.authenticated,
        input.viewerLogin,
        input.signal
      )
  );

  const issues: GitHubIssue[] = [];
  const warnings: GitHubSourceWarning[] = [];
  let rateLimit: GitHubRateLimit | undefined;

  results.forEach((result, index) => {
    const repository = input.repositories[index].fullName;
    if (result.status === 'fulfilled') {
      issues.push(...result.value.issues);
      warnings.push(...result.value.warnings);
      rateLimit = lowerRateLimit(rateLimit, result.value.rateLimit);
    } else {
      const error = asGitHubError(result.reason);
      if (error.requiresReconnect) throw error;
      warnings.push(warningFromError(repository, error));
      rateLimit = lowerRateLimit(rateLimit, error.rateLimit);
    }
  });

  issues.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  if (issues.length > MAX_AGGREGATED_ISSUES) {
    warnings.push({
      repository: 'GitHub',
      code: 'validation',
      message: `Showing the ${MAX_AGGREGATED_ISSUES} most recently updated issues. Narrow the repositories or filters to see older results.`,
    });
    issues.length = MAX_AGGREGATED_ISSUES;
  }
  return { issues, warnings, rateLimit };
}

async function fetchRepoIssues(
  client: GitHubClient,
  repository: GitHubRepositorySelection,
  scope: GitHubIssueScope,
  state: GitHubIssueState,
  authenticated: boolean,
  viewerLogin?: string,
  signal?: AbortSignal
): Promise<{
  issues: GitHubIssue[];
  warnings: GitHubSourceWarning[];
  rateLimit?: GitHubRateLimit;
}> {
  const repoPath = repositoryPath(repository.fullName);
  let canWriteIssues = repository.canWriteIssues === true;
  if (authenticated && repository.canWriteIssues === undefined) {
    const metadata = await fetchRepository(client, repository.fullName, true, signal);
    canWriteIssues = metadata.canWriteIssues;
  }
  const query = buildGitHubIssueQuery({
    scope,
    state,
    authenticated,
    viewerLogin,
  });

  let nextUrl: string | null = `${GITHUB_API}/repos/${repoPath}/issues?${query}`;
  const issues: GitHubIssue[] = [];
  let rateLimit: GitHubRateLimit | undefined;
  let page = 0;

  while (nextUrl && page < MAX_ISSUE_PAGES_PER_REPO) {
    const response: GitHubResponse<GitHubApiIssue[]> = await client.request(
      'GET',
      nextUrl,
      { signal }
    );
    if (!Array.isArray(response.data)) {
      throw new GitHubError('invalid_response', 'GitHub returned an invalid issue list.');
    }
    issues.push(
      ...response.data
        .filter((item) => item && !item.pull_request)
        .map((item) =>
          mapIssue(
            item,
            repository,
            authenticated && canWriteIssues
          )
        )
    );
    nextUrl = response.nextUrl;
    rateLimit = lowerRateLimit(rateLimit, response.rateLimit);
    page += 1;
  }

  const warnings: GitHubSourceWarning[] = [];
  if (nextUrl) {
    warnings.push({
      repository: repository.fullName,
      code: 'validation',
      message: `Showing the latest ${MAX_ISSUE_PAGES_PER_REPO * 100} issues. Narrow the issue filters to see older results.`,
    });
  }
  return { issues, warnings, rateLimit };
}

export function buildGitHubIssueQuery(input: {
  scope: GitHubIssueScope;
  state: GitHubIssueState;
  authenticated: boolean;
  viewerLogin?: string;
}) {
  const query = new URLSearchParams({
    state: input.state,
    per_page: '100',
    sort: 'updated',
    direction: 'desc',
  });

  if (!input.authenticated || input.scope === 'all') return query;

  const viewerLogin = input.viewerLogin?.trim();
  if (!viewerLogin) {
    throw new GitHubError(
      'validation',
      'The connected GitHub account is missing its login. Reconnect GitHub and try again.'
    );
  }

  const key =
    input.scope === 'created'
      ? 'creator'
      : input.scope === 'mentioned'
        ? 'mentioned'
        : 'assignee';
  query.set(key, viewerLogin);
  return query;
}

export async function fetchGitHubRepos(input: {
  repositories: GitHubRepositorySelection[];
  authenticated: boolean;
  signal?: AbortSignal;
}): Promise<GitHubReposResult> {
  const client = await getClient(input.authenticated);
  if (!input.authenticated) {
    const results = await mapWithConcurrency(
      input.repositories,
      REPOSITORY_CONCURRENCY,
      (repo) => fetchRepository(client, repo.fullName, false, input.signal)
    );
    const repositories: GitHubRepo[] = [];
    const warnings: GitHubSourceWarning[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') repositories.push(result.value);
      else warnings.push(warningFromError(input.repositories[index].fullName, asGitHubError(result.reason)));
    });
    return { repositories, warnings };
  }

  let nextUrl: string | null =
    `${GITHUB_API}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member`;
  const repositories: GitHubRepo[] = [];
  const warnings: GitHubSourceWarning[] = [];
  let rateLimit: GitHubRateLimit | undefined;
  let page = 0;

  while (nextUrl && page < MAX_REPOSITORY_PAGES) {
    const response: GitHubResponse<GitHubApiRepo[]> = await client.request(
      'GET',
      nextUrl,
      { signal: input.signal }
    );
    if (!Array.isArray(response.data)) {
      throw new GitHubError('invalid_response', 'GitHub returned an invalid repository list.');
    }
    repositories.push(...response.data.map((repo) => mapRepo(repo, true)));
    nextUrl = response.nextUrl;
    rateLimit = lowerRateLimit(rateLimit, response.rateLimit);
    page += 1;
  }

  if (nextUrl) {
    warnings.push({
      repository: 'GitHub account',
      code: 'validation',
      message: `Only the first ${MAX_REPOSITORY_PAGES * 100} accessible repositories are shown.`,
    });
  }
  return { repositories, warnings, rateLimit };
}

export async function validatePublicGitHubRepo(
  fullName: string,
  signal?: AbortSignal
): Promise<GitHubRepo> {
  return fetchRepository(new GitHubClient(), fullName, false, signal);
}

async function fetchRepository(
  client: GitHubClient,
  fullName: string,
  authenticated: boolean,
  signal?: AbortSignal
): Promise<GitHubRepo> {
  const response = await client.request<GitHubApiRepo>(
    'GET',
    `/repos/${repositoryPath(fullName)}`,
    { signal }
  );
  return mapRepo(response.data, authenticated);
}

export async function fetchSingleGitHubIssue(
  repo: string,
  issueNumber: number,
  options: { authenticated: boolean; canWrite?: boolean; signal?: AbortSignal }
): Promise<GitHubIssue> {
  const client = await getClient(options.authenticated);
  let canWrite = options.authenticated && options.canWrite === true;
  if (options.authenticated && options.canWrite === undefined) {
    const repository = await fetchRepository(client, repo, true, options.signal);
    canWrite = repository.canWriteIssues;
  }
  const response = await client.request<GitHubApiIssue>(
    'GET',
    `/repos/${repositoryPath(repo)}/issues/${encodeURIComponent(String(issueNumber))}`,
    { signal: options.signal }
  );
  if (response.data.pull_request) {
    throw new GitHubError('not_found', 'This GitHub item is a pull request, not an issue.', 404);
  }
  return mapIssue(
    response.data,
    { id: response.data.repository?.id ?? null, fullName: repo },
    canWrite
  );
}

export async function updateGitHubIssue(
  repo: string,
  issueNumber: number,
  patch: GitHubIssueUpdate,
  signal?: AbortSignal
): Promise<GitHubIssue> {
  const client = await getClient(true);
  const response = await client.request<GitHubApiIssue>(
    'PATCH',
    `/repos/${repositoryPath(repo)}/issues/${encodeURIComponent(String(issueNumber))}`,
    { body: patch, signal }
  );
  return mapIssue(response.data, { id: response.data.repository?.id ?? null, fullName: repo }, true);
}

export async function createGitHubIssue(
  repository: GitHubRepositorySelection,
  input: GitHubIssueCreate,
  signal?: AbortSignal
): Promise<GitHubIssue> {
  const client = await getClient(true);
  const response = await client.request<GitHubApiIssue>(
    'POST',
    `/repos/${repositoryPath(repository.fullName)}/issues`,
    { body: buildGitHubIssueCreatePayload(input), signal }
  );
  return mapIssue(
    response.data,
    repository,
    repository.canWriteIssues === true
  );
}

export function buildGitHubIssueCreatePayload(input: GitHubIssueCreate) {
  const title = input.title.trim();
  if (!title) {
    throw new GitHubError('validation', 'Add a title before creating the GitHub issue.');
  }

  const body = input.body?.trim();
  const assignees = [
    ...new Set(
      (input.assignees ?? [])
        .map((assignee) => assignee.trim())
        .filter(Boolean)
    ),
  ];
  const labels = [
    ...new Set((input.labels ?? []).map((label) => label.trim()).filter(Boolean)),
  ];
  return {
    title,
    ...(body ? { body } : {}),
    ...(assignees.length > 0 ? { assignees } : {}),
    ...(labels.length > 0 ? { labels } : {}),
  };
}

export function closeGitHubIssue(repo: string, issueNumber: number): Promise<GitHubIssue> {
  return updateGitHubIssue(repo, issueNumber, { state: 'closed' });
}

export function reopenGitHubIssue(repo: string, issueNumber: number): Promise<GitHubIssue> {
  return updateGitHubIssue(repo, issueNumber, { state: 'open' });
}

async function getClient(authenticated: boolean): Promise<GitHubClient> {
  if (!authenticated) return new GitHubClient();
  const credentials = await getGitHubCredentials();
  if (!credentials) {
    throw new GitHubError('unauthenticated', 'Connect GitHub in Settings to access this repository.', 401);
  }
  // Tokens don't refresh. An old GitHub App sign-in has to be replaced.
  if (isLegacyCredential(credentials)) {
    throw new GitHubError(
      'token_expired',
      'Patchwork now connects with a personal access token. Paste one in Settings.',
      401
    );
  }
  return new GitHubClient(credentials.accessToken);
}

function mapIssue(
  raw: GitHubApiIssue,
  repository: Pick<GitHubRepositorySelection, 'id' | 'fullName'>,
  canWrite: boolean
): GitHubIssue {
  if (
    typeof raw.id !== 'number' ||
    typeof raw.number !== 'number' ||
    typeof raw.title !== 'string' ||
    (raw.state !== 'open' && raw.state !== 'closed')
  ) {
    throw new GitHubError('invalid_response', 'GitHub returned an invalid issue.');
  }
  const repo = raw.repository?.full_name ?? repository.fullName;
  return {
    id: raw.id,
    number: raw.number,
    repositoryId: raw.repository?.id ?? repository.id,
    repo,
    title: raw.title,
    body: typeof raw.body === 'string' ? raw.body : '',
    state: raw.state,
    labels: Array.isArray(raw.labels)
      ? raw.labels
          .filter((label) => label && typeof label.name === 'string')
          .map((label) => ({ id: label.id, name: label.name, color: label.color }))
      : [],
    assignees: Array.isArray(raw.assignees)
      ? raw.assignees
          .filter((assignee) => assignee && typeof assignee.login === 'string')
          .map((assignee) => ({ login: assignee.login, avatar_url: assignee.avatar_url }))
      : [],
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    html_url: raw.html_url,
    completed: raw.state === 'closed',
    source: 'github',
    canWrite,
    readOnly: !canWrite,
  };
}

function mapRepo(raw: GitHubApiRepo, authenticated: boolean): GitHubRepo {
  if (
    typeof raw.id !== 'number' ||
    typeof raw.full_name !== 'string' ||
    typeof raw.html_url !== 'string' ||
    !raw.owner ||
    typeof raw.owner.login !== 'string'
  ) {
    throw new GitHubError('invalid_response', 'GitHub returned an invalid repository.');
  }
  const canWriteIssues =
    authenticated &&
    !!(
      raw.permissions?.admin ||
      raw.permissions?.maintain ||
      raw.permissions?.push ||
      raw.permissions?.triage
    );
  const canCreateIssues =
    authenticated &&
    raw.has_issues !== false &&
    raw.archived !== true &&
    !!(
      raw.permissions?.pull ||
      raw.permissions?.triage ||
      raw.permissions?.push ||
      raw.permissions?.maintain ||
      raw.permissions?.admin
    );
  return {
    id: raw.id,
    full_name: raw.full_name,
    description: typeof raw.description === 'string' ? raw.description : null,
    html_url: raw.html_url,
    private: raw.private === true,
    visibility: raw.visibility ?? (raw.private ? 'private' : 'public'),
    archived: raw.archived === true,
    has_issues: raw.has_issues !== false,
    canCreateIssues,
    canWriteIssues,
    owner: { login: raw.owner.login, avatar_url: raw.owner.avatar_url },
  };
}

function safeGitHubUrl(pathOrUrl: string): string {
  const url = pathOrUrl.startsWith('http')
    ? new URL(pathOrUrl)
    : new URL(pathOrUrl, GITHUB_API);
  if (url.protocol !== 'https:' || url.hostname !== 'api.github.com') {
    throw new GitHubError('validation', 'Refused a non-GitHub API URL.');
  }
  return url.toString();
}

function repositoryPath(fullName: string): string {
  const parts = fullName.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new GitHubError('validation', 'Invalid GitHub repository name.');
  }
  return `${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new GitHubError('invalid_response', 'GitHub returned an invalid JSON response.');
  }
}

function errorFromResponse(
  status: number,
  detail: unknown,
  rateLimit?: GitHubRateLimit
): GitHubError {
  const message =
    detail && typeof detail === 'object' && 'message' in detail
      ? String((detail as { message: unknown }).message)
      : `GitHub returned ${status}.`;
  if (status === 401) {
    return new GitHubError('unauthenticated', 'The GitHub connection expired. Reconnect in Settings.', status, detail, rateLimit);
  }
  if (status === 403 || status === 429) {
    if (status === 429 || rateLimit?.remaining === 0 || /rate limit/i.test(message)) {
      const suffix = rateLimit?.resetAt
        ? ` Try again after ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`
        : '';
      return new GitHubError('rate_limited', `GitHub rate limit reached.${suffix}`, status, detail, rateLimit);
    }
    return new GitHubError('permission_denied', message, status, detail, rateLimit);
  }
  if (status === 404) return new GitHubError('not_found', message, status, detail, rateLimit);
  if (status === 410) return new GitHubError('gone', message, status, detail, rateLimit);
  if (status === 409 || status === 412) return new GitHubError('conflict', message, status, detail, rateLimit);
  if (status === 422) return new GitHubError('validation', message, status, detail, rateLimit);
  return new GitHubError('server', message, status, detail, rateLimit);
}

function parseRateLimit(headers: Headers): GitHubRateLimit | undefined {
  const limit = parseHeaderNumber(headers.get('x-ratelimit-limit'));
  const remaining = parseHeaderNumber(headers.get('x-ratelimit-remaining'));
  const reset = parseHeaderNumber(headers.get('x-ratelimit-reset'));
  const retryAfterSeconds = parseHeaderNumber(headers.get('retry-after'));
  if (limit === undefined && remaining === undefined && reset === undefined && retryAfterSeconds === undefined) {
    return undefined;
  }
  return {
    limit,
    remaining,
    resetAt: reset !== undefined ? new Date(reset * 1000).toISOString() : undefined,
    retryAfterSeconds,
  };
}

function parseHeaderNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function warningFromError(repository: string, error: GitHubError): GitHubSourceWarning {
  return {
    repository,
    code: error.code,
    message: error.message,
    rateLimit: error.rateLimit,
  };
}

function lowerRateLimit(
  current: GitHubRateLimit | undefined,
  next: GitHubRateLimit | undefined
): GitHubRateLimit | undefined {
  if (!current) return next;
  if (!next) return current;
  if (next.remaining === undefined) return current;
  if (current.remaining === undefined || next.remaining < current.remaining) return next;
  return current;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(values.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= values.length) return;
        try {
          results[index] = { status: 'fulfilled', value: await worker(values[index], index) };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    }
  );
  await Promise.all(runners);
  return results;
}
