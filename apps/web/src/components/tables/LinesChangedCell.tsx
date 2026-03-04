import { Box, Typography } from '@mui/material';

interface LinesChangedCellProps {
  additions: number;
  deletions: number;
}

export function LinesChangedCell({ additions, deletions }: LinesChangedCellProps) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      <Typography variant="body2" sx={{ color: 'success.main' }}>
        +{additions}
      </Typography>
      <Typography variant="body2" sx={{ color: 'error.main' }}>
        -{deletions}
      </Typography>
    </Box>
  );
}
