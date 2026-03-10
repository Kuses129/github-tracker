import { Injectable, Logger } from '@nestjs/common';
import type PgBoss from 'pg-boss';
import { BackfillRunStatus, BackfillTaskStatus } from '../../../generated/prisma';
import { MetricRollupService } from '../../metrics/metric-rollup.service';
import { BackfillRunService } from '../backfill-run.service';
import { BackfillTaskService } from '../backfill-task.service';
import type { CompleteRepoPayload } from '../models/backfill-job-payloads.model';

@Injectable()
export class CompleteRepoJob {
  private readonly logger = new Logger(CompleteRepoJob.name);

  constructor(
    private readonly backfillTaskService: BackfillTaskService,
    private readonly backfillRunService: BackfillRunService,
    private readonly metricRollupService: MetricRollupService,
  ) {}

  async handle(job: PgBoss.Job<CompleteRepoPayload>): Promise<void> {
    const { backfillRunId, backfillTaskId, repositoryId } = job.data;

    this.logger.log({ backfillTaskId, repositoryId }, 'Completing repo backfill');

    await this.backfillTaskService.update(backfillTaskId, {
      status: BackfillTaskStatus.completed,
      completedAt: new Date(),
    });

    await this.metricRollupService.computeForRepository(repositoryId);

    const run = await this.backfillRunService.update(backfillRunId, {
      completedRepos: { increment: 1 },
    });

    if (run.completedRepos + run.failedRepos >= run.totalRepos) {
      await this.backfillRunService.update(backfillRunId, {
        status: BackfillRunStatus.completed,
        completedAt: new Date(),
      });

      this.logger.log({ backfillRunId }, 'Backfill run completed');
    }

    this.logger.log({ backfillTaskId, repositoryId }, 'Repo backfill completed');
  }
}
