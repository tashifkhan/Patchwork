import { api } from './client';
import type { HealthResponse } from './types';

// The proxy mounts the health router without a prefix (see
// `proxy/app/router/health.py`), unlike the task/deck/ai routers.
export function fetchHealth() {
  return api.get<HealthResponse>('/health');
}
