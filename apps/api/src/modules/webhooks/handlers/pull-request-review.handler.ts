import { Injectable, Logger } from '@nestjs/common';
import { ContributorsService } from '../../contributors/contributors.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { PrReviewsService } from '../../pr-reviews/pr-reviews.service';
import { PullRequestsRepository } from '../../pull-requests/pull-requests.repository';
import { RepositoriesService } from '../../repositories/repositories.service';
import type { PullRequestReviewPayload } from '../models/webhook-event.models';

@Injectable()
export class PullRequestReviewHandler {
  private readonly logger = new Logger(PullRequestReviewHandler.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly repositoriesService: RepositoriesService,
    private readonly contributorsService: ContributorsService,
    private readonly prReviewsService: PrReviewsService,
    private readonly pullRequestsRepository: PullRequestsRepository,
  ) {}

  async handle(payload: PullRequestReviewPayload): Promise<void> {
    if (payload.action !== 'submitted') return;

    const org = await this.organizationsService.upsert({
      githubId: payload.repository.owner.id,
      login: payload.repository.owner.login,
    });

    const repo = await this.repositoriesService.upsert({
      githubId: payload.repository.id,
      organizationId: org.id,
      name: payload.repository.name,
    });

    const reviewer = await this.contributorsService.upsert({
      githubId: payload.review.user.id,
      login: payload.review.user.login,
    });

    const pr = await this.pullRequestsRepository.findByRepositoryAndNumber(
      repo.id,
      payload.pull_request.number,
    );

    if (!pr) {
      this.logger.warn(
        {
          repo: payload.repository.full_name,
          number: payload.pull_request.number,
        },
        'PR not found for review event — skipping',
      );
      return;
    }

    const submittedAt = new Date(payload.review.submitted_at);

    await this.prReviewsService.upsert({
      githubId: payload.review.id,
      pullRequestId: pr.id,
      reviewerId: reviewer.id,
      state: payload.review.state,
      submittedAt,
    });

    if (!pr.firstReviewAt) {
      await this.pullRequestsRepository.setFirstReviewAt(pr.id, submittedAt);
    }

    if (payload.review.state === 'approved' && !pr.approvedAt) {
      await this.pullRequestsRepository.setApprovedAt(pr.id, submittedAt);
    }

    this.logger.log(
      { prId: pr.id, reviewState: payload.review.state },
      'Pull request review upserted',
    );
  }
}
