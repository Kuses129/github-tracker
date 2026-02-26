import { Injectable } from '@nestjs/common';
import type { PullRequest } from '../../generated/prisma';
import type { PullRequestProps } from './models/pull-request.models';
import { PullRequestsRepository } from './pull-requests.repository';

@Injectable()
export class PullRequestsService {
  constructor(private readonly pullRequestsRepository: PullRequestsRepository) {}

  async upsert(input: PullRequestProps): Promise<PullRequest> {
    return this.pullRequestsRepository.upsert(input);
  }

  async findByRepositoryAndNumber(repositoryId: string, number: number): Promise<PullRequest | null> {
    return this.pullRequestsRepository.findByRepositoryAndNumber(repositoryId, number);
  }

  async setFirstReviewAt(id: string, firstReviewAt: Date): Promise<void> {
    return this.pullRequestsRepository.setFirstReviewAt(id, firstReviewAt);
  }

  async setApprovedAt(id: string, approvedAt: Date): Promise<void> {
    return this.pullRequestsRepository.setApprovedAt(id, approvedAt);
  }
}
