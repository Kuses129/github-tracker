import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchPullRequests } from '../api/pull-requests/pull-requests.api';
import type { PullRequestsQueryParams } from '../api/pull-requests/pull-requests.types';

export function usePullRequests(params: Omit<PullRequestsQueryParams, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: ['pullRequests', params],
    queryFn: ({ pageParam }) =>
      fetchPullRequests({ ...params, cursor: pageParam ?? undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    enabled: !!params.repoId,
  });
}
