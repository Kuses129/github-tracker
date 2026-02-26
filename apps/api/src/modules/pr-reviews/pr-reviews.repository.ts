import { Injectable } from '@nestjs/common';
import type { PrReview } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import type { PrReviewProps } from './models/pr-review.models';

@Injectable()
export class PrReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: PrReviewProps): Promise<PrReview> {
    const githubId = BigInt(input.githubId);
    return this.prisma.prReview.upsert({
      where: { githubId },
      create: {
        githubId,
        pullRequestId: input.pullRequestId,
        reviewerId: input.reviewerId,
        state: input.state,
        submittedAt: input.submittedAt,
      },
      update: {
        state: input.state,
        submittedAt: input.submittedAt,
      },
    });
  }
}
