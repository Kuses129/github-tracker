import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFilterStore } from '../store/filter.store';

const FILTER_KEYS = ['org', 'from', 'to', 'repositories'] as const;

export function useFilterParams(): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const { organizationId, fromDate, toDate, repositoryIds, setOrganizationId, setDateRange, setRepositoryIds } = useFilterStore();

  // Hydrate store from URL on mount
  useEffect(() => {
    const org = searchParams.get('org');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const repositories = searchParams.get('repositories');

    if (org) setOrganizationId(org);
    if (from) setDateRange(from, to);
    if (!from && to) setDateRange(null, to);
    if (repositories) setRepositoryIds(repositories.split(',').filter(Boolean));
    // Only run on mount — store setters are stable refs from zustand
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync store changes back to URL, preserving non-filter params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    for (const key of FILTER_KEYS) {
      params.delete(key);
    }

    if (organizationId) params.set('org', organizationId);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    if (repositoryIds.length > 0) params.set('repositories', repositoryIds.join(','));

    setSearchParams(params, { replace: true });
    // searchParams intentionally excluded — including it would cause an infinite loop
    // since setSearchParams produces a new searchParams object each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, fromDate, toDate, repositoryIds, setSearchParams]);
}
