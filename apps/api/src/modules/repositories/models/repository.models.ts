import type { GitHubEntityProps } from '../../../common/models/github-entity.models';

export interface RepositoryProps extends GitHubEntityProps {
  organizationId: string;
  name: string;
}
