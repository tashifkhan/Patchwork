import { Platform } from 'react-native';

import type { Task, TaskCreate, TaskList, TaskUpdate } from '@/api/types';
import { useSettingsStore } from '@/stores/settings-store';

import {
  APPLE_ACCOUNT_ID,
  APPLE_ACCOUNT_NAME,
  APPLE_LIST_PREFIX,
  APPLE_TASK_PREFIX,
} from './apple-reminders-ids';
import { calendarColor } from './device-events';
import { getCalendar } from './calendar';

/**
 * Apple Reminders as a task source, through EventKit on the phone.
 *
 * iCloud Reminders left CalDAV when Apple upgraded them in iOS 13, so a CalDAV
 * account never sees them. EventKit reads and writes the same reminders the
 * Reminders app shows, and iOS syncs them through iCloud. iOS only.
 *
 * Ids follow the on-device lists: list ids `apple:<calendar id>`, task ids
 * `apple://reminders/<reminder id>`.
 *
 * EventKit through expo-calendar carries title, notes, due date, start date,
 * alerts, repeats and completion. It has no subtasks, tags, flags or
 * priority, so those stay empty for these lists.
 */

export { APPLE_ACCOUNT_ID, APPLE_ACCOUNT_NAME, isAppleListId, isAppleTaskId } from './apple-reminders-ids';
const LIST_PREFIX = APPLE_LIST_PREFIX;
const TASK_PREFIX = APPLE_TASK_PREFIX;
/** Finished reminders older than this stay in Reminders and out of Patchwork. */
const DONE_WINDOW_DAYS = 30;

type CalendarModule = NonNullable<Awaited<ReturnType<typeof getCalendar>>>;
type Reminder = Awaited<ReturnType<CalendarModule['ExpoCalendarReminder']['get']>>;
type ReminderList = Awaited<ReturnType<CalendarModule['getCalendars']>>[number];

const calendarIdOf = (listId: string) => listId.slice(LIST_PREFIX.length);
const reminderIdOf = (taskId: string) => taskId.slice(TASK_PREFIX.length);

/** iOS, switched on in Settings. Says nothing about permission. */
export function appleRemindersEnabled(): boolean {
  return Platform.OS === 'ios' && useSettingsStore.getState().appleReminders;
}

export async function hasRemindersAccess(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const Calendar = await getCalendar();
  if (!Calendar) return false;
  try {
    return (await Calendar.getRemindersPermissions()).granted;
  } catch {
    return false;
  }
}

/** Asks iOS for Reminders access. */
export async function requestRemindersAccess(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const Calendar = await getCalendar();
  if (!Calendar) return false;
  try {
    const current = await Calendar.getRemindersPermissions();
    if (current.granted) return true;
    return (await Calendar.requestRemindersPermissions()).granted;
  } catch {
    return false;
  }
}

/** The module, when the source is on and allowed. */
async function ready(): Promise<CalendarModule | null> {
  if (!appleRemindersEnabled()) return null;
  const Calendar = await getCalendar();
  if (!Calendar || !(await hasRemindersAccess())) return null;
  return Calendar;
}

function toList(calendar: ReminderList): TaskList {
  return {
    id: `${LIST_PREFIX}${calendar.id}`,
    href: `apple://lists/${calendar.id}/`,
    name: calendar.title || 'Reminders',
    is_deck: false,
    supported_components: ['VTODO'],
    account_id: APPLE_ACCOUNT_ID,
    account_name: APPLE_ACCOUNT_NAME,
  };
}

async function reminderLists(Calendar: CalendarModule): Promise<ReminderList[]> {
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.REMINDER);
  return calendars.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
}

export async function getAppleLists(): Promise<TaskList[]> {
  const Calendar = await ready();
  if (!Calendar) return [];
  return (await reminderLists(Calendar)).map(toList);
}

export async function getAppleTasks(): Promise<Task[]> {
  const Calendar = await ready();
  if (!Calendar) return [];
  const lists = await reminderLists(Calendar);
  const since = new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000);
  const perList = await Promise.all(
    lists.map(async (list) => {
      const [open, done] = await Promise.all([
        list.listReminders(null, null, Calendar.ReminderStatus.INCOMPLETE),
        list.listReminders(since, null, Calendar.ReminderStatus.COMPLETED),
      ]);
      const target = toList(list);
      return [...open, ...done].map((reminder) => toTask(reminder, target));
    })
  );
  return perList.flat();
}

function iso(value: string | Date | undefined | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A date-only reminder becomes 23:59 that day, the way Patchwork stores a date with no time. */
function dueOf(reminder: Reminder): string | null {
  const due = iso(reminder.dueDate);
  if (!due || !reminder.allDay) return due;
  const day = new Date(due);
  day.setHours(23, 59, 0, 0);
  return day.toISOString();
}

function toTask(reminder: Reminder, list: TaskList): Task {
  const due = dueOf(reminder);
  const start = iso(reminder.startDate);
  const alarm = reminder.alarms?.[0];
  const reminderAt = alarm?.absoluteDate
    ? iso(alarm.absoluteDate)
    : alarm?.relativeOffset != null && due
      ? new Date(new Date(due).getTime() + alarm.relativeOffset * 60_000).toISOString()
      : null;
  const notes = reminder.notes ?? '';
  return {
    id: `${TASK_PREFIX}${reminder.id}`,
    uid: `apple-${reminder.id}`,
    list_id: list.id,
    list_name: list.name,
    title: reminder.title ?? '',
    description: notes,
    markdown: notes,
    completed: !!reminder.completed,
    priority: null,
    due_at: due,
    // A start date only reads as a time block when it sits before the due time.
    start_at: start && due && new Date(start) < new Date(due) ? start : null,
    reminder_at: reminderAt,
    tags: [],
    sort_order: null,
    rrule: toRrule(reminder.recurrenceRule ?? null),
    parent_uid: null,
    children: [],
    etag: iso(reminder.lastModifiedDate),
    updated_at: iso(reminder.lastModifiedDate),
    account_id: APPLE_ACCOUNT_ID,
    account_name: APPLE_ACCOUNT_NAME,
  };
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function toRrule(rule: Reminder['recurrenceRule'] | null): string | null {
  if (!rule?.frequency) return null;
  const parts = [`FREQ=${String(rule.frequency).toUpperCase()}`];
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  const days = rule.daysOfTheWeek?.map((d) => DAY_CODES[(d.dayOfTheWeek ?? 1) - 1]).filter(Boolean);
  if (days?.length) parts.push(`BYDAY=${days.join(',')}`);
  if (rule.occurrence) parts.push(`COUNT=${rule.occurrence}`);
  return parts.join(';');
}

function fromRrule(Calendar: CalendarModule, rrule: string | null | undefined): Reminder['recurrenceRule'] | null {
  if (!rrule) return null;
  const fields = Object.fromEntries(
    rrule.split(';').map((part) => part.split('=') as [string, string])
  );
  const frequency = {
    DAILY: Calendar.Frequency.DAILY,
    WEEKLY: Calendar.Frequency.WEEKLY,
    MONTHLY: Calendar.Frequency.MONTHLY,
    YEARLY: Calendar.Frequency.YEARLY,
  }[fields.FREQ];
  if (!frequency) return null;
  const days = fields.BYDAY?.split(',')
    .map((code) => DAY_CODES.indexOf(code.slice(-2)) + 1)
    .filter((day) => day > 0)
    .map((dayOfTheWeek) => ({ dayOfTheWeek }));
  return {
    frequency,
    interval: fields.INTERVAL ? Number(fields.INTERVAL) : 1,
    ...(fields.COUNT ? { occurrence: Number(fields.COUNT) } : {}),
    ...(days?.length ? { daysOfTheWeek: days } : {}),
  } as Reminder['recurrenceRule'];
}

/** The fields a Patchwork create or edit can set on a reminder. */
function details(Calendar: CalendarModule, fields: Partial<TaskCreate>) {
  const out: Record<string, unknown> = {};
  if (fields.title !== undefined) out.title = fields.title;
  if (fields.markdown !== undefined) out.notes = fields.markdown;
  if (fields.completed !== undefined) {
    out.completed = fields.completed;
    out.completionDate = fields.completed ? new Date() : null;
  }
  if (fields.due_at !== undefined) out.dueDate = fields.due_at ? new Date(fields.due_at) : null;
  if (fields.start_at !== undefined) out.startDate = fields.start_at ? new Date(fields.start_at) : null;
  if (fields.reminder_at !== undefined) {
    out.alarms = fields.reminder_at ? [{ absoluteDate: new Date(fields.reminder_at).toISOString() }] : [];
  }
  if (fields.rrule !== undefined) out.recurrenceRule = fromRrule(Calendar, fields.rrule);
  return out;
}

function unavailable(): Error {
  return new Error('Apple Reminders is off or Patchwork lost access. Turn it on in Settings, Calendars and reminders.');
}

export async function createAppleTask(payload: TaskCreate): Promise<Task> {
  const Calendar = await ready();
  if (!Calendar) throw unavailable();
  const list = await Calendar.ExpoCalendar.get(calendarIdOf(payload.list_id));
  const created = await list.createReminder(details(Calendar, payload) as never);
  // Read it back so the dates come out the way EventKit stored them.
  const fresh = created.id ? await Calendar.ExpoCalendarReminder.get(created.id) : created;
  return toTask(fresh, toList(list));
}

export async function getAppleTask(taskId: string): Promise<Task | null> {
  const Calendar = await ready();
  if (!Calendar) return null;
  try {
    const reminder = await Calendar.ExpoCalendarReminder.get(reminderIdOf(taskId));
    const list = await Calendar.ExpoCalendar.get(reminder.calendarId!);
    return toTask(reminder, toList(list));
  } catch {
    return null;
  }
}

/** Edits in place. A list change is a move, handled by the caller. */
export async function updateAppleTask(taskId: string, patch: TaskUpdate): Promise<Task> {
  const Calendar = await ready();
  if (!Calendar) throw unavailable();
  const reminder = await Calendar.ExpoCalendarReminder.get(reminderIdOf(taskId));
  const { list_id: _list, etag: _etag, ...fields } = patch;
  const changes = details(Calendar, fields as Partial<TaskCreate>);
  const cleared = Object.entries(changes)
    .filter(([, value]) => value === null)
    .map(([key]) => key);
  await reminder.update(changes as never, cleared as never);
  return (await getAppleTask(taskId))!;
}

export async function deleteAppleTask(taskId: string): Promise<void> {
  const Calendar = await ready();
  if (!Calendar) throw unavailable();
  const reminder = await Calendar.ExpoCalendarReminder.get(reminderIdOf(taskId));
  await reminder.delete();
}

/** A new Reminders list, in the same account (usually iCloud) as the existing ones. */
export async function createAppleList(name: string): Promise<TaskList> {
  const Calendar = await ready();
  if (!Calendar) throw unavailable();
  const existing = await reminderLists(Calendar);
  const home = existing.find((list) => list.allowsModifications) ?? existing[0];
  const created = await Calendar.createCalendar({
    title: name.trim(),
    entityType: Calendar.EntityTypes.REMINDER,
    ...(home?.source?.id ? { sourceId: home.source.id } : {}),
    color: home?.color ? calendarColor(home.color) ?? undefined : undefined,
  });
  return toList(created);
}

export async function renameAppleList(listId: string, name: string): Promise<TaskList> {
  const Calendar = await ready();
  if (!Calendar) throw unavailable();
  const list = await Calendar.ExpoCalendar.get(calendarIdOf(listId));
  await list.update({ title: name.trim() });
  return toList(await Calendar.ExpoCalendar.get(calendarIdOf(listId)));
}

export async function deleteAppleList(listId: string): Promise<void> {
  const Calendar = await ready();
  if (!Calendar) throw unavailable();
  const list = await Calendar.ExpoCalendar.get(calendarIdOf(listId));
  await list.delete();
}
