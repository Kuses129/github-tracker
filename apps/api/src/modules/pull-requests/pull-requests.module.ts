import { Module } from '@nestjs/common';
import { PullRequestsRepository } from './pull-requests.repository';
import { PullRequestsService } from './pull-requests.service';

@Module({
  providers: [PullRequestsRepository, PullRequestsService],
  exports: [PullRequestsService, PullRequestsRepository],
})
export class PullRequestsModule {}
