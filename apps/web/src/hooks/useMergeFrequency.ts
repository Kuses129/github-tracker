import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchMergeFrequency } from '../api/metrics/metrics.api';
import type { MergeFrequencyParams } from '../api/metrics/metrics.types';

export function useMergeFrequency(params: MergeFrequencyParams | null) {
  return useQuery({
    queryKey: ['mergeFrequency', params],
    queryFn: () => fetchMergeFrequency(params!),
    enabled: !!params?.from && !!params?.to,
    placeholderData: keepPreviousData,
  });
}
