import { apiClient } from '../api-client';
import type { Repository } from './repositories.types';

export function fetchAllRepositories(): Promise<Repository[]> {
  return apiClient<Repository[]>('/repositories');
}

export function fetchRepositoriesByOrg(orgId: string): Promise<Repository[]> {
  return apiClient<Repository[]>(`/repositories?orgId=${orgId}`);
}
