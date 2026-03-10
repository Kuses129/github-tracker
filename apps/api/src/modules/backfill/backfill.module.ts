import { Module } from '@nestjs/common';
import { CommitsModule } from '../commits/commits.module';
import { ContributorsModule } from '../contributors/contributors.module';
import { GitHubClientModule } from '../github-client/github-client.module';
import { MetricsModule } from '../metrics/metrics.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PgBossModule } from '../pg-boss/pg-boss.module';
import { PrReviewsModule } from '../pr-reviews/pr-reviews.module';
import { PullRequestsModule } from '../pull-requests/pull-requests.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { BackfillController } from './backfill.controller';
import { BackfillRunRepository } from './backfill-run.repository';
import { BackfillRunService } from './backfill-run.service';
import { BackfillService } from './backfill.service';
import { BackfillTaskRepository } from './backfill-task.repository';
import { BackfillTaskService } from './backfill-task.service';
import { CompleteRepoJob } from './jobs/complete-repo.job';
import { DiscoverReposJob } from './jobs/discover-repos.job';
import { EnrichPrJob } from './jobs/enrich-pr.job';
import { FetchPrsJob } from './jobs/fetch-prs.job';

@Module({
  imports: [
    GitHubClientModule,
    MetricsModule,
    PgBossModule,
    RepositoriesModule,
    PullRequestsModule,
    ContributorsModule,
    PrReviewsModule,
    CommitsModule,
    OrganizationsModule,
  ],
  controllers: [BackfillController],
  providers: [
    BackfillService,
    BackfillRunRepository,
    BackfillRunService,
    BackfillTaskRepository,
    BackfillTaskService,
    CompleteRepoJob,
    DiscoverReposJob,
    FetchPrsJob,
    EnrichPrJob,
  ],
  exports: [BackfillService],
})
export class BackfillModule {}
