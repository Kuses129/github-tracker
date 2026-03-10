import { Injectable, Logger } from '@nestjs/common';
import type PgBoss from 'pg-boss';
import { BackfillTaskStatus, PrState } from '../../../generated/prisma';
import { GitHubClientService } from '../../github-client/github-client.service';
import { ContributorsService } from '../../contributors/contributors.service';
import { PullRequestsService } from '../../pull-requests/pull-requests.service';
import { PgBossService } from '../../pg-boss/pg-boss.service';
import { BackfillTaskService } from '../backfill-task.service';
import {
  BACKFILL_COMPLETE_REPO,
  BACKFILL_ENRICH_PR,
  type CompleteRepoPayload,
  type EnrichPrPayload,
  type FetchPrsPayload,
} from '../models/backfill-job-payloads.model';

@Injectable()
export class FetchPrsJob {
  private readonly logger = new Logger(FetchPrsJob.name);

  constructor(
    private readonly gitHubClientService: GitHubClientService,
    private readonly pullRequestsService: PullRequestsService,
    private readonly contributorsService: ContributorsService,
    private readonly backfillTaskService: BackfillTaskService,
    private readonly pgBossService: PgBossService,
  ) {}

  async handle(job: PgBoss.Job<FetchPrsPayload>): Promise<void> {
    const { backfillRunId, backfillTaskId, repositoryId, repoOwner, repoName } = job.data;

    this.logger.log({ backfillTaskId, repoOwner, repoName }, 'Fetching PRs for task');

    try {
      await this.backfillTaskService.update(backfillTaskId, {
        status: BackfillTaskStatus.fetching_prs,
        startedAt: new Date(),
      });

      const octokit = this.gitHubClientService.getClient();
      const githubPrs = await octokit.paginate(octokit.pulls.list, {
        owner: repoOwner,
        repo: repoName,
        state: 'all',
        per_page: 100,
      });

      if (githubPrs.length === 0) {
        await this.backfillTaskService.update(backfillTaskId, {
          status: BackfillTaskStatus.enriching,
          totalPrs: 0,
        });

        const completePayload: CompleteRepoPayload = { backfillRunId, backfillTaskId, repositoryId };
        await this.pgBossService.send<CompleteRepoPayload>(BACKFILL_COMPLETE_REPO, completePayload);

        this.logger.log({ backfillTaskId }, 'No PRs found — complete-repo job enqueued');
        return;
      }

      for (const pr of githubPrs) {
        const authorLogin = pr.user?.login;
        const authorGithubId = pr.user?.id;

        let authorId: string | null = null;
        if (authorLogin && authorGithubId) {
          const author = await this.contributorsService.upsert({
            githubId: authorGithubId,
            login: authorLogin,
          });
          authorId = author.id;
        }

        const state = this.mapPrState(pr.state, pr.merged_at);

        await this.pullRequestsService.upsert({
          githubId: pr.id,
          repositoryId,
          authorId: authorId ?? '',
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          state,
          additions: 0,
          deletions: 0,
          changedFiles: 0,
          githubCreatedAt: new Date(pr.created_at),
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
          backfillTaskId,
        });
      }

      await this.backfillTaskService.update(backfillTaskId, {
        status: BackfillTaskStatus.enriching,
        totalPrs: githubPrs.length,
      });

      const upsertedPrs = await this.pullRequestsService.findByBackfillTask(repositoryId, backfillTaskId);

      await Promise.all(
        upsertedPrs.map(pr => {
          const payload: EnrichPrPayload = {
            backfillRunId,
            backfillTaskId,
            repositoryId,
            pullRequestId: pr.id,
            pullRequestNumber: pr.number,
            repoOwner,
            repoName,
          };

          return this.pgBossService.send<EnrichPrPayload>(BACKFILL_ENRICH_PR, payload);
        }),
      );

      this.logger.log({ backfillTaskId, prCount: githubPrs.length }, 'PRs fetched and enrich jobs enqueued');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ backfillTaskId, error: message }, 'Failed to fetch PRs');

      await this.backfillTaskService.update(backfillTaskId, {
        status: BackfillTaskStatus.failed,
        errorMessage: message,
        completedAt: new Date(),
      });
    }
  }

  private mapPrState(state: string, mergedAt: string | null): PrState {
    if (mergedAt) return PrState.merged;
    if (state === 'closed') return PrState.closed;
    return PrState.open;
  }
}
