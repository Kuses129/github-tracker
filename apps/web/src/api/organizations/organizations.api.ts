import { apiClient } from '../api-client';
import type { Organization } from './organizations.types';

export function fetchOrganizations(): Promise<Organization[]> {
  return apiClient<Organization[]>('/organizations');
}
