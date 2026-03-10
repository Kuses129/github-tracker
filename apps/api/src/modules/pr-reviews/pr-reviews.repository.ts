import { Injectable } from '@nestjs/common';
import type { PrReview } from '../../generated/prisma';
import type { PrismaTransactionClient } from '../../prisma/prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { PrReviewProps } from './models/pr-review.models';

@Injectable()
export class PrReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTransactionClient): PrismaTransactionClient {
    return tx ?? this.prisma;
  }

  async upsert(input: PrReviewProps, tx?: PrismaTransactionClient): Promise<PrReview> {
    const githubId = BigInt(input.githubId);
    return this.client(tx).prReview.upsert({
      where: { githubId },
      create: {
        githubId,
        pullRequestId: input.pullRequestId,
        reviewerId: input.reviewerId,
        state: input.state,
        submittedAt: input.submittedAt,
        ...(input.backfillTaskId && { backfillTaskId: input.backfillTaskId }),
      },
      update: {
        state: input.state,
        submittedAt: input.submittedAt,
        ...(input.backfillTaskId && { backfillTaskId: input.backfillTaskId }),
      },
    });
  }
}
