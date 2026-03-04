import type { RepositoryResponse } from './repository.response';

export interface RepositoryStatsResponse extends RepositoryResponse {
  totalPullRequests: number;
  mergedPullRequests: number;
  openPullRequests: number;
}
