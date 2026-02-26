import type { GitHubEntityProps } from '../../../common/models/github-entity.models';

export interface PrReviewProps extends GitHubEntityProps {
  pullRequestId: string;
  reviewerId: string;
  state: string;
  submittedAt: Date;
}
