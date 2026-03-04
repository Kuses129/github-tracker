import { Chip } from '@mui/material';
import type { ChipProps } from '@mui/material';
import type { PullRequest } from '../../api/pull-requests/pull-requests.types';

interface PullRequestStatusChipProps {
  state: PullRequest['state'];
}

function getChipColor(state: PullRequest['state']): ChipProps['color'] {
  switch (state) {
    case 'open':
      return 'success';
    case 'closed':
      return 'error';
    case 'merged':
      return 'secondary';
    case 'draft':
      return 'default';
  }
}

export function PullRequestStatusChip({ state }: PullRequestStatusChipProps) {
  return (
    <Chip
      label={state}
      size="small"
      color={getChipColor(state)}
    />
  );
}
