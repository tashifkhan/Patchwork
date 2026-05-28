import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { parseDate } from './format';

type CalendarModule = typeof import('expo-calendar');

export interface DeviceCalendar {
  id: string;
  title: string;
  color: string | null;
  allowsModifications: boolean;
}

let calendarPromise: Promise<CalendarModule | null> | null = null;

function canUseCalendar() {
  return !(Platform.OS === 'web' || (Platform.OS === 'android' && Constants.appOwnership === 'expo'));
}

async function getCalendar() {
  if (!canUseCalendar()) return null;
  calendarPromise ??= import('expo-calendar').catch(() => null);
  return calendarPromise;
}

export async function ensureCalendarPermission(): Promise<boolean> {
  const Calendar = await getCalendar();
  if (!Calendar) return false;
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.granted) return true;
  const request = await Calendar.requestCalendarPermissionsAsync();
  return request.granted;
}

// Lists every writable calendar on the device — system accounts (Google,
// Samsung, iCloud) and CalDAV ones alike — so a task can be mirrored as an event.
export async function listDeviceCalendars(): Promise<DeviceCalendar[]> {
  const Calendar = await getCalendar();
  if (!Calendar) return [];
  const granted = await ensureCalendarPermission();
  if (!granted) return [];

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars
    .filter((calendar) => calendar.allowsModifications)
    .map((calendar) => ({
      id: calendar.id,
      title: calendar.title,
      color: (calendar.color as string | undefined) ?? null,
      allowsModifications: calendar.allowsModifications,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

// Creates a calendar event for a task. Uses the due date as the event time
// (falling back to the reminder), and adds an alarm at the reminder time.
export async function addTaskToCalendar(params: {
  calendarId: string;
  title: string;
  notes?: string;
  dueAt: string | null;
  reminderAt: string | null;
}): Promise<string | null> {
  const Calendar = await getCalendar();
  if (!Calendar) return null;

  const due = parseDate(params.dueAt);
  const reminder = parseDate(params.reminderAt);
  const start = due ?? reminder;
  if (!start) return null;

  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const alarms = reminder
    ? [{ relativeOffset: Math.round((reminder.getTime() - start.getTime()) / 60000) }]
    : [];

  return Calendar.createEventAsync(params.calendarId, {
    title: params.title,
    notes: params.notes,
    startDate: start,
    endDate: end,
    alarms,
  });
}
