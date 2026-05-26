import { api } from './client';
import type { HealthResponse } from './types';

export function fetchHealth() {
  return api.get<HealthResponse>('/health');
}
