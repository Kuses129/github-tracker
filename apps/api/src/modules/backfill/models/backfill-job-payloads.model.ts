export const BACKFILL_DISCOVER_REPOS = 'backfill.discover-repos';
export const BACKFILL_FETCH_PRS = 'backfill.fetch-prs';
export const BACKFILL_ENRICH_PR = 'backfill.enrich-pr';
export const BACKFILL_COMPLETE_REPO = 'backfill.complete-repo';

// Sequential — one org discovery at a time to avoid duplicate repo processing
export const DISCOVER_REPOS_CONCURRENCY = 1;

// Parallel per-repo PR fetching; limited to 5 to stay within GitHub API rate limits
export const FETCH_PRS_CONCURRENCY = 5;

// Parallel PR enrichment (3 API calls per PR); kept at 5 to avoid rate-limit bursts
export const ENRICH_PR_CONCURRENCY = 5;

export interface DiscoverReposPayload {
  backfillRunId: string;
  organizationId: string;
  orgLogin: string;
}

export interface FetchPrsPayload {
  backfillRunId: string;
  backfillTaskId: string;
  repositoryId: string;
  repoOwner: string;
  repoName: string;
}

export interface EnrichPrPayload {
  backfillRunId: string;
  backfillTaskId: string;
  repositoryId: string;
  pullRequestId: string;
  pullRequestNumber: number;
  repoOwner: string;
  repoName: string;
}

export interface CompleteRepoPayload {
  backfillRunId: string;
  backfillTaskId: string;
  repositoryId: string;
}