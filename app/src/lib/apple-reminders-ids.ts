/**
 * Ids for the Apple Reminders source, kept apart from the EventKit code so the
 * task API can route on them without loading React Native (tests import it).
 */
export const APPLE_ACCOUNT_ID = 'apple-reminders';
export const APPLE_ACCOUNT_NAME = 'Apple Reminders';
export const APPLE_LIST_PREFIX = `${APPLE_ACCOUNT_ID}:`;
export const APPLE_TASK_PREFIX = 'apple://reminders/';

export function isAppleListId(listId: string | null | undefined): boolean {
  return !!listId && listId.startsWith(APPLE_LIST_PREFIX);
}

export function isAppleTaskId(taskId: string | null | undefined): boolean {
  return !!taskId && taskId.startsWith(APPLE_TASK_PREFIX);
}
