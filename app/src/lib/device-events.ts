import { getCalendar } from './calendar';

/**
 * Events from the calendars already on the phone: Google, Samsung, Outlook,
 * iCloud, CalDAV through DAVx5, holidays. Patchwork only reads them, to draw
 * them next to the day's to-dos, and never writes back.
 */

export interface EventCalendar {
  id: string;
  title: string;
  color: string | null;
  /** The account it belongs to, e.g. a Gmail address or "iCloud". */
  source: string;
}

export interface DeviceEvent {
  id: string;
  calendarId: string;
  calendarTitle: string;
  color: string | null;
  title: string;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
}

/** `#RRGGBB`, from iOS hex or Android's `#AARRGGBB` / ARGB integer. */
export function calendarColor(raw: unknown): string | null {
  if (typeof raw === 'number') return `#${(raw & 0xffffff).toString(16).padStart(6, '0')}`;
  if (typeof raw !== 'string') return null;
  const hex = raw.trim().replace('#', '');
  if (/^[0-9a-f]{8}$/i.test(hex)) return `#${hex.slice(2)}`;
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`;
  return null;
}

/** Whether calendar access is already granted, without asking. */
export async function hasCalendarAccess(): Promise<boolean> {
  const Calendar = await getCalendar();
  if (!Calendar) return false;
  try {
    return (await Calendar.getCalendarPermissions()).granted;
  } catch {
    return false;
  }
}

/** Asks for full calendar access. False on web, Expo Go on Android, or a refusal. */
export async function requestCalendarAccess(): Promise<boolean> {
  const Calendar = await getCalendar();
  if (!Calendar) return false;
  try {
    const current = await Calendar.getCalendarPermissions();
    if (current.granted) return true;
    return (await Calendar.requestCalendarPermissions()).granted;
  } catch {
    return false;
  }
}

/** Every event calendar on the phone, read-only ones included, grouped by account then name. */
export async function listEventCalendars(): Promise<EventCalendar[]> {
  const Calendar = await getCalendar();
  if (!Calendar || !(await hasCalendarAccess())) return [];
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return calendars
    .map((calendar) => ({
      id: calendar.id,
      title: calendar.title || 'Calendar',
      color: calendarColor(calendar.color),
      source: calendar.source?.name || calendar.ownerAccount || '',
    }))
    .sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title));
}

/** Events between `from` and `to` in every calendar not in `hidden`. */
export async function listDeviceEvents(from: Date, to: Date, hidden: string[]): Promise<DeviceEvent[]> {
  const Calendar = await getCalendar();
  if (!Calendar || !(await hasCalendarAccess())) return [];
  const calendars = (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).filter(
    (calendar) => !hidden.includes(calendar.id)
  );
  if (calendars.length === 0) return [];
  const byId = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const events = await Calendar.listEvents(
    calendars.map((calendar) => calendar.id),
    from,
    to
  );
  return events.map((event) => {
    const calendar = byId.get(event.calendarId);
    return {
      id: event.id,
      calendarId: event.calendarId,
      calendarTitle: calendar?.title ?? 'Calendar',
      color: calendarColor(calendar?.color),
      title: event.title || '(No title)',
      location: event.location || null,
      start: new Date(event.startDate).toISOString(),
      end: new Date(event.endDate).toISOString(),
      allDay: !!event.allDay,
    };
  });
}

/** Opens the event in the system calendar app. */
export async function openDeviceEvent(eventId: string): Promise<void> {
  const Calendar = await getCalendar();
  if (!Calendar) return;
  try {
    const event = await Calendar.ExpoCalendarEvent.get(eventId);
    await event.openInCalendar();
  } catch {
    // The event may have been deleted since the list was read.
  }
}
