import { Typography, Box, Alert } from '@mui/material';
import { useFilterStore } from '../store/filter.store';
import { usePullRequests } from '../hooks/usePullRequests';
import { PullRequestsTable } from '../components/tables/PullRequestsTable';

export function PullRequestsPage() {
  const { fromDate, toDate, repositoryIds } = useFilterStore();
  const repoId = repositoryIds[0];

  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = usePullRequests({
    repoId,
    from: fromDate ?? undefined,
    to: toDate ?? undefined,
  });

  const rows = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">Pull Requests</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Browse and filter pull requests across your repositories
        </Typography>
      </Box>
      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load pull requests. Please try again later.
        </Alert>
      )}
      {repositoryIds.length === 0 ? (
        <Typography variant="body1" color="text.secondary">
          Select a repository from the filter bar to view pull requests
        </Typography>
      ) : (
        <PullRequestsTable
          rows={rows}
          isLoading={isLoading}
          hasNextPage={hasNextPage}
          onLoadMore={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      )}
    </Box>
  );
}
