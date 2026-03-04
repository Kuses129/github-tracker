import type { CycleTimeResponse } from './cycle-time.response';

export interface PullRequestResponse {
  id: string;
  githubId: number;
  number: number;
  title: string;
  url: string;
  state: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  repositoryId: string;
  authorId: string | null;
  githubCreatedAt: string;
  firstCommitAt: string | null;
  firstReviewAt: string | null;
  approvedAt: string | null;
  mergedAt: string | null;
  cycleTime: Pick<CycleTimeResponse, 'totalSeconds'>;
}

export interface PullRequestDetailResponse extends PullRequestResponse {
  cycleTime: CycleTimeResponse;
}
