import { Injectable, Logger } from '@nestjs/common';
import type PgBoss from 'pg-boss';
import { GitHubClientService } from '../../github-client/github-client.service';
import { ContributorsService } from '../../contributors/contributors.service';
import { PgBossService } from '../../pg-boss/pg-boss.service';
import { PullRequestsService } from '../../pull-requests/pull-requests.service';
import { BackfillTaskService } from '../backfill-task.service';
import {
  BACKFILL_COMPLETE_REPO,
  type CompleteRepoPayload,
  type EnrichPrPayload,
} from '../models/backfill-job-payloads.model';

@Injectable()
export class EnrichPrJob {
  private readonly logger = new Logger(EnrichPrJob.name);

  constructor(
    private readonly gitHubClientService: GitHubClientService,
    private readonly contributorsService: ContributorsService,
    private readonly pullRequestsService: PullRequestsService,
    private readonly backfillTaskService: BackfillTaskService,
    private readonly pgBossService: PgBossService,
  ) {}

  async handle(job: PgBoss.Job<EnrichPrPayload>): Promise<void> {
    const { backfillTaskId, repositoryId, pullRequestId, pullRequestNumber, repoOwner, repoName } =
      job.data;

    this.logger.log({ backfillTaskId, pullRequestId, pullRequestNumber }, 'Enriching PR');

    try {
      const octokit = this.gitHubClientService.getClient();

      const [prDetail, reviews, commits] = await Promise.all([
        octokit.pulls.get({ owner: repoOwner, repo: repoName, pull_number: pullRequestNumber }),
        octokit.paginate(octokit.pulls.listReviews, { owner: repoOwner, repo: repoName, pull_number: pullRequestNumber, per_page: 100 }),
        octokit.paginate(octokit.pulls.listCommits, { owner: repoOwner, repo: repoName, pull_number: pullRequestNumber, per_page: 100 }),
      ]);

      // Upsert all contributors outside the transaction to avoid nested async service calls inside tx
      const reviewerIds = new Map<number, string>();
      for (const review of reviews) {
        if (!review.user || !review.submitted_at) continue;
        const reviewer = await this.contributorsService.upsert({
          githubId: review.user.id,
          login: review.user.login,
        });
        reviewerIds.set(review.user.id, reviewer.id);
      }

      const commitAuthorIds = new Map<string, string | null>();
      for (const commit of commits) {
        const authorLogin = commit.author?.login ?? commit.commit.author?.name;
        const authorGithubId = commit.author?.id;
        if (authorLogin && authorGithubId) {
          const author = await this.contributorsService.upsert({
            githubId: authorGithubId,
            login: authorLogin,
          });
          commitAuthorIds.set(commit.sha, author.id);
        } else {
          commitAuthorIds.set(commit.sha, null);
        }
      }

      await this.pullRequestsService.enrichPr({
        pullRequestId,
        stats: {
          additions: prDetail.data.additions,
          deletions: prDetail.data.deletions,
          changedFiles: prDetail.data.changed_files,
        },
        reviews: reviews
          .filter(r => r.user && r.submitted_at)
          .map(r => ({
            githubId: r.id,
            reviewerId: reviewerIds.get(r.user!.id)!,
            state: r.state,
            submittedAt: new Date(r.submitted_at!),
            backfillTaskId,
          })),
        commits: commits.map(c => ({
          sha: c.sha,
          repositoryId,
          authorId: commitAuthorIds.get(c.sha) ?? null,
          message: c.commit.message,
          committedAt: new Date(c.commit.author?.date ?? Date.now()),
          backfillTaskId,
        })),
      });

      const task = await this.backfillTaskService.update(backfillTaskId, {
        processedPrs: { increment: 1 },
      });

      if (task.processedPrs + task.failedPrs >= task.totalPrs) {
        const payload: CompleteRepoPayload = { backfillRunId: job.data.backfillRunId, backfillTaskId, repositoryId };
        await this.pgBossService.send<CompleteRepoPayload>(BACKFILL_COMPLETE_REPO, payload);
        this.logger.log({ backfillTaskId }, 'All PRs processed, complete-repo job enqueued');
      }

      this.logger.log({ backfillTaskId, pullRequestId }, 'PR enriched');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ backfillTaskId, pullRequestId, error: message }, 'Failed to enrich PR');

      await this.backfillTaskService.update(backfillTaskId, {
        failedPrs: { increment: 1 },
        errorMessage: message,
      });

      // Do not re-throw — failure is tracked above; re-throwing would cause pg-boss to retry
      // and double-count the failure on the next attempt.
    }
  }
}
