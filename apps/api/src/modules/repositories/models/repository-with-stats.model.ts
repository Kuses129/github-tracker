import type { Repository } from '../../../generated/prisma';

export interface RepositoryWithStats extends Repository {
  totalPullRequests: number;
  mergedPullRequests: number;
  openPullRequests: number;
}
