import { Alert, Box, Card, CardContent, Typography } from '@mui/material';
import { useFilterStore } from '../store/filter.store';
import { useMergeFrequency } from '../hooks/useMergeFrequency';
import { KpiCard } from '../components/metrics/KpiCard';
import { MergedPrsChart } from '../components/metrics/MergedPrsChart';
import type { MergeFrequencyParams } from '../api/metrics/metrics.types';

function getPreviousPeriodRange(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const duration = toDate.getTime() - fromDate.getTime();
  const prevFrom = new Date(fromDate.getTime() - duration);
  return { from: prevFrom.toISOString().split('T')[0], to: from };
}

function buildParams(
  from: string,
  to: string,
  organizationId: string | null,
  repositoryIds: string[],
): MergeFrequencyParams {
  return {
    from,
    to,
    groupBy: 'day',
    orgId: organizationId ?? undefined,
    repositories: repositoryIds.length > 0 ? repositoryIds : undefined,
  };
}

export function DashboardPage() {
  const { organizationId, fromDate, toDate, repositoryIds } = useFilterStore();

  const currentParams =
    fromDate && toDate ? buildParams(fromDate, toDate, organizationId, repositoryIds) : null;

  const previousRange = fromDate && toDate ? getPreviousPeriodRange(fromDate, toDate) : null;
  const previousParams = previousRange
    ? buildParams(previousRange.from, previousRange.to, organizationId, repositoryIds)
    : null;

  const { data: currentData, isLoading: currentLoading, isError } = useMergeFrequency(currentParams);
  const { data: previousData } = useMergeFrequency(previousParams);

  const chartData = currentData?.data ?? [];
  const total = chartData.reduce((sum, p) => sum + p.count, 0);
  const previousTotal = previousData?.data.reduce((sum, p) => sum + p.count, 0) ?? 0;
  const delta =
    previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : null;

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">Overview</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Merge activity for the selected period
        </Typography>
      </Box>
      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load metrics. Please try again later.
        </Alert>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 2,
          }}
        >
          <KpiCard
            title="PRs Merged"
            value={total}
            delta={delta}
            isLoading={currentLoading}
          />
        </Box>
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.72rem' }}>
              Merge Frequency
            </Typography>
            <MergedPrsChart data={chartData} isLoading={currentLoading} />
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
