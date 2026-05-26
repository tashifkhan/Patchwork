import { useQuery } from '@tanstack/react-query';

import { fetchHealth } from '@/api/health';
import { queryKeys } from '@/lib/query-client';

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: fetchHealth, retry: false });
}
