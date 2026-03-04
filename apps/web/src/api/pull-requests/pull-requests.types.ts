export interface PullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged' | 'draft';
  additions: number;
  deletions: number;
  changedFiles: number;
  repositoryId: string;
  authorId: string | null;
  githubCreatedAt: string;
  mergedAt: string | null;
  cycleTime?: {
    totalSeconds: number | null;
  };
}

export interface PullRequestsPage {
  data: PullRequest[];
  nextCursor: string | null;
}

export interface PullRequestsQueryParams {
  repoId?: string;
  from?: string;
  to?: string;
  state?: string;
  cursor?: string;
  limit?: number;
}
