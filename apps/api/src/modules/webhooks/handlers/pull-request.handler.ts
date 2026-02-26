import { Injectable, Logger } from '@nestjs/common';
import { PrState } from '../../../generated/prisma';
import { ContributorsService } from '../../contributors/contributors.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { PullRequestsService } from '../../pull-requests/pull-requests.service';
import { RepositoriesService } from '../../repositories/repositories.service';
import type { PullRequestPayload } from '../models/webhook-event.models';

@Injectable()
export class PullRequestHandler {
  private readonly logger = new Logger(PullRequestHandler.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly repositoriesService: RepositoriesService,
    private readonly contributorsService: ContributorsService,
    private readonly pullRequestsService: PullRequestsService,
  ) {}

  async handle(payload: PullRequestPayload): Promise<void> {
    const org = await this.organizationsService.upsert({
      githubId: payload.repository.owner.id,
      login: payload.repository.owner.login,
    });

    const repo = await this.repositoriesService.upsert({
      githubId: payload.repository.id,
      organizationId: org.id,
      name: payload.repository.name,
    });

    const author = await this.contributorsService.upsert({
      githubId: payload.pull_request.user.id,
      login: payload.pull_request.user.login,
    });

    const state = this.mapState(payload);
    const mergedAt = payload.pull_request.merged_at
      ? new Date(payload.pull_request.merged_at)
      : null;

    await this.pullRequestsService.upsert({
      githubId: payload.pull_request.id,
      repositoryId: repo.id,
      authorId: author.id,
      number: payload.pull_request.number,
      title: payload.pull_request.title,
      url: payload.pull_request.html_url,
      state,
      additions: payload.pull_request.additions,
      deletions: payload.pull_request.deletions,
      changedFiles: payload.pull_request.changed_files,
      githubCreatedAt: new Date(payload.pull_request.created_at),
      mergedAt,
    });

    this.logger.log(
      {
        repo: payload.repository.full_name,
        number: payload.pull_request.number,
        state,
      },
      'Pull request upserted',
    );
  }

  private mapState(payload: PullRequestPayload): PrState {
    if (payload.pull_request.merged) return PrState.merged;
    if (payload.pull_request.state === 'closed') return PrState.closed;
    return PrState.open;
  }
}
