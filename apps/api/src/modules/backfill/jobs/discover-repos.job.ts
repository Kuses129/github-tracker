import { Injectable, Logger } from '@nestjs/common';
import type PgBoss from 'pg-boss';
import { BackfillRunStatus } from '../../../generated/prisma';
import { GitHubClientService } from '../../github-client/github-client.service';
import { RepositoriesService } from '../../repositories/repositories.service';
import { PgBossService } from '../../pg-boss/pg-boss.service';
import { BackfillRunService } from '../backfill-run.service';
import { BackfillTaskService } from '../backfill-task.service';
import {
  BACKFILL_FETCH_PRS,
  type DiscoverReposPayload,
  type FetchPrsPayload,
} from '../models/backfill-job-payloads.model';

@Injectable()
export class DiscoverReposJob {
  private readonly logger = new Logger(DiscoverReposJob.name);

  constructor(
    private readonly gitHubClientService: GitHubClientService,
    private readonly repositoriesService: RepositoriesService,
    private readonly backfillRunService: BackfillRunService,
    private readonly backfillTaskService: BackfillTaskService,
    private readonly pgBossService: PgBossService,
  ) {}

  async handle(job: PgBoss.Job<DiscoverReposPayload>): Promise<void> {
    const { backfillRunId, organizationId, orgLogin } = job.data;

    this.logger.log({ backfillRunId, orgLogin }, 'Discovering repos for backfill run');

    try {
      await this.backfillRunService.update(backfillRunId, {
        status: BackfillRunStatus.discovering,
        startedAt: new Date(),
      });

      const octokit = this.gitHubClientService.getClient();
      const githubRepos = await octokit.paginate(octokit.apps.listReposAccessibleToInstallation, {
        per_page: 100,
      });

      const upsertedRepos = await Promise.all(
        githubRepos.map(repo =>
          this.repositoriesService.upsert({
            githubId: repo.id,
            organizationId,
            name: repo.name,
          }),
        ),
      );

      if (upsertedRepos.length === 0) {
        await this.backfillRunService.update(backfillRunId, {
          status: BackfillRunStatus.completed,
          totalRepos: 0,
          completedAt: new Date(),
        });
        this.logger.log({ backfillRunId }, 'No repos found — backfill completed immediately');
        return;
      }

      const repoIdToGithub = new Map(
        upsertedRepos.map(repo => {
          const githubRepo = githubRepos.find(r => BigInt(r.id) === repo.githubId);
          return [repo.id, { name: githubRepo?.name, owner: githubRepo?.owner?.login }] as const;
        }),
      );

      const tasks = await this.backfillTaskService.createMany(
        upsertedRepos.map(repo => ({
          backfillRunId,
          repositoryId: repo.id,
        })),
      );

      await this.backfillRunService.update(backfillRunId, {
        status: BackfillRunStatus.in_progress,
        totalRepos: upsertedRepos.length,
      });

      await Promise.all(
        tasks.map(task => {
          const github = repoIdToGithub.get(task.repositoryId);
          if (!github?.name || !github.owner) {
            this.logger.warn({ taskId: task.id, repositoryId: task.repositoryId }, 'Could not resolve repo info, skipping task');
            return;
          }

          const payload: FetchPrsPayload = {
            backfillRunId,
            backfillTaskId: task.id,
            repositoryId: task.repositoryId,
            repoOwner: github.owner,
            repoName: github.name,
          };

          return this.pgBossService.send<FetchPrsPayload>(BACKFILL_FETCH_PRS, payload);
        }),
      );

      this.logger.log({ backfillRunId, repoCount: upsertedRepos.length }, 'Repos discovered and tasks enqueued');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ backfillRunId, error: message }, 'Failed to discover repos');

      await this.backfillRunService.update(backfillRunId, {
        status: BackfillRunStatus.failed,
        errorMessage: message,
        completedAt: new Date(),
      });
    }
  }
}
