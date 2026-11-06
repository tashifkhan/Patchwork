import { base64Encode } from '@/lib/base64';
import { jiraAccountKey } from '@/lib/account-keys';
import { adfToMarkdown, markdownToAdf } from '@/lib/adf';
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
const ISSUE_FIELDS = 'summary,status,priority,assignee,issuetype,labels,duedate,sprint,closedSprints';
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
  /** Which connected Jira login the board was listed under. */
  accountId: string;
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
  /**
   * The sprint the issue is in; null when it sits in the backlog. Done work
   * from a finished sprint keeps that sprint (state `closed`).
   */
  sprint?: { id: number; name: string; state: JiraSprint['state'] } | null;
}

/** Scrum boards and team-managed ("simple") boards can have sprints; kanban boards cannot. */
export function boardHasSprints(board: Pick<JiraBoard, 'type'>): boolean {
  return board.type !== 'kanban';
}

export interface JiraColumn {
  /** Column name doubles as its id; Jira columns have no id of their own. */
  name: string;
  statusIds: string[];
  issues: JiraIssue[];
}

/** Which issues on a board load: assigned to you, reported by you, either, or every issue. */
export type JiraIssueScope = 'assigned' | 'reported' | 'either' | 'all';

const SCOPE_JQL: Record<JiraIssueScope, string> = {
  assigned: 'assignee = currentUser()',
  reported: 'reporter = currentUser()',
  either: '(assignee = currentUser() OR reporter = currentUser())',
  all: '',
};

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'future' | 'closed';
  startDate?: string;
  endDate?: string;
  goal?: string;
}

/**
 * Which slice of a board to show. Scrum boards default to the active sprint,
 * like Jira's Board view; `backlog` is everything in no open sprint. `board`
 * is every issue (kanban boards, or scrum boards without sprints).
 */
export type JiraBoardView = { kind: 'sprint'; sprintId: number } | { kind: 'backlog' } | { kind: 'board' };

/** A stable string for a view, for query keys and saved choices. */
export function jiraViewKey(view: JiraBoardView | undefined): string {
  if (!view) return 'default';
  return view.kind === 'sprint' ? `sprint:${view.sprintId}` : view.kind;
}

export function parseJiraViewKey(key: string | undefined): JiraBoardView | undefined {
  if (key === 'backlog' || key === 'board') return { kind: key };
  const match = key ? /^sprint:(\d+)$/.exec(key) : null;
  return match ? { kind: 'sprint', sprintId: Number(match[1]) } : undefined;
}

export interface JiraBoardDetail {
  board: JiraBoard;
  columns: JiraColumn[];
  /** The sprint shown, when the view is a sprint. */
  sprint?: JiraSprint;
  /** The view actually shown (the default resolved). */
  view: JiraBoardView;
  /** Open sprints, active first (scrum boards only). */
  sprints: JiraSprint[];
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
  return {
    schemaVersion: 1,
    id: jiraAccountKey({ site, account }),
    site,
    email,
    apiToken,
    account,
    validatedAt: new Date().toISOString(),
  };
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

function toBoard(creds: JiraCredentials, raw: ApiBoard): JiraBoard {
  const site = creds.site;
  const avatarUri = raw.location?.avatarURI;
  return {
    id: raw.id,
    accountId: creds.id,
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
    boards.push(...values.map((value) => toBoard(creds, value)));
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
    sprint?: ApiSprintRef | null;
    closedSprints?: (ApiSprintRef & { endDate?: string; completeDate?: string })[] | null;
  };
}

interface ApiSprintRef {
  id: number;
  name: string;
  state?: string;
}

function sprintState(state: string | undefined): JiraSprint['state'] {
  return state === 'active' || state === 'closed' ? state : 'future';
}

/** The open sprint, else the last finished one for done work, else the backlog (null). */
function issueSprint(f: NonNullable<ApiIssue['fields']>): JiraIssue['sprint'] {
  if (f.sprint) return { id: f.sprint.id, name: f.sprint.name, state: sprintState(f.sprint.state) };
  if (f.status?.statusCategory?.key === 'done' && f.closedSprints?.length) {
    const last = [...f.closedSprints].sort((a, b) =>
      (b.completeDate ?? b.endDate ?? '').localeCompare(a.completeDate ?? a.endDate ?? '')
    )[0];
    return { id: last.id, name: last.name, state: 'closed' };
  }
  // Jira may leave the field out rather than send null; either way it is the
  // backlog. Boards without sprints ignore this (see `boardHasSprints`).
  return null;
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
    sprint: issueSprint(f),
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

/** The JQL a board loads with. Kanban boards drop work finished over two weeks ago. */
export function jiraBoardJql(scope: JiraIssueScope, sprint: boolean): string {
  const mine = SCOPE_JQL[scope];
  if (sprint) return mine;
  const recent = '(statusCategory != Done OR updated >= -14d)';
  return mine ? `${mine} AND ${recent}` : recent;
}

/**
 * A board as columns of your issues (see `JiraIssueScope`). Scrum boards show
 * their active sprint, like the Jira app; kanban boards hide work that has
 * been done for two weeks.
 */
export async function fetchJiraBoardDetail(
  creds: JiraCredentials,
  board: JiraBoard,
  scope: JiraIssueScope = 'assigned',
  requested?: JiraBoardView
): Promise<JiraBoardDetail> {
  const client = new JiraClient(creds);
  const [config, sprints] = await Promise.all([
    client.request<{
      columnConfig?: { columns?: { name: string; statuses?: { id: string }[] }[] };
    }>('GET', `/rest/agile/1.0/board/${board.id}/configuration`),
    boardHasSprints(board) ? fetchJiraSprints(creds, board.id) : Promise.resolve([] as JiraSprint[]),
  ]);
  const columns = (config?.columnConfig?.columns ?? [])
    .map((column) => ({
      name: column.name,
      statusIds: (column.statuses ?? []).map((status) => String(status.id)),
    }))
    // Jira's hidden "Backlog" column on kanban boards has no statuses mapped.
    .filter((column) => column.statusIds.length > 0);

  const view = resolveJiraView(board, sprints, requested);
  const sprint = view.kind === 'sprint' ? sprints.find((candidate) => candidate.id === view.sprintId) : undefined;

  // Jira does the filtering, so other people's issues are never downloaded
  // unless you ask for all of them. A sprint or the backlog is already
  // bounded; the whole board also hides work done over two weeks ago.
  const jql = jiraBoardJql(scope, view.kind !== 'board');
  const base =
    view.kind === 'sprint'
      ? `/rest/agile/1.0/board/${board.id}/sprint/${view.sprintId}/issue`
      : view.kind === 'backlog'
        ? `/rest/agile/1.0/board/${board.id}/backlog`
        : `/rest/agile/1.0/board/${board.id}/issue`;
  const issues = await pagedIssues(client, jql ? `${base}?jql=${encodeURIComponent(jql)}` : base);

  return {
    board,
    sprint,
    view,
    sprints,
    columns: columns.map((column) => ({
      ...column,
      issues: issues.filter((issue) => column.statusIds.includes(issue.statusId)),
    })),
  };
}

/**
 * The view to load. Every board opens on all its issues (`board`), which the
 * board screen groups by sprint. A saved sprint that has since closed falls
 * back to that too.
 */
export function resolveJiraView(
  board: Pick<JiraBoard, 'type'>,
  sprints: JiraSprint[],
  requested?: JiraBoardView
): JiraBoardView {
  if (!boardHasSprints(board)) return { kind: 'board' };
  if (requested?.kind === 'backlog') return requested;
  if (requested?.kind === 'sprint' && sprints.some((sprint) => sprint.id === requested.sprintId)) return requested;
  return { kind: 'board' };
}

/** Open sprints on a scrum board: active first, then upcoming, each in Jira's order. */
export async function fetchJiraSprints(creds: JiraCredentials, boardId: number): Promise<JiraSprint[]> {
  const client = new JiraClient(creds);
  const sprints: JiraSprint[] = [];
  let startAt = 0;
  try {
    for (let page = 0; page < 4; page += 1) {
      const data = await client.request<{
        values?: { id: number; name: string; state: string; startDate?: string; endDate?: string; goal?: string }[];
        isLast?: boolean;
      }>('GET', `/rest/agile/1.0/board/${boardId}/sprint?state=active,future&startAt=${startAt}&maxResults=50`);
      const values = data?.values ?? [];
      sprints.push(
        ...values.map((value) => ({
          id: value.id,
          name: value.name,
          state: (value.state === 'active' || value.state === 'closed' ? value.state : 'future') as JiraSprint['state'],
          startDate: value.startDate,
          endDate: value.endDate,
          goal: value.goal || undefined,
        }))
      );
      if (data?.isLast !== false || values.length === 0) break;
      startAt += values.length;
    }
  } catch (error) {
    // Boards with sprints turned off answer 400.
    if (error instanceof JiraError && error.status === 400) return [];
    throw error;
  }
  return [...sprints.filter((s) => s.state === 'active'), ...sprints.filter((s) => s.state !== 'active')];
}

/** Move issues into a sprint, or back to the backlog (null). */
export async function moveJiraIssuesToSprint(
  creds: JiraCredentials,
  keys: string[],
  sprintId: number | null
): Promise<void> {
  const client = new JiraClient(creds);
  if (sprintId == null) {
    await client.request('POST', '/rest/agile/1.0/backlog/issue', { issues: keys });
  } else {
    await client.request('POST', `/rest/agile/1.0/sprint/${sprintId}/issue`, { issues: keys });
  }
}

/** The open sprint an issue is in, or null when it sits in the backlog. */
export async function fetchJiraIssueSprint(creds: JiraCredentials, key: string): Promise<JiraSprint | null> {
  const data = await new JiraClient(creds).request<{
    fields?: { sprint?: { id: number; name: string; state: string } | null };
  }>('GET', `/rest/agile/1.0/issue/${encodeURIComponent(key)}?fields=sprint`);
  const sprint = data?.fields?.sprint;
  return sprint && sprint.state !== 'closed'
    ? { id: sprint.id, name: sprint.name, state: sprint.state === 'active' ? 'active' : 'future' }
    : null;
}

/** "5 days left", "Ends today", "Starts Mon 10 Nov" for a sprint chip or subtitle. */
export function sprintTiming(sprint: JiraSprint, now = Date.now()): string | undefined {
  const day = 86_400_000;
  if (sprint.state === 'active' && sprint.endDate) {
    const left = Math.ceil((Date.parse(sprint.endDate) - now) / day);
    if (Number.isNaN(left)) return undefined;
    if (left < 0) return 'Overdue';
    if (left === 0) return 'Ends today';
    return `${left} day${left === 1 ? '' : 's'} left`;
  }
  if (sprint.state === 'future' && sprint.startDate) {
    const start = new Date(sprint.startDate);
    if (Number.isNaN(start.getTime())) return undefined;
    return `Starts ${start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  }
  return sprint.state === 'future' ? 'Not started' : undefined;
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

/**
 * Re-rank an issue on its board: just above `before`, or just below `after`.
 * Needs the board's ranking field, which every Jira Software board has.
 */
export async function rankJiraIssue(
  creds: JiraCredentials,
  issueKey: string,
  position: { before: string } | { after: string }
): Promise<void> {
  await new JiraClient(creds).request('PUT', '/rest/agile/1.0/issue/rank', {
    issues: [issueKey],
    ...('before' in position ? { rankBeforeIssue: position.before } : { rankAfterIssue: position.after }),
  });
}

export interface JiraIssueType {
  id: string;
  name: string;
  iconUrl?: string;
}

/** Issue types you can create in a project, without sub-tasks. */
export async function fetchJiraIssueTypes(creds: JiraCredentials, projectKey: string): Promise<JiraIssueType[]> {
  const meta = await new JiraClient(creds).request<{
    issueTypes?: { id: string; name: string; subtask?: boolean; iconUrl?: string }[];
    values?: { id: string; name: string; subtask?: boolean; iconUrl?: string }[];
  }>('GET', `/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`);
  return (meta?.issueTypes ?? meta?.values ?? [])
    .filter((type) => !type.subtask)
    .map(({ id, name, iconUrl }) => ({ id, name, iconUrl }));
}

/** Task when the project has it, else the first standard type that is not an Epic. */
export function defaultIssueType(types: JiraIssueType[]): JiraIssueType | undefined {
  return (
    types.find((candidate) => candidate.name.toLowerCase() === 'task') ??
    types.find((candidate) => candidate.name.toLowerCase() !== 'epic') ??
    types[0]
  );
}

export interface JiraIssueCreate {
  board: JiraBoard;
  summary: string;
  /** Markdown. */
  description?: string;
  issueTypeId?: string;
  priorityId?: string;
  labels?: string[];
  /** YYYY-MM-DD. */
  duedate?: string | null;
  /** Assign to the connected user (default true), so it shows on "assigned to me" boards. */
  assignToMe?: boolean;
  column?: JiraColumn;
  firstColumn?: JiraColumn;
  sprintId?: number;
}

/** Create an issue in a board's project, sprint and column. */
export async function createJiraIssue(creds: JiraCredentials, input: JiraIssueCreate): Promise<{ id: string; key: string }> {
  const project = input.board.projectKey;
  if (!project) throw new JiraError('This board is not tied to one project, so Patchwork cannot add to it.');
  const summary = input.summary.trim();
  if (!summary) throw new JiraError('An issue needs a summary.');
  const client = new JiraClient(creds);
  let issueTypeId = input.issueTypeId;
  if (!issueTypeId) {
    const type = defaultIssueType(await fetchJiraIssueTypes(creds, project));
    if (!type) throw new JiraError('Jira lists no issue types you can create in this project.');
    issueTypeId = type.id;
  }

  const description = input.description?.trim() ? markdownToAdf(input.description) : null;
  const labels = [...new Set((input.labels ?? []).map((label) => label.trim().replace(/\s+/g, '-')).filter(Boolean))];
  const fields: Record<string, unknown> = {
    project: { key: project },
    summary,
    issuetype: { id: issueTypeId },
    ...(description ? { description } : {}),
    ...(labels.length ? { labels } : {}),
    ...(input.priorityId ? { priority: { id: input.priorityId } } : {}),
    ...(input.duedate ? { duedate: input.duedate } : {}),
  };
  const assign = input.assignToMe !== false;
  let created: { id: string; key: string };
  try {
    created = await client.request('POST', '/rest/api/3/issue', {
      fields: assign ? { ...fields, assignee: { accountId: creds.account.accountId } } : fields,
    });
  } catch (error) {
    // Some projects don't let you set the assignee (or priority) on create.
    if (!(error instanceof JiraError) || error.status !== 400 || !assign) throw error;
    created = await client.request('POST', '/rest/api/3/issue', { fields });
    await assignJiraIssue(creds, created.key, creds.account.accountId).catch(() => {});
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

// ── One issue ──────────────────────────────────────────────────────────

/** An issue with everything the in-app editor shows. */
export interface JiraIssueDetail {
  id: string;
  key: string;
  summary: string;
  /** Description as Markdown (converted from Jira's document format). */
  description: string;
  /** False when the description holds things Markdown can't (images, tables). */
  descriptionEditable: boolean;
  status: { id: string; name: string; category: string };
  type?: { name: string; iconUrl?: string };
  priority?: { id: string; name: string; iconUrl?: string };
  assignee?: { accountId: string; displayName: string; avatarUrl?: string };
  reporter?: { accountId: string; displayName: string; avatarUrl?: string };
  labels: string[];
  duedate: string | null;
  created?: string;
  updated?: string;
  /** Fields this user may change, from Jira's edit metadata. */
  editable: { summary: boolean; description: boolean; duedate: boolean; labels: boolean; priority: boolean };
}

interface ApiUser {
  accountId?: string;
  displayName?: string;
  avatarUrls?: unknown;
}

function toUser(raw: ApiUser | null | undefined) {
  return raw?.accountId
    ? { accountId: raw.accountId, displayName: raw.displayName ?? 'Someone', avatarUrl: avatar(raw.avatarUrls) }
    : undefined;
}

export async function fetchJiraIssue(creds: JiraCredentials, key: string): Promise<JiraIssueDetail> {
  const client = new JiraClient(creds);
  const raw = await client.request<{
    id: string;
    key: string;
    fields?: {
      summary?: string;
      description?: unknown;
      status?: { id?: string; name?: string; statusCategory?: { key?: string } };
      issuetype?: { name?: string; iconUrl?: string };
      priority?: { id?: string; name?: string; iconUrl?: string } | null;
      assignee?: ApiUser | null;
      reporter?: ApiUser | null;
      labels?: string[];
      duedate?: string | null;
      created?: string;
      updated?: string;
    };
    editmeta?: { fields?: Record<string, unknown> };
  }>(
    'GET',
    `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,status,issuetype,priority,assignee,reporter,labels,duedate,created,updated&expand=editmeta`
  );
  const f = raw.fields ?? {};
  const { markdown, lossless } = adfToMarkdown(f.description);
  const meta = raw.editmeta?.fields ?? {};
  return {
    id: raw.id,
    key: raw.key,
    summary: f.summary ?? raw.key,
    description: markdown,
    descriptionEditable: lossless && 'description' in meta,
    status: { id: f.status?.id ?? '', name: f.status?.name ?? '', category: f.status?.statusCategory?.key ?? 'new' },
    type: f.issuetype?.name ? { name: f.issuetype.name, iconUrl: f.issuetype.iconUrl } : undefined,
    priority: f.priority?.id
      ? { id: f.priority.id, name: f.priority.name ?? '', iconUrl: f.priority.iconUrl }
      : undefined,
    assignee: toUser(f.assignee),
    reporter: toUser(f.reporter),
    labels: f.labels ?? [],
    duedate: f.duedate ?? null,
    created: f.created,
    updated: f.updated,
    editable: {
      summary: 'summary' in meta,
      description: 'description' in meta,
      duedate: 'duedate' in meta,
      labels: 'labels' in meta,
      priority: 'priority' in meta,
    },
  };
}

export interface JiraIssuePatch {
  summary?: string;
  /** Markdown; empty clears the description. */
  description?: string;
  duedate?: string | null;
  labels?: string[];
  priorityId?: string;
}

/** Save edited fields. Only the fields present in `patch` are sent. */
export async function updateJiraIssue(creds: JiraCredentials, key: string, patch: JiraIssuePatch): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.summary !== undefined) {
    const summary = patch.summary.trim();
    if (!summary) throw new JiraError('An issue needs a summary.');
    fields.summary = summary;
  }
  if (patch.description !== undefined) fields.description = markdownToAdf(patch.description);
  if (patch.duedate !== undefined) fields.duedate = patch.duedate;
  if (patch.labels !== undefined) {
    // Jira labels cannot contain spaces.
    fields.labels = [...new Set(patch.labels.map((label) => label.trim().replace(/\s+/g, '-')).filter(Boolean))];
  }
  if (patch.priorityId !== undefined) fields.priority = { id: patch.priorityId };
  if (Object.keys(fields).length === 0) return;
  await new JiraClient(creds).request('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}`, { fields });
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string; category: string };
}

/** The statuses an issue can move to from where it is now. */
export async function fetchJiraTransitions(creds: JiraCredentials, key: string): Promise<JiraTransition[]> {
  const data = await new JiraClient(creds).request<{
    transitions?: { id: string; name: string; to?: { id?: string; name?: string; statusCategory?: { key?: string } } }[];
  }>('GET', `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
  return (data?.transitions ?? []).map((transition) => ({
    id: transition.id,
    name: transition.name,
    to: {
      id: transition.to?.id ?? '',
      name: transition.to?.name ?? transition.name,
      category: transition.to?.statusCategory?.key ?? 'new',
    },
  }));
}

export async function applyJiraTransition(creds: JiraCredentials, key: string, transitionId: string): Promise<void> {
  await new JiraClient(creds).request('POST', `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
    transition: { id: transitionId },
  });
}

export async function fetchJiraPriorities(
  creds: JiraCredentials
): Promise<{ id: string; name: string; iconUrl?: string }[]> {
  const data = await new JiraClient(creds).request<{ id: string; name: string; iconUrl?: string }[]>(
    'GET',
    '/rest/api/3/priority'
  );
  return Array.isArray(data) ? data.map(({ id, name, iconUrl }) => ({ id, name, iconUrl })) : [];
}

/** Assign an issue to the connected user, or unassign it (null). */
export async function assignJiraIssue(creds: JiraCredentials, key: string, accountId: string | null): Promise<void> {
  await new JiraClient(creds).request('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}/assignee`, {
    accountId,
  });
}
