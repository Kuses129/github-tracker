import { useQuery } from '@tanstack/react-query';
import { fetchAllRepositories, fetchRepositoriesByOrg } from '../api/repositories/repositories.api';

export function useRepositories(orgId?: string | null) {
  return useQuery({
    queryKey: ['repositories', orgId ?? 'all'],
    queryFn: () => (orgId ? fetchRepositoriesByOrg(orgId) : fetchAllRepositories()),
  });
}
