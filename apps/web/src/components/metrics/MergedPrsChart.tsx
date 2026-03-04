import { Box, Typography, Skeleton, Tooltip, useTheme } from '@mui/material';
import type { MergeFrequencyPeriod } from '../../api/metrics/metrics.types';

interface MergedPrsChartProps {
  data: MergeFrequencyPeriod[];
  isLoading: boolean;
}

export function MergedPrsChart({ data, isLoading }: MergedPrsChartProps) {
  const theme = useTheme();

  if (isLoading) {
    return <Skeleton variant="rectangular" height={200} />;
  }

  if (data.length === 0) {
    return (
      <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No merge data for this period
        </Typography>
      </Box>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <Box sx={{ height: 200, display: 'flex', alignItems: 'flex-end', gap: 1, px: 1 }}>
      {data.map((item) => {
        const heightPercent = (item.count / maxCount) * 100;
        return (
          <Tooltip key={item.period} title={`${item.period}: ${item.count}`} arrow>
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                height: '100%',
              }}
            >
              <Box
                sx={{
                  width: '100%',
                  height: `${heightPercent}%`,
                  backgroundColor: theme.palette.primary.main,
                  borderRadius: '2px 2px 0 0',
                  minHeight: 2,
                  transition: 'height 0.3s ease',
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  mt: 0.5,
                  transform: 'rotate(-45deg)',
                  whiteSpace: 'nowrap',
                  fontSize: '0.6rem',
                  color: 'text.secondary',
                }}
              >
                {item.period}
              </Typography>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
