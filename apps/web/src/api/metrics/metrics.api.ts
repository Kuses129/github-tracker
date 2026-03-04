import { apiClient } from '../api-client';
import type { MergeFrequencyParams, MergeFrequencyResponse } from './metrics.types';

export function fetchMergeFrequency(params: MergeFrequencyParams): Promise<MergeFrequencyResponse> {
  const searchParams = new URLSearchParams({
    from: params.from,
    to: params.to,
    groupBy: params.groupBy,
  });
  if (params.repositories?.length) {
    searchParams.set('repositories', params.repositories.join(','));
  }
  const basePath = params.orgId
    ? `/organizations/${params.orgId}/metrics/merge-frequency`
    : '/metrics/merge-frequency';
  return apiClient<MergeFrequencyResponse>(`${basePath}?${searchParams}`);
}
