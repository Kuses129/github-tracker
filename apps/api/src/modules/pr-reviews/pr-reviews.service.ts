import { Injectable } from '@nestjs/common';
import type { PrReview } from '../../generated/prisma';
import type { PrismaTransactionClient } from '../../prisma/prisma.service';
import type { PrReviewProps } from './models/pr-review.models';
import { PrReviewsRepository } from './pr-reviews.repository';

@Injectable()
export class PrReviewsService {
  constructor(private readonly prReviewsRepository: PrReviewsRepository) {}

  async upsert(input: PrReviewProps, tx?: PrismaTransactionClient): Promise<PrReview> {
    return this.prReviewsRepository.upsert(input, tx);
  }
}
