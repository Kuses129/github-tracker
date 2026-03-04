import { useState, useMemo } from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableSortLabel,
  Skeleton,
  Button,
  Box,
  Card,
} from '@mui/material';
import { PullRequestStatusChip } from './PullRequestStatusChip';
import { CycleTimeCell } from './CycleTimeCell';
import { LinesChangedCell } from './LinesChangedCell';
import type { PullRequest } from '../../api/pull-requests/pull-requests.types';

type SortColumn = 'state' | 'title' | 'cycleTime' | 'linesChanged' | 'mergedAt';
type SortDirection = 'asc' | 'desc';

interface PullRequestsTableProps {
  rows: PullRequest[];
  isLoading: boolean;
  hasNextPage?: boolean;
  onLoadMore: () => void;
  isFetchingNextPage: boolean;
}

function comparePullRequests(a: PullRequest, b: PullRequest, column: SortColumn, direction: SortDirection): number {
  let result = 0;

  switch (column) {
    case 'state':
      result = a.state.localeCompare(b.state);
      break;
    case 'title':
      result = a.title.localeCompare(b.title);
      break;
    case 'cycleTime': {
      const aSeconds = a.cycleTime?.totalSeconds ?? -1;
      const bSeconds = b.cycleTime?.totalSeconds ?? -1;
      result = aSeconds - bSeconds;
      break;
    }
    case 'linesChanged':
      result = (a.additions + a.deletions) - (b.additions + b.deletions);
      break;
    case 'mergedAt': {
      const aTime = a.mergedAt ? new Date(a.mergedAt).getTime() : 0;
      const bTime = b.mergedAt ? new Date(b.mergedAt).getTime() : 0;
      result = aTime - bTime;
      break;
    }
  }

  return direction === 'asc' ? result : -result;
}

const SKELETON_ROWS = 5;
const COLUMN_COUNT = 5;

export function PullRequestsTable({
  rows,
  isLoading,
  hasNextPage,
  onLoadMore,
  isFetchingNextPage,
}: PullRequestsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('mergedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => comparePullRequests(a, b, sortColumn, sortDirection)),
    [rows, sortColumn, sortDirection],
  );

  function sortLabelProps(column: SortColumn) {
    return {
      active: sortColumn === column,
      direction: sortColumn === column ? sortDirection : 'asc' as SortDirection,
      onClick: () => handleSort(column),
    };
  }

  return (
    <Card sx={{ overflow: 'hidden' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>
              <TableSortLabel {...sortLabelProps('state')}>Status</TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel {...sortLabelProps('title')}>Title</TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel {...sortLabelProps('cycleTime')}>Cycle Time</TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel {...sortLabelProps('linesChanged')}>Lines Changed</TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel {...sortLabelProps('mergedAt')}>Merged At</TableSortLabel>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {isLoading &&
            Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: COLUMN_COUNT }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton variant="text" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!isLoading && sortedRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} align="center">
                No pull requests match your filters
              </TableCell>
            </TableRow>
          )}
          {!isLoading &&
            sortedRows.map((pr) => (
              <TableRow key={pr.id}>
                <TableCell>
                  <PullRequestStatusChip state={pr.state} />
                </TableCell>
                <TableCell>
                  <Box
                    component="a"
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      color: 'inherit',
                      textDecoration: 'none',
                      fontWeight: 500,
                      '&:hover': { color: 'primary.main' },
                    }}
                  >
                    {pr.title}
                  </Box>
                </TableCell>
                <TableCell>
                  <CycleTimeCell totalSeconds={pr.cycleTime?.totalSeconds ?? null} />
                </TableCell>
                <TableCell>
                  <LinesChangedCell additions={pr.additions} deletions={pr.deletions} />
                </TableCell>
                <TableCell>
                  {pr.mergedAt ? new Date(pr.mergedAt).toLocaleDateString() : '—'}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      {hasNextPage && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={onLoadMore} disabled={isFetchingNextPage} variant="outlined" size="small">
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </Button>
        </Box>
      )}
    </Card>
  );
}
