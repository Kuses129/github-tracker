import { apiClient } from '../api-client';
import type { PullRequestsPage, PullRequestsQueryParams } from './pull-requests.types';

export function fetchPullRequests(params: PullRequestsQueryParams): Promise<PullRequestsPage> {
  const { repoId, ...query } = params;
  const filtered = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
  );
  const qs = new URLSearchParams(filtered).toString();
  return apiClient<PullRequestsPage>(`/repositories/${repoId}/pull-requests${qs ? `?${qs}` : ''}`);
}
