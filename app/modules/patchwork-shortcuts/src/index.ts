import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

/**
 * Something the system asked Patchwork to do while JS might not be running:
 * an iOS quick action or Siri intent (`open`), or a to-do from Siri or an
 * Android assistant (`createTask`).
 */
export type ShortcutAction =
  | { type: 'open'; url: string }
  | {
      type: 'createTask';
      title: string;
      notes?: string;
      /** ISO instant (iOS Siri). */
      dueAt?: string;
      /** `YYYY-MM-DD` in the phone's time zone (Android AppFunctions). */
      dueDate?: string;
      /** `HH:mm`, only with `dueDate`. */
      dueTime?: string;
      /** A list name, matched loosely. */
      list?: string;
    };

export interface PinShortcutOptions {
  /** Stable id: pinning the same id again updates that shortcut. */
  id: string;
  label: string;
  /** A `patchwork://` deep link. */
  url: string;
  icon: 'list' | 'board';
}

/** What Android AppFunctions answer from, refreshed with the widgets. */
export interface AssistantSnapshot {
  generatedAt: number;
  dueTodayCount: number;
  overdueCount: number;
  today: { title: string; list: string; dueAt: string | null; overdue: boolean }[];
  lists: { name: string; account: string }[];
}

type NativeModule = {
  consumePendingActions(): Record<string, unknown>[];
  canPinShortcuts(): boolean;
  pinShortcut(options: PinShortcutOptions): Promise<boolean>;
  setAssistantSnapshot(json: string): void;
  addListener(event: 'onPendingAction', listener: () => void): EventSubscription;
};

// Optional so a dev client built before this module existed keeps running.
const native = requireOptionalNativeModule<NativeModule>('PatchworkShortcuts');

function parseAction(raw: Record<string, unknown>): ShortcutAction | null {
  const text = (key: string) => (typeof raw[key] === 'string' && raw[key] ? (raw[key] as string) : undefined);
  if (raw.type === 'open') {
    const url = text('url');
    return url ? { type: 'open', url } : null;
  }
  if (raw.type === 'createTask') {
    const title = text('title')?.trim();
    if (!title) return null;
    return {
      type: 'createTask',
      title,
      notes: text('notes'),
      dueAt: text('dueAt'),
      dueDate: text('dueDate'),
      dueTime: text('dueTime'),
      list: text('list'),
    };
  }
  return null;
}

/** Takes every waiting action off the queue. Each one is returned once. */
export function consumePendingActions(): ShortcutAction[] {
  try {
    return (native?.consumePendingActions() ?? []).map(parseAction).filter((a): a is ShortcutAction => a != null);
  } catch {
    return [];
  }
}

/** Fires when a new action is queued while the app is running. */
export function addPendingActionListener(listener: () => void): EventSubscription | null {
  return native?.addListener('onPendingAction', listener) ?? null;
}

/** Android launchers that let apps pin shortcuts. Always false on iOS. */
export function canPinShortcuts(): boolean {
  try {
    return native?.canPinShortcuts() ?? false;
  } catch {
    return false;
  }
}

/** Asks the launcher to pin a shortcut; it shows its own confirmation. */
export async function pinShortcut(options: PinShortcutOptions): Promise<boolean> {
  try {
    return (await native?.pinShortcut(options)) ?? false;
  } catch {
    return false;
  }
}

export function setAssistantSnapshot(snapshot: AssistantSnapshot) {
  try {
    native?.setAssistantSnapshot(JSON.stringify(snapshot));
  } catch {
    // An older dev client without the module: assistants just see no data.
  }
}
