import { useQuery } from '@tanstack/react-query';

import { listDeviceCalendars } from '@/lib/calendar';

export function useDeviceCalendars(enabled: boolean) {
  return useQuery({
    queryKey: ['device-calendars'],
    queryFn: listDeviceCalendars,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
