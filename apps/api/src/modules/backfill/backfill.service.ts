import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { OrganizationsService } from '../organizations/organizations.service';
import { PgBossService } from '../pg-boss/pg-boss.service';
import { BackfillRunService } from './backfill-run.service';
import { CompleteRepoJob } from './jobs/complete-repo.job';
import { DiscoverReposJob } from './jobs/discover-repos.job';
import { EnrichPrJob } from './jobs/enrich-pr.job';
import { FetchPrsJob } from './jobs/fetch-prs.job';
import {
  BACKFILL_COMPLETE_REPO,
  BACKFILL_DISCOVER_REPOS,
  BACKFILL_ENRICH_PR,
  BACKFILL_FETCH_PRS,
  type CompleteRepoPayload,
  DISCOVER_REPOS_CONCURRENCY,
  ENRICH_PR_CONCURRENCY,
  FETCH_PRS_CONCURRENCY,
  type DiscoverReposPayload,
  type EnrichPrPayload,
  type FetchPrsPayload,
} from './models/backfill-job-payloads.model';

@Injectable()
export class BackfillService implements OnModuleInit {
  private readonly logger = new Logger(BackfillService.name);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly organizationsService: OrganizationsService,
    private readonly backfillRunService: BackfillRunService,
    private readonly discoverReposJob: DiscoverReposJob,
    private readonly fetchPrsJob: FetchPrsJob,
    private readonly enrichPrJob: EnrichPrJob,
    private readonly completeRepoJob: CompleteRepoJob,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all([
      this.pgBossService.createQueue(BACKFILL_DISCOVER_REPOS),
      this.pgBossService.createQueue(BACKFILL_FETCH_PRS),
      this.pgBossService.createQueue(BACKFILL_ENRICH_PR),
      this.pgBossService.createQueue(BACKFILL_COMPLETE_REPO),
    ]);

    await this.pgBossService.work<DiscoverReposPayload>(
      BACKFILL_DISCOVER_REPOS,
      { localConcurrency: DISCOVER_REPOS_CONCURRENCY },
      job => this.discoverReposJob.handle(job),
    );

    await this.pgBossService.work<FetchPrsPayload>(
      BACKFILL_FETCH_PRS,
      { localConcurrency: FETCH_PRS_CONCURRENCY },
      job => this.fetchPrsJob.handle(job),
    );

    await this.pgBossService.work<EnrichPrPayload>(
      BACKFILL_ENRICH_PR,
      { localConcurrency: ENRICH_PR_CONCURRENCY },
      job => this.enrichPrJob.handle(job),
    );

    await this.pgBossService.work<CompleteRepoPayload>(
      BACKFILL_COMPLETE_REPO,
      { localConcurrency: 1 },
      job => this.completeRepoJob.handle(job),
    );

    this.logger.log('Backfill workers registered');
  }

  async triggerBackfill(orgId: string): Promise<{ backfillRunId: string }> {
    const orgs = await this.organizationsService.getOrganizations();
    const org = orgs.find(o => o.id === orgId);

    if (!org) {
      throw new NotFoundException(`Organization ${orgId} not found`);
    }

    const activeRun = await this.backfillRunService.findActiveByOrg(orgId);
    if (activeRun) {
      throw new ConflictException(`A backfill run is already active for organization ${orgId} (runId: ${activeRun.id})`);
    }

    const run = await this.backfillRunService.create(orgId);

    const payload: DiscoverReposPayload = {
      backfillRunId: run.id,
      organizationId: org.id,
      orgLogin: org.login,
    };

    await this.pgBossService.send<DiscoverReposPayload>(BACKFILL_DISCOVER_REPOS, payload);

    this.logger.log({ backfillRunId: run.id, orgId, orgLogin: org.login }, 'Backfill triggered');

    return { backfillRunId: run.id };
  }
}
