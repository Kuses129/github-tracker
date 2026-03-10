import { Injectable, NotFoundException } from '@nestjs/common';
import type { PullRequest } from '../../generated/prisma';
import type { PrismaTransactionClient } from '../../prisma/prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CommitsService } from '../commits/commits.service';
import { PrReviewsService } from '../pr-reviews/pr-reviews.service';
import type { CursorPage } from '../../common/pagination/cursor-page.response';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor.utils';
import { toExclusiveEndDate } from '../../common/date.utils';
import type {
  EnrichPullRequestInput,
  PullRequestIdAndNumber,
  PullRequestProps,
  PullRequestStatsUpdate,
} from './models/pull-request.models';
import type { PullRequestListQueryDto } from './models/pull-request-list-query.dto';
import type { CycleTimeResponse } from './models/cycle-time.response';
import type { PullRequestDetailResponse, PullRequestResponse } from './models/pull-request.response';
import { PullRequestCommitsRepository } from './pull-request-commits.repository';
import { PullRequestsRepository } from './pull-requests.repository';

const DEFAULT_LIMIT = 20;

@Injectable()
export class PullRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pullRequestsRepository: PullRequestsRepository,
    private readonly pullRequestCommitsRepository: PullRequestCommitsRepository,
    private readonly prReviewsService: PrReviewsService,
    private readonly commitsService: CommitsService,
  ) {}

  async upsert(input: PullRequestProps): Promise<PullRequest> {
    return this.pullRequestsRepository.upsert(input);
  }

  async findByRepositoryAndNumber(repositoryId: string, number: number): Promise<PullRequest | null> {
    return this.pullRequestsRepository.findByRepositoryAndNumber(repositoryId, number);
  }

  async setFirstReviewAt(id: string, firstReviewAt: Date): Promise<void> {
    return this.pullRequestsRepository.setFirstReviewAt(id, firstReviewAt);
  }

  async findByBackfillTask(
    repositoryId: string,
    backfillTaskId: string,
  ): Promise<PullRequestIdAndNumber[]> {
    return this.pullRequestsRepository.findByBackfillTask(repositoryId, backfillTaskId);
  }

  async setApprovedAt(id: string, approvedAt: Date): Promise<void> {
    return this.pullRequestsRepository.setApprovedAt(id, approvedAt);
  }

  async updateStats(
    id: string,
    data: PullRequestStatsUpdate,
    tx?: PrismaTransactionClient,
  ): Promise<void> {
    return this.pullRequestsRepository.updateStats(id, data, tx);
  }

  async enrichPr(input: EnrichPullRequestInput): Promise<void> {
    await this.prisma.$transaction(async tx => {
      await this.pullRequestsRepository.updateStats(input.pullRequestId, input.stats, tx);

      for (const review of input.reviews) {
        await this.prReviewsService.upsert(
          {
            githubId: review.githubId,
            pullRequestId: input.pullRequestId,
            reviewerId: review.reviewerId,
            state: review.state,
            submittedAt: review.submittedAt,
            backfillTaskId: review.backfillTaskId,
          },
          tx,
        );
      }

      for (const commit of input.commits) {
        const commitRecord = await this.commitsService.upsert(commit, tx);
        await this.pullRequestCommitsRepository.upsert(input.pullRequestId, commitRecord.id, tx);
      }
    });
  }

  async listPullRequests(repoId: string, query: PullRequestListQueryDto): Promise<CursorPage<PullRequestResponse>> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const decoded = query.cursor ? decodeCursor(query.cursor) : undefined;

    const { items, hasMore } = await this.pullRequestsRepository.findByRepository(repoId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? toExclusiveEndDate(query.to) : undefined,
      state: query.state,
      cursorDate: decoded?.date,
      cursorId: decoded?.id,
      limit,
    });

    const last = items[items.length - 1];
    const nextCursor = hasMore ? encodeCursor(last.githubCreatedAt, last.id) : null;

    return { data: items.map(pr => this.mapToResponse(pr)), nextCursor };
  }

  async getPullRequest(prId: string): Promise<PullRequestDetailResponse> {
    const pr = await this.pullRequestsRepository.findDetailById(prId);
    if (!pr) {
      throw new NotFoundException(`Pull request ${prId} not found`);
    }
    return { ...this.mapToResponse(pr), cycleTime: this.computeCycleTime(pr) };
  }

  private mapToResponse(pr: PullRequest): PullRequestResponse {
    const totalSeconds =
      pr.mergedAt && pr.firstCommitAt
        ? Math.round((pr.mergedAt.getTime() - pr.firstCommitAt.getTime()) / 1000)
        : null;

    return {
      id: pr.id,
      githubId: Number(pr.githubId),
      number: pr.number,
      title: pr.title,
      url: pr.url,
      state: pr.state,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      repositoryId: pr.repositoryId,
      authorId: pr.authorId,
      githubCreatedAt: pr.githubCreatedAt.toISOString(),
      firstCommitAt: pr.firstCommitAt?.toISOString() ?? null,
      firstReviewAt: pr.firstReviewAt?.toISOString() ?? null,
      approvedAt: pr.approvedAt?.toISOString() ?? null,
      mergedAt: pr.mergedAt?.toISOString() ?? null,
      cycleTime: { totalSeconds },
    };
  }

  private computeCycleTime(pr: PullRequest): CycleTimeResponse {
    const diff = (a: Date | null, b: Date | null): number | null =>
      a && b ? Math.round((a.getTime() - b.getTime()) / 1000) : null;

    return {
      codingTimeSeconds: diff(pr.githubCreatedAt, pr.firstCommitAt),
      pickupTimeSeconds: diff(pr.firstReviewAt, pr.githubCreatedAt),
      reviewTimeSeconds: diff(pr.approvedAt, pr.firstReviewAt),
      deployTimeSeconds: diff(pr.mergedAt, pr.approvedAt),
      totalSeconds: diff(pr.mergedAt, pr.firstCommitAt),
    };
  }
}
