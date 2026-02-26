import type { PrState } from '../../../generated/prisma';
import type { GitHubEntityProps } from '../../../common/models/github-entity.models';

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
}
