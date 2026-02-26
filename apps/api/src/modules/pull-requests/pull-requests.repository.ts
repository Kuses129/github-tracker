import { Injectable } from '@nestjs/common';
import type { PullRequest } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { PullRequestProps } from './models/pull-request.models';

@Injectable()
export class PullRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: PullRequestProps): Promise<PullRequest> {
    const githubId = BigInt(input.githubId);

    return this.prisma.pullRequest.upsert({
      where: {
        repositoryId_number: {
          repositoryId: input.repositoryId,
          number: input.number,
        },
      },
      create: {
        githubId,
        repositoryId: input.repositoryId,
        authorId: input.authorId,
        number: input.number,
        title: input.title,
        url: input.url,
        state: input.state,
        additions: input.additions,
        deletions: input.deletions,
        changedFiles: input.changedFiles,
        githubCreatedAt: input.githubCreatedAt,
        mergedAt: input.mergedAt,
      },
      update: {
        title: input.title,
        state: input.state,
        additions: input.additions,
        deletions: input.deletions,
        changedFiles: input.changedFiles,
        mergedAt: input.mergedAt,
      },
    });
  }

  async findByRepositoryAndNumber(repositoryId: string, number: number): Promise<PullRequest | null> {
    return this.prisma.pullRequest.findUnique({
      where: {
        repositoryId_number: { repositoryId, number },
      },
    });
  }

  async setFirstReviewAt(id: string, firstReviewAt: Date): Promise<void> {
    await this.prisma.pullRequest.update({
      where: { id },
      data: { firstReviewAt },
    });
  }

  async setApprovedAt(id: string, approvedAt: Date): Promise<void> {
    await this.prisma.pullRequest.update({
      where: { id },
      data: { approvedAt },
    });
  }
}
