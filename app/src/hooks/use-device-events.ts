import { useQuery } from '@tanstack/react-query';

import { listDeviceEvents, listEventCalendars } from '@/lib/device-events';
import { useSettingsStore } from '@/stores/settings-store';

/** Phone calendar events between `from` and `to`, when the user turned them on. */
export function useDeviceEvents(from: Date, to: Date) {
  const enabled = useSettingsStore((s) => s.deviceEvents) && process.env.EXPO_OS !== 'web';
  const hidden = useSettingsStore((s) => s.hiddenEventCalendars);
  return useQuery({
    queryKey: ['device-events', from.toISOString(), to.toISOString(), hidden],
    queryFn: () => listDeviceEvents(from, to, hidden),
    enabled,
    // Refreshed when the app comes back to the foreground (see the root layout).
    staleTime: 60_000,
  });
}

/** The phone's event calendars, for choosing which ones to show. */
export function useEventCalendars(enabled: boolean) {
  return useQuery({
    queryKey: ['device-event-calendars'],
    queryFn: listEventCalendars,
    enabled: enabled && process.env.EXPO_OS !== 'web',
    staleTime: 60_000,
  });
}
