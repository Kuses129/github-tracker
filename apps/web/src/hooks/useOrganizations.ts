import { useQuery } from '@tanstack/react-query';
import { fetchOrganizations } from '../api/organizations/organizations.api';

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: fetchOrganizations,
  });
}
