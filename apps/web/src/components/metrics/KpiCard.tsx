import { Card, CardContent, Typography, Skeleton, Chip, Box } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import type { KpiCardProps } from './models/kpi-card.types';

export function KpiCard({ title, value, delta, isLoading, unit }: KpiCardProps) {
  const hasDelta = delta !== null && delta !== undefined;
  const isPositive = hasDelta && delta > 0;
  const isNegative = hasDelta && delta < 0;

  return (
    <Card>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          {isLoading ? (
            <Skeleton variant="text" width={80} height={48} />
          ) : (
            <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {value ?? 0}
              {unit && (
                <Typography component="span" variant="h6" sx={{ ml: 0.5, fontWeight: 500 }}>
                  {unit}
                </Typography>
              )}
            </Typography>
          )}
          {!isLoading && hasDelta && (
            <Chip
              size="small"
              icon={isPositive ? <ArrowUpwardIcon fontSize="small" /> : isNegative ? <ArrowDownwardIcon fontSize="small" /> : undefined}
              label={`${delta > 0 ? '+' : ''}${delta}%`}
              color={isPositive ? 'success' : isNegative ? 'error' : 'default'}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
