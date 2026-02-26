import { Module } from '@nestjs/common';
import { CommitsModule } from '../commits/commits.module';
import { ContributorsModule } from '../contributors/contributors.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PrReviewsModule } from '../pr-reviews/pr-reviews.module';
import { PullRequestsModule } from '../pull-requests/pull-requests.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { InstallationHandler } from './handlers/installation.handler';
import { PullRequestHandler } from './handlers/pull-request.handler';
import { PullRequestReviewHandler } from './handlers/pull-request-review.handler';
import { PushHandler } from './handlers/push.handler';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [
    OrganizationsModule,
    RepositoriesModule,
    ContributorsModule,
    PullRequestsModule,
    PrReviewsModule,
    CommitsModule,
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    InstallationHandler,
    PullRequestHandler,
    PullRequestReviewHandler,
    PushHandler,
  ],
})
export class WebhooksModule {}
