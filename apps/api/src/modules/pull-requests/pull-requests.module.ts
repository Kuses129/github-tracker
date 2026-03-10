import { Module } from '@nestjs/common';
import { CommitsModule } from '../commits/commits.module';
import { PrReviewsModule } from '../pr-reviews/pr-reviews.module';
import { PullRequestCommitsRepository } from './pull-request-commits.repository';
import { PullRequestsController } from './pull-requests.controller';
import { PullRequestsRepository } from './pull-requests.repository';
import { PullRequestsService } from './pull-requests.service';

@Module({
  imports: [PrReviewsModule, CommitsModule],
  controllers: [PullRequestsController],
  providers: [PullRequestsRepository, PullRequestsService, PullRequestCommitsRepository],
  exports: [PullRequestsService, PullRequestsRepository],
})
export class PullRequestsModule {}
