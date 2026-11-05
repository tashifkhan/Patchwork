import { base64Encode } from '@/lib/base64';
import type { JiraAccount, JiraCredentials } from '@/lib/credentials-types';

/**
 * Jira Cloud REST client. Talks to the site directly with Basic auth
 * (email:API token). Jira blocks browser CORS, so this only runs on iOS and
 * Android; on web there are never saved credentials.
 *
 * Endpoints used:
 *   GET  /rest/api/3/myself
 *   GET  /rest/agile/1.0/board
 *   GET  /rest/agile/1.0/board/{id}/configuration
 *   GET  /rest/agile/1.0/board/{id}/sprint?state=active
 *   GET  /rest/agile/1.0/board/{id}/issue  (or …/sprint/{sid}/issue)
 *   GET  /rest/api/3/issue/{key}/transitions, POST to apply one
 *   GET  /rest/api/3/issue/createmeta/{project}/issuetypes, POST /rest/api/3/issue
 */

export const JIRA_NEW_TOKEN_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

const REQUEST_TIMEOUT_MS = 20_000;
const ISSUE_FIELDS = 'summary,status,priority,assignee,issuetype,labels,duedate';
const MAX_BOARD_PAGES = 6;
const MAX_ISSUE_PAGES = 4;

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** True when the token is rejected and the user must reconnect. */
    readonly requiresReconnect = false
  ) {
    super(message);
    this.name = 'JiraError';
  }
}

export interface JiraBoard {
  id: number;
  name: string;
  type: 'scrum' | 'kanban' | 'simple' | string;
  projectKey?: string;
  projectName?: string;
  projectAvatarUrl?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  statusId: string;
  statusName: string;
  /** new / indeterminate / done */
  statusCategory: string;
  typeName?: string;
  typeIconUrl?: string;
  priorityName?: string;
  priorityIconUrl?: string;
  assignee?: { accountId: string; displayName: string; avatarUrl?: string };
  labels: string[];
  duedate?: string | null;
}

export interface JiraColumn {
  /** Column name doubles as its id; Jira columns have no id of their own. */
  name: string;
  statusIds: string[];
  issues: JiraIssue[];
}

/** Which issues on a board are yours: assigned to you, reported by you, or either. */
export type JiraIssueScope = 'assigned' | 'reported' | 'either';

const SCOPE_JQL: Record<JiraIssueScope, string> = {
  assigned: 'assignee = currentUser()',
  reported: 'reporter = currentUser()',
  either: '(assignee = currentUser() OR reporter = currentUser())',
};

export interface JiraBoardDetail {
  board: JiraBoard;
  columns: JiraColumn[];
  /** Active sprint the board shows, if it is a scrum board. */
  sprint?: { id: number; name: string };
}

/** Normalize what people type ("acme", "acme.atlassian.net/jira/…") into a site root. */
export function normalizeJiraSite(input: string): string {
  let value = input.trim();
  if (!value) throw new JiraError('Enter your Jira site.');
  if (!/^https?:\/\//i.test(value)) {
    value = value.includes('.') ? `https://${value}` : `https://${value}.atlassian.net`;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new JiraError('That does not look like a Jira site address.');
  }
  if (url.protocol !== 'https:') throw new JiraError('Jira sites must use https.');
  return `https://${url.host}`;
}

class JiraClient {
  constructor(private creds: Pick<JiraCredentials, 'site' | 'email' | 'apiToken'>) {}

  get site() {
    return this.creds.site;
  }

  get authHeader() {
    return `Basic ${base64Encode(`${this.creds.email}:${this.creds.apiToken}`)}`;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.creds.site}${path}`, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          // Stops Jira from treating a mobile request as a browser XSRF risk.
          'X-Atlassian-Token': 'no-check',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : undefined;
      } catch {
        data = undefined;
      }
      if (!response.ok) throw errorFromResponse(response.status, data);
      return data as T;
    } catch (error) {
      if (error instanceof JiraError) throw error;
      if (controller.signal.aborted) throw new JiraError('Jira took too long to respond.');
      throw new JiraError(
        error instanceof Error && error.message
          ? `Could not reach Jira: ${error.message}`
          : 'Could not reach Jira.'
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function errorFromResponse(status: number, data: unknown): JiraError {
  const record = (data ?? {}) as { errorMessages?: string[]; errors?: Record<string, string>; message?: string };
  const detail =
    record.errorMessages?.find(Boolean) ??
    Object.values(record.errors ?? {}).find(Boolean) ??
    record.message;
  if (status === 401) {
    return new JiraError(
      'Jira did not accept that email and token. Check both, and that the token has not expired.',
      status,
      true
    );
  }
  if (status === 403) return new JiraError(detail ?? 'Your Jira account cannot do that.', status);
  if (status === 404) return new JiraError(detail ?? 'Jira could not find that.', status);
  return new JiraError(detail ?? `Jira returned ${status}.`, status);
}

function avatar(urls: unknown): string | undefined {
  if (!urls || typeof urls !== 'object') return undefined;
  const map = urls as Record<string, string>;
  return map['48x48'] ?? map['32x32'] ?? Object.values(map)[0];
}

// ── Account ────────────────────────────────────────────────────────────

/** Check site + email + token against Jira and build credentials from them. */
export async function validateJiraCredentials(input: {
  site: string;
  email: string;
  apiToken: string;
}): Promise<JiraCredentials> {
  const site = normalizeJiraSite(input.site);
  const email = input.email.trim();
  const apiToken = input.apiToken.trim();
  if (!email) throw new JiraError('Enter the email you sign in to Atlassian with.');
  if (!apiToken) throw new JiraError('Paste an API token first.');
  const client = new JiraClient({ site, email, apiToken });
  const me = await client.request<{
    accountId?: string;
    displayName?: string;
    emailAddress?: string;
    avatarUrls?: unknown;
  }>('GET', '/rest/api/3/myself');
  if (!me?.accountId) throw new JiraError('Jira returned an invalid account response.');
  const account: JiraAccount = {
    accountId: me.accountId,
    displayName: me.displayName ?? email,
    emailAddress: me.emailAddress,
    avatarUrl: avatar(me.avatarUrls),
  };
  return { schemaVersion: 1, site, email, apiToken, account, validatedAt: new Date().toISOString() };
}

/** Headers for loading Jira-hosted images (project avatars need auth). */
export function jiraImageHeaders(creds: JiraCredentials): Record<string, string> {
  return { Authorization: new JiraClient(creds).authHeader };
}

export function jiraIssueUrl(creds: Pick<JiraCredentials, 'site'>, key: string) {
  return `${creds.site}/browse/${encodeURIComponent(key)}`;
}

// ── Boards ─────────────────────────────────────────────────────────────

interface ApiBoard {
  id: number;
  name: string;
  type: string;
  location?: {
    projectKey?: string;
    projectName?: string;
    displayName?: string;
    avatarURI?: string;
  };
}

function toBoard(site: string, raw: ApiBoard): JiraBoard {
  const avatarUri = raw.location?.avatarURI;
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    projectKey: raw.location?.projectKey,
    projectName: raw.location?.projectName ?? raw.location?.displayName,
    projectAvatarUrl: avatarUri
      ? avatarUri.startsWith('http')
        ? avatarUri
        : `${site}${avatarUri}`
      : undefined,
  };
}

export async function fetchJiraBoards(creds: JiraCredentials): Promise<JiraBoard[]> {
  const client = new JiraClient(creds);
  const boards: JiraBoard[] = [];
  let startAt = 0;
  for (let page = 0; page < MAX_BOARD_PAGES; page += 1) {
    const data = await client.request<{ values?: ApiBoard[]; isLast?: boolean; maxResults?: number }>(
      'GET',
      `/rest/agile/1.0/board?startAt=${startAt}&maxResults=50`
    );
    const values = data?.values ?? [];
    boards.push(...values.map((value) => toBoard(creds.site, value)));
    if (data?.isLast !== false || values.length === 0) break;
    startAt += values.length;
  }
  return boards;
}

interface ApiIssue {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    status?: { id?: string; name?: string; statusCategory?: { key?: string } };
    priority?: { name?: string; iconUrl?: string } | null;
    assignee?: { accountId?: string; displayName?: string; avatarUrls?: unknown } | null;
    issuetype?: { name?: string; iconUrl?: string; subtask?: boolean };
    labels?: string[];
    duedate?: string | null;
  };
}

function toIssue(raw: ApiIssue): JiraIssue {
  const f = raw.fields ?? {};
  return {
    id: raw.id,
    key: raw.key,
    summary: f.summary ?? raw.key,
    statusId: f.status?.id ?? '',
    statusName: f.status?.name ?? '',
    statusCategory: f.status?.statusCategory?.key ?? 'new',
    typeName: f.issuetype?.name,
    typeIconUrl: f.issuetype?.iconUrl,
    priorityName: f.priority?.name,
    priorityIconUrl: f.priority?.iconUrl,
    assignee: f.assignee?.accountId
      ? {
          accountId: f.assignee.accountId,
          displayName: f.assignee.displayName ?? '',
          avatarUrl: avatar(f.assignee.avatarUrls),
        }
      : undefined,
    labels: f.labels ?? [],
    duedate: f.duedate ?? null,
  };
}

async function pagedIssues(client: JiraClient, basePath: string): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  let startAt = 0;
  const join = basePath.includes('?') ? '&' : '?';
  for (let page = 0; page < MAX_ISSUE_PAGES; page += 1) {
    const data = await client.request<{ issues?: ApiIssue[]; total?: number }>(
      'GET',
      `${basePath}${join}fields=${ISSUE_FIELDS}&startAt=${startAt}&maxResults=100`
    );
    const batch = (data?.issues ?? []).filter((issue) => !issue.fields?.issuetype?.subtask);
    issues.push(...batch.map(toIssue));
    const fetched = data?.issues?.length ?? 0;
    startAt += fetched;
    if (fetched === 0 || (data?.total != null && startAt >= data.total)) break;
  }
  return issues;
}

/**
 * A board as columns of your issues (see `JiraIssueScope`). Scrum boards show
 * their active sprint, like the Jira app; kanban boards hide work that has
 * been done for two weeks.
 */
export async function fetchJiraBoardDetail(
  creds: JiraCredentials,
  board: JiraBoard,
  scope: JiraIssueScope = 'assigned'
): Promise<JiraBoardDetail> {
  const client = new JiraClient(creds);
  const config = await client.request<{
    columnConfig?: { columns?: { name: string; statuses?: { id: string }[] }[] };
  }>('GET', `/rest/agile/1.0/board/${board.id}/configuration`);
  const columns = (config?.columnConfig?.columns ?? [])
    .map((column) => ({
      name: column.name,
      statusIds: (column.statuses ?? []).map((status) => String(status.id)),
    }))
    // Jira's hidden "Backlog" column on kanban boards has no statuses mapped.
    .filter((column) => column.statusIds.length > 0);

  let sprint: JiraBoardDetail['sprint'];
  if (board.type === 'scrum') {
    try {
      const sprints = await client.request<{ values?: { id: number; name: string }[] }>(
        'GET',
        `/rest/agile/1.0/board/${board.id}/sprint?state=active`
      );
      const active = sprints?.values?.[0];
      if (active) sprint = { id: active.id, name: active.name };
    } catch {
      // Boards without sprints enabled answer 400; fall back to all issues.
    }
  }

  // Jira does the filtering, so other people's issues are never downloaded.
  const mine = SCOPE_JQL[scope];
  const jql = sprint ? mine : `${mine} AND (statusCategory != Done OR updated >= -14d)`;
  const base = sprint
    ? `/rest/agile/1.0/board/${board.id}/sprint/${sprint.id}/issue`
    : `/rest/agile/1.0/board/${board.id}/issue`;
  const issues = await pagedIssues(client, `${base}?jql=${encodeURIComponent(jql)}`);

  return {
    board,
    sprint,
    columns: columns.map((column) => ({
      ...column,
      issues: issues.filter((issue) => column.statusIds.includes(issue.statusId)),
    })),
  };
}

// ── Changes ────────────────────────────────────────────────────────────

/** Move an issue to a column by applying the workflow transition that lands there. */
export async function transitionJiraIssue(
  creds: JiraCredentials,
  issueKey: string,
  target: Pick<JiraColumn, 'name' | 'statusIds'>
): Promise<void> {
  const client = new JiraClient(creds);
  const data = await client.request<{ transitions?: { id: string; to?: { id?: string } }[] }>(
    'GET',
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`
  );
  const transition = data?.transitions?.find(
    (candidate) => candidate.to?.id != null && target.statusIds.includes(String(candidate.to.id))
  );
  if (!transition) {
    throw new JiraError(`Your Jira workflow has no way to move ${issueKey} to ${target.name}.`);
  }
  await client.request('POST', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
    transition: { id: transition.id },
  });
}

/** Create a Task (or the project's first standard type) in a board's column. */
export async function createJiraIssue(
  creds: JiraCredentials,
  input: { board: JiraBoard; summary: string; column?: JiraColumn; firstColumn?: JiraColumn; sprintId?: number }
): Promise<{ id: string; key: string }> {
  const project = input.board.projectKey;
  if (!project) throw new JiraError('This board is not tied to one project, so Patchwork cannot add to it.');
  const client = new JiraClient(creds);
  const meta = await client.request<{
    issueTypes?: { id: string; name: string; subtask?: boolean }[];
    values?: { id: string; name: string; subtask?: boolean }[];
  }>('GET', `/rest/api/3/issue/createmeta/${encodeURIComponent(project)}/issuetypes`);
  const types = (meta?.issueTypes ?? meta?.values ?? []).filter((type) => !type.subtask);
  const type =
    types.find((candidate) => candidate.name.toLowerCase() === 'task') ??
    types.find((candidate) => candidate.name.toLowerCase() !== 'epic') ??
    types[0];
  if (!type) throw new JiraError('Jira lists no issue types you can create in this project.');

  const fields = { project: { key: project }, summary: input.summary.trim(), issuetype: { id: type.id } };
  let created: { id: string; key: string };
  try {
    // Assign to you so the issue shows up on boards filtered to your work.
    created = await client.request('POST', '/rest/api/3/issue', {
      fields: { ...fields, assignee: { accountId: creds.account.accountId } },
    });
  } catch (error) {
    // Some projects don't let you set the assignee on create; try without.
    if (!(error instanceof JiraError) || error.status !== 400) throw error;
    created = await client.request('POST', '/rest/api/3/issue', { fields });
  }
  if (input.sprintId != null) {
    await client.request('POST', `/rest/agile/1.0/sprint/${input.sprintId}/issue`, {
      issues: [created.key],
    });
  }
  // New issues start in the workflow's first status; move them if asked for another column.
  if (input.column && input.column.name !== input.firstColumn?.name) {
    await transitionJiraIssue(creds, created.key, input.column);
  }
  return created;
}
