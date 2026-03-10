import type { PrState } from '../../../generated/prisma';
import type { GitHubEntityProps } from '../../../common/models/github-entity.models';

export interface PullRequestIdAndNumber {
  id: string;
  number: number;
}

export interface PullRequestProps extends GitHubEntityProps {
  repositoryId: string;
  authorId: string;
  number: number;
  title: string;
  url: string;
  state: PrState;
  additions: number;
  deletions: number;
  changedFiles: number;
  githubCreatedAt: Date;
  mergedAt: Date | null;
  backfillTaskId?: string;
}

export interface PullRequestStatsUpdate {
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface EnrichPullRequestInput {
  pullRequestId: string;
  stats: PullRequestStatsUpdate;
  reviews: EnrichPullRequestReview[];
  commits: EnrichPullRequestCommit[];
}

export interface EnrichPullRequestReview {
  githubId: number;
  reviewerId: string;
  state: string;
  submittedAt: Date;
  backfillTaskId?: string;
}

export interface EnrichPullRequestCommit {
  sha: string;
  repositoryId: string;
  authorId: string | null;
  message: string;
  committedAt: Date;
  backfillTaskId?: string;
}
