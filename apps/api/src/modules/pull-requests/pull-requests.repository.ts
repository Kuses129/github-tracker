import { Injectable } from '@nestjs/common';
import type { PullRequest } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { PaginatedResult } from '../../common/pagination/paginated-result';
import type { PullRequestProps } from './models/pull-request.models';
import type { PullRequestFilters } from './models/pull-request-filters.model';

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

  async findByRepository(repoId: string, filters: PullRequestFilters): Promise<PaginatedResult<PullRequest>> {
    const andConditions: Record<string, unknown>[] = [{ repositoryId: repoId }];

    if (filters.from || filters.to) {
      const dateFilter: Record<string, Date> = {};
      if (filters.from) dateFilter.gte = filters.from;
      if (filters.to) dateFilter.lt = filters.to;
      andConditions.push({ githubCreatedAt: dateFilter });
    }
    if (filters.state) {
      andConditions.push({ state: filters.state });
    }
    if (filters.cursorDate && filters.cursorId) {
      andConditions.push({
        OR: [
          { githubCreatedAt: { gt: filters.cursorDate } },
          { githubCreatedAt: filters.cursorDate, id: { gt: filters.cursorId } },
        ],
      });
    }

    const rows = await this.prisma.pullRequest.findMany({
      where: { AND: andConditions },
      take: filters.limit + 1,
      orderBy: [{ githubCreatedAt: 'asc' }, { id: 'asc' }],
    });

    const hasMore = rows.length > filters.limit;
    return { items: hasMore ? rows.slice(0, filters.limit) : rows, hasMore };
  }

  async findDetailById(prId: string): Promise<PullRequest | null> {
    return this.prisma.pullRequest.findUnique({ where: { id: prId } });
  }
}
