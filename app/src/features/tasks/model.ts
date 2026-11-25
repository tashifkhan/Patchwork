export interface TaskList {
  id: string;
  href: string;
  name: string;
  is_deck: boolean;
  /** Calendar component names advertised by CalDAV, e.g. VTODO/VEVENT. */
  supported_components?: string[];
  /** Owning CalDAV account (native multi-account). Absent on the web/proxy path. */
  account_id?: string;
  /** Human-readable account label, for grouping lists by account in the UI. */
  account_name?: string;
}

export interface TaskListCreate {
  name: string;
  /** Native multi-account destination. Defaults only when exactly one account exists. */
  account_id?: string;
}

export interface TaskListUpdate {
  name: string;
}

export interface Task {
  id: string;
  uid: string;
  list_id: string;
  list_name: string;
  title: string;
  description: string;
  markdown: string;
  completed: boolean;
  priority: number | null;
  due_at: string | null;
  /**
   * When the to-do's time block starts (VTODO `DTSTART`). With it, `due_at` is
   * where the block ends. Null for a plain due date; a repeating to-do whose
   * DTSTART only anchors the series (equal to DUE) also reads as null.
   */
  start_at?: string | null;
  reminder_at: string | null;
  tags: string[];
  /** Manual ordering within a list (CalDAV X-APPLE-SORT-ORDER). Lower sorts first. */
  sort_order: number | null;
  /** Kept above the date sections (VTODO X-PATCHWORK-PINNED). */
  pinned?: boolean;
  /** iCalendar RRULE value without the `RRULE:` prefix, e.g. `FREQ=WEEKLY;BYDAY=MO`. */
  rrule?: string | null;
  parent_uid: string | null;
  children: Task[];
  etag: string | null;
  updated_at: string | null;
  /** Owning CalDAV account (native multi-account). */
  account_id?: string;
  /** Human-readable account label for multi-account surfaces and widgets. */
  account_name?: string;
  /** Saved offline and still waiting to reach its account (see `@/lib/outbox`). */
  pending_sync?: boolean;
  /** iCalendar ATTACH links. Only CalDAV tasks have them. */
  attachments?: TaskAttachment[];
}

/** One iCalendar `ATTACH` link, in the shape Nextcloud Calendar writes. */
export interface TaskAttachment {
  /** The property value: a share link such as `https://cloud/f/4821`. */
  url: string;
  /** File name for display. */
  name: string;
  /** `FMTTYPE`, e.g. `image/jpeg`. */
  mime: string | null;
  /** `FILENAME` when it is a path in the user's Nextcloud Files, e.g. `/Tasks/<uid>/a.jpg`. */
  path: string | null;
  /** `X-NC-FILE-ID`, used for server-side thumbnails. */
  file_id: string | null;
  has_preview: boolean;
}

/** Who a new attachment belongs to. Enough to queue it without a connection. */
export interface AttachmentTarget {
  uid: string;
  title: string;
  account_id?: string;
  account_name?: string;
}

/** A file picked on the device, ready to upload. */
export interface AttachmentUpload {
  uri: string;
  name: string;
  mime: string;
}

/** What the UI needs to load attachment images from one Nextcloud account. */
export interface AttachmentAccess {
  /** `https://cloud.example.com/` or a subpath install root, with a trailing slash. */
  serverRoot: string;
  /** WebDAV root of the user's Files, with a trailing slash. */
  filesRoot: string;
  origin: string;
  headers: Record<string, string>;
}

export interface TaskCreate {
  list_id: string;
  title: string;
  /**
   * Fixed iCalendar UID. Offline saves pick it up front so subtasks can point
   * at the parent before it reaches the server, and a retried upload that
   * already landed is recognised instead of duplicated.
   */
  uid?: string;
  completed?: boolean;
  markdown?: string;
  tags?: string[];
  due_at?: string | null;
  start_at?: string | null;
  reminder_at?: string | null;
  parent_uid?: string | null;
  priority?: number | null;
  sort_order?: number | null;
  pinned?: boolean;
  rrule?: string | null;
  /** Read-only links kept when moving a task out of a Nextcloud account. */
  attachments?: TaskAttachment[];
}

export interface TaskUpdate {
  /** Move a native CalDAV task to another list while applying the patch. */
  list_id?: string;
  title?: string;
  markdown?: string;
  completed?: boolean;
  tags?: string[];
  due_at?: string | null;
  start_at?: string | null;
  reminder_at?: string | null;
  parent_uid?: string | null;
  priority?: number | null;
  sort_order?: number | null;
  pinned?: boolean;
  rrule?: string | null;
  etag?: string | null;
}

export interface TaskRef {
  uid: string;
  account?: string;
  list?: string;
}

export function taskRef(task: Pick<Task, 'uid' | 'account_id' | 'list_id'>): TaskRef {
  return { uid: task.uid, account: task.account_id, list: task.list_id };
}

export function taskKey(ref: TaskRef) {
  return JSON.stringify([ref.account ?? null, ref.list ?? null, ref.uid]);
}

export function matchesTask(task: Pick<Task, 'uid' | 'account_id' | 'list_id'>, ref: TaskRef) {
  return task.uid === ref.uid
    && (ref.account === undefined || task.account_id === ref.account)
    && (ref.list === undefined || task.list_id === ref.list);
}

export function taskLink(ref: TaskRef) {
  const params = new URLSearchParams();
  if (ref.account) params.set('account', ref.account);
  if (ref.list) params.set('list', ref.list);
  const query = params.toString();
  return `/task/${encodeURIComponent(ref.uid)}${query ? `?${query}` : ''}`;
}

export function buildTaskTree(tasks: Task[]): Task[] {
  const pending = new Set(tasks.filter((task) => task.pending_sync).map((task) => taskKey(taskRef(task))));
  const byResource = new Map<string, Task>();
  const byUid = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.pending_sync && pending.has(taskKey(taskRef(task)))) continue;
    byResource.set(JSON.stringify([task.account_id, task.id]), { ...task, children: [] });
  }
  for (const task of byResource.values()) {
    const key = taskKey({ uid: task.uid, account: task.account_id });
    const group = byUid.get(key);
    if (group) group.push(task);
    else byUid.set(key, [task]);
  }

  const parents = new Map<Task, Task>();
  for (const task of byResource.values()) {
    if (!task.parent_uid) continue;
    const candidates = byUid.get(taskKey({ uid: task.parent_uid, account: task.account_id })) ?? [];
    const sameList = candidates.filter((parent) => parent.list_id === task.list_id);
    const parent = sameList.length === 1 ? sameList[0] : candidates.length === 1 ? candidates[0] : undefined;
    if (parent && parent !== task) parents.set(task, parent);
  }

  const roots: Task[] = [];
  for (const task of byResource.values()) {
    const parent = parents.get(task);
    const ancestors = new Set([task]);
    let ancestor = parent;
    while (ancestor && !ancestors.has(ancestor)) {
      ancestors.add(ancestor);
      ancestor = parents.get(ancestor);
    }
    if (parent && !ancestor) parent.children.push(task);
    else roots.push(task);
  }
  return roots;
}
