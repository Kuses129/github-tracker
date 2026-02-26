import { Module } from '@nestjs/common';
import { PrReviewsRepository } from './pr-reviews.repository';
import { PrReviewsService } from './pr-reviews.service';

@Module({
  providers: [PrReviewsRepository, PrReviewsService],
  exports: [PrReviewsService],
})
export class PrReviewsModule {}
