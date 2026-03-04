import { Module } from '@nestjs/common';
import { PullRequestsController } from './pull-requests.controller';
import { PullRequestsRepository } from './pull-requests.repository';
import { PullRequestsService } from './pull-requests.service';

@Module({
  controllers: [PullRequestsController],
  providers: [PullRequestsRepository, PullRequestsService],
  exports: [PullRequestsService, PullRequestsRepository],
})
export class PullRequestsModule {}
