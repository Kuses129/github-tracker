# Epic 4: Historical Backfill (Week 4-5)

Build the background backfill pipeline so historical data (before GitHub App install) appears in the dashboard.

---

## US-020: pg-boss Setup + Backfill Job Chain

Set up pg-boss and implement the 4-step backfill job chain.

**Parallel:** After US-003 (schema) and US-009 (GitHub App for Octokit auth). Can run in parallel with Epic 3 frontend stories.

**Recommended Agents:** `backend-developer`, `sql-pro`

---

### Implementation Details

#### NestJS Module Structure

Create a dedicated `BackfillModule` inside `apps/api/src/modules/backfill/`:

```
apps/api/src/modules/backfill/
  backfill.module.ts
  backfill.controller.ts
  backfill.service.ts
  backfill-run.repository.ts        # handles backfill_runs table only
  backfill-task.repository.ts       # handles backfill_tasks table only
  /jobs/
    discover-repos.job.ts           # Step 1
    fetch-prs.job.ts                # Step 2
    enrich-pr.job.ts                # Step 3
    complete-repo.job.ts            # Step 4
  /models/
    backfill-run.model.ts
    backfill-task.model.ts
    backfill-job-payloads.model.ts  # typed payloads for each pg-boss job
```

The `BackfillModule` imports `GithubModule` (for the Octokit instance), `PrismaModule`, and the shared `PgBossModule`.

#### pg-boss Initialization

Create a shared `PgBossModule` at `apps/api/src/modules/pg-boss/`:

```
apps/api/src/modules/pg-boss/
  pg-boss.module.ts     # global module, exports PgBossService
  pg-boss.service.ts    # wraps PgBoss instance lifecycle
```

`pg-boss.service.ts` — initialize on `onModuleInit`, stop on `onModuleDestroy`:

```typescript
// apps/api/src/modules/pg-boss/pg-boss.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import PgBoss from 'pg-boss';

@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private boss: PgBoss;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.boss = new PgBoss({
      connectionString: this.configService.get('DATABASE_URL'),
      retryLimit: 3,
      retryDelay: 30,          // seconds, pg-boss doubles this per retry (exponential)
      retryBackoff: true,
      monitorStateIntervalSeconds: 30,
    });
    await this.boss.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop();
  }

  getInstance(): PgBoss {
    return this.boss;
  }
}
```

`pg-boss.module.ts` — declare as `@Global()` so all feature modules can inject `PgBossService` without re-importing:

```typescript
// apps/api/src/modules/pg-boss/pg-boss.module.ts
@Global()
@Module({
  providers: [PgBossService],
  exports: [PgBossService],
})
export class PgBossModule {}
```

Register `PgBossModule` once in `AppModule`.

#### Prisma Schema Additions

Add to `apps/api/prisma/schema.prisma`:

```prisma
enum BackfillRunStatus {
  pending
  discovering
  in_progress
  completed
  failed
  cancelled
}

enum BackfillTaskStatus {
  pending
  fetching_prs
  enriching
  completed
  failed
}

model BackfillRun {
  id             String            @id @default(uuid()) @db.Uuid
  organizationId String            @map("organization_id") @db.Uuid
  status         BackfillRunStatus @default(pending)
  totalRepos     Int?              @map("total_repos")
  completedRepos Int               @default(0) @map("completed_repos")
  failedRepos    Int               @default(0) @map("failed_repos")
  startedAt      DateTime?         @map("started_at") @db.Timestamptz
  completedAt    DateTime?         @map("completed_at") @db.Timestamptz
  errorMessage   String?           @map("error_message")
  createdAt      DateTime          @default(now()) @map("created_at") @db.Timestamptz

  organization   Organization      @relation(fields: [organizationId], references: [id])
  tasks          BackfillTask[]

  @@index([organizationId])
  @@index([status])
  @@map("backfill_runs")
}

model BackfillTask {
  id            String             @id @default(uuid()) @db.Uuid
  backfillRunId String             @map("backfill_run_id") @db.Uuid
  repositoryId  String             @map("repository_id") @db.Uuid
  status        BackfillTaskStatus @default(pending)
  totalPrs      Int?               @map("total_prs")
  processedPrs  Int                @default(0) @map("processed_prs")
  failedPrs     Int                @default(0) @map("failed_prs")
  cursor        String?
  startedAt     DateTime?          @map("started_at") @db.Timestamptz
  completedAt   DateTime?          @map("completed_at") @db.Timestamptz
  errorMessage  String?            @map("error_message")
  createdAt     DateTime           @default(now()) @map("created_at") @db.Timestamptz

  backfillRun   BackfillRun        @relation(fields: [backfillRunId], references: [id])
  repository    Repository         @relation(fields: [repositoryId], references: [id])

  @@index([backfillRunId])
  @@index([repositoryId])
  @@map("backfill_tasks")
}
```

#### Job Name Constants

Define all job names as constants to avoid magic strings across the job files:

```typescript
// apps/api/src/modules/backfill/models/backfill-job-payloads.model.ts

export const BACKFILL_JOB_NAMES = {
  DISCOVER_REPOS: 'backfill.discover-repos',
  FETCH_PRS: 'backfill.fetch-prs',
  ENRICH_PR: 'backfill.enrich-pr',
  COMPLETE_REPO: 'backfill.complete-repo',
} as const;

export interface DiscoverReposPayload {
  backfillRunId: string;
  organizationId: string;
  orgLogin: string;
}

export interface FetchPrsPayload {
  backfillTaskId: string;
  backfillRunId: string;
  repositoryId: string;
  repoOwner: string;
  repoName: string;
}

export interface EnrichPrPayload {
  backfillTaskId: string;
  repositoryId: string;
  pullRequestId: string;
  prNumber: number;
  repoOwner: string;
  repoName: string;
}

export interface CompleteRepoPayload {
  backfillTaskId: string;
  backfillRunId: string;
  repositoryId: string;
}
```

#### Controller

```typescript
// apps/api/src/modules/backfill/backfill.controller.ts
@Controller('api/v1/organizations/:orgId/backfill')
export class BackfillController {
  constructor(private readonly backfillService: BackfillService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerBackfill(
    @Param('orgId') orgId: string,
  ): Promise<{ backfillRunId: string }> {
    return this.backfillService.triggerBackfill(orgId);
  }
}
```

Returns `202 Accepted` immediately — the job chain runs asynchronously in the background.

#### Service — Job Registration and Trigger

`backfill.service.ts` owns job worker registration (called once on startup via `onModuleInit`) and the trigger logic:

```typescript
// apps/api/src/modules/backfill/backfill.service.ts
@Injectable()
export class BackfillService implements OnModuleInit {
  constructor(
    private readonly pgBossService: PgBossService,
    private readonly backfillRunRepository: BackfillRunRepository,
    private readonly backfillTaskRepository: BackfillTaskRepository,
    private readonly discoverReposJob: DiscoverReposJob,
    private readonly fetchPrsJob: FetchPrsJob,
    private readonly enrichPrJob: EnrichPrJob,
    private readonly completeRepoJob: CompleteRepoJob,
  ) {}

  async onModuleInit(): Promise<void> {
    const boss = this.pgBossService.getInstance();
    await boss.work(BACKFILL_JOB_NAMES.DISCOVER_REPOS, this.discoverReposJob.handle.bind(this.discoverReposJob));
    await boss.work(BACKFILL_JOB_NAMES.FETCH_PRS, this.fetchPrsJob.handle.bind(this.fetchPrsJob));
    await boss.work(BACKFILL_JOB_NAMES.ENRICH_PR, { teamSize: 5 }, this.enrichPrJob.handle.bind(this.enrichPrJob));
    await boss.work(BACKFILL_JOB_NAMES.COMPLETE_REPO, this.completeRepoJob.handle.bind(this.completeRepoJob));
  }

  async triggerBackfill(organizationId: string): Promise<{ backfillRunId: string }> {
    const org = await this.organizationRepository.findByIdOrThrow(organizationId);
    const run = await this.backfillRunRepository.create({ organizationId, status: 'pending' });

    const boss = this.pgBossService.getInstance();
    await boss.send(BACKFILL_JOB_NAMES.DISCOVER_REPOS, {
      backfillRunId: run.id,
      organizationId,
      orgLogin: org.login,
    } satisfies DiscoverReposPayload);

    return { backfillRunId: run.id };
  }
}
```

`teamSize: 5` on `ENRICH_PR` tells pg-boss to process up to 5 enrich jobs concurrently per worker process, which balances throughput against the GitHub rate limit budget.

#### Step 1: Discover Repos Job

```typescript
// apps/api/src/modules/backfill/jobs/discover-repos.job.ts
@Injectable()
export class DiscoverReposJob {
  constructor(
    private readonly octokit: OctokitService,
    private readonly backfillRunRepository: BackfillRunRepository,
    private readonly backfillTaskRepository: BackfillTaskRepository,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly pgBossService: PgBossService,
  ) {}

  async handle(job: PgBoss.Job<DiscoverReposPayload>): Promise<void> {
    const { backfillRunId, organizationId, orgLogin } = job.data;
    const boss = this.pgBossService.getInstance();

    await this.backfillRunRepository.updateStatus(backfillRunId, 'discovering');

    try {
      const repos = await this.octokit.paginate('GET /orgs/{org}/repos', {
        org: orgLogin,
        type: 'all',
        per_page: 100,
      });

      // Upsert each repo so they exist before creating tasks
      const upsertedRepos = await Promise.all(
        repos.map((r) => this.repositoryRepository.upsertFromGitHub(organizationId, r)),
      );

      // Create one backfill_task per repo
      const tasks = await this.backfillTaskRepository.createMany(
        upsertedRepos.map((repo) => ({ backfillRunId, repositoryId: repo.id })),
      );

      await this.backfillRunRepository.update(backfillRunId, {
        totalRepos: tasks.length,
        status: 'in_progress',
      });

      // Enqueue Step 2 for every repo as a batch
      await boss.insert(
        tasks.map((task) => ({
          name: BACKFILL_JOB_NAMES.FETCH_PRS,
          data: {
            backfillTaskId: task.id,
            backfillRunId,
            repositoryId: task.repositoryId,
            repoOwner: orgLogin,
            repoName: upsertedRepos.find((r) => r.id === task.repositoryId)!.name,
          } satisfies FetchPrsPayload,
        })),
      );
    } catch (error) {
      await this.backfillRunRepository.update(backfillRunId, {
        status: 'failed',
        errorMessage: (error as Error).message,
      });
      throw error; // re-throw so pg-boss marks the job as failed and retries
    }
  }
}
```

#### Step 2: Fetch PRs Job

```typescript
// apps/api/src/modules/backfill/jobs/fetch-prs.job.ts
@Injectable()
export class FetchPrsJob {
  constructor(
    private readonly octokit: OctokitService,
    private readonly backfillTaskRepository: BackfillTaskRepository,
    private readonly pullRequestRepository: PullRequestRepository,
    private readonly pgBossService: PgBossService,
  ) {}

  async handle(job: PgBoss.Job<FetchPrsPayload>): Promise<void> {
    const { backfillTaskId, backfillRunId, repositoryId, repoOwner, repoName } = job.data;
    const boss = this.pgBossService.getInstance();

    await this.backfillTaskRepository.update(backfillTaskId, {
      status: 'fetching_prs',
      startedAt: new Date(),
    });

    try {
      const prs = await this.octokit.paginate('GET /repos/{owner}/{repo}/pulls', {
        owner: repoOwner,
        repo: repoName,
        state: 'all',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
      });

      // Upsert PR metadata — idempotent via (repository_id, number) unique constraint
      const upsertedPrs = await this.pullRequestRepository.upsertManyFromList(repositoryId, prs);

      await this.backfillTaskRepository.update(backfillTaskId, {
        totalPrs: upsertedPrs.length,
        status: 'enriching',
      });

      // Only enqueue enrichment for PRs not already enriched
      // A PR is considered enriched when additions IS NOT NULL (set by detail endpoint)
      const prsNeedingEnrichment = upsertedPrs.filter((pr) => pr.additions === null);

      await boss.insert(
        prsNeedingEnrichment.map((pr) => ({
          name: BACKFILL_JOB_NAMES.ENRICH_PR,
          data: {
            backfillTaskId,
            repositoryId,
            pullRequestId: pr.id,
            prNumber: pr.number,
            repoOwner,
            repoName,
          } satisfies EnrichPrPayload,
        })),
      );

      // If no PRs need enrichment (all already done), immediately enqueue Step 4
      if (prsNeedingEnrichment.length === 0) {
        await boss.send(BACKFILL_JOB_NAMES.COMPLETE_REPO, {
          backfillTaskId,
          backfillRunId,
          repositoryId,
        } satisfies CompleteRepoPayload);
      }
    } catch (error) {
      await this.backfillTaskRepository.update(backfillTaskId, {
        status: 'failed',
        errorMessage: (error as Error).message,
      });
      throw error;
    }
  }
}
```

#### Step 3: Enrich PR Job

```typescript
// apps/api/src/modules/backfill/jobs/enrich-pr.job.ts
@Injectable()
export class EnrichPrJob {
  constructor(
    private readonly octokit: OctokitService,
    private readonly backfillTaskRepository: BackfillTaskRepository,
    private readonly pullRequestRepository: PullRequestRepository,
    private readonly prReviewRepository: PrReviewRepository,
    private readonly commitRepository: CommitRepository,
    private readonly pgBossService: PgBossService,
    private readonly prisma: PrismaService,
  ) {}

  async handle(job: PgBoss.Job<EnrichPrPayload>): Promise<void> {
    const { backfillTaskId, repositoryId, pullRequestId, prNumber, repoOwner, repoName } = job.data;
    const boss = this.pgBossService.getInstance();

    try {
      // 3 parallel API calls — they are independent of each other
      const [detail, reviews, commits] = await Promise.all([
        this.octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
          owner: repoOwner,
          repo: repoName,
          pull_number: prNumber,
        }),
        this.octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
          owner: repoOwner,
          repo: repoName,
          pull_number: prNumber,
        }),
        this.octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', {
          owner: repoOwner,
          repo: repoName,
          pull_number: prNumber,
        }),
      ]);

      // Wrap all upserts in a single transaction for consistency
      await this.prisma.$transaction(async (tx) => {
        await this.pullRequestRepository.updateEnrichmentData(pullRequestId, detail.data, { tx });
        await this.prReviewRepository.upsertMany(pullRequestId, reviews.data, { tx });
        await this.commitRepository.upsertManyForPr(repositoryId, pullRequestId, commits.data, { tx });
      });

      // Increment processed count and check if this was the last PR for the repo
      const task = await this.backfillTaskRepository.incrementProcessed(backfillTaskId);

      if (task.processedPrs + task.failedPrs >= task.totalPrs!) {
        await boss.send(BACKFILL_JOB_NAMES.COMPLETE_REPO, {
          backfillTaskId,
          backfillRunId: task.backfillRunId,
          repositoryId,
        } satisfies CompleteRepoPayload);
      }
    } catch (error) {
      await this.backfillTaskRepository.incrementFailed(backfillTaskId, (error as Error).message);
      throw error;
    }
  }
}
```

The 3 Octokit calls are made with `Promise.all` since they are independent, reducing wall-clock time per PR from 3 sequential round-trips to 1.

#### Step 4: Complete Repo Job

```typescript
// apps/api/src/modules/backfill/jobs/complete-repo.job.ts
@Injectable()
export class CompleteRepoJob {
  constructor(
    private readonly backfillRunRepository: BackfillRunRepository,
    private readonly backfillTaskRepository: BackfillTaskRepository,
    private readonly metricRollupService: MetricRollupService,
  ) {}

  async handle(job: PgBoss.Job<CompleteRepoPayload>): Promise<void> {
    const { backfillTaskId, backfillRunId, repositoryId } = job.data;

    await this.backfillTaskRepository.update(backfillTaskId, {
      status: 'completed',
      completedAt: new Date(),
    });

    // Trigger rollup computation for this repo's full date range (US-021)
    await this.metricRollupService.computeForRepository(repositoryId);

    // Atomically increment completed_repos and check if all repos are done
    const run = await this.backfillRunRepository.incrementCompleted(backfillRunId);

    if (run.completedRepos + run.failedRepos >= run.totalRepos!) {
      await this.backfillRunRepository.update(backfillRunId, {
        status: run.failedRepos > 0 ? 'completed' : 'completed',
        completedAt: new Date(),
      });
    }
  }
}
```

#### Rate Limit Handling

`OctokitService` wraps the Octokit instance with `@octokit/plugin-throttling`. When the rate limit drops below 500 remaining requests, the throttling plugin automatically delays subsequent requests until `X-RateLimit-Reset`. No custom code is needed for this — the plugin handles 403 and 429 responses with automatic backoff:

```typescript
// apps/api/src/modules/github/octokit.service.ts
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';

const ThrottledOctokit = Octokit.plugin(throttling);

@Injectable()
export class OctokitService {
  private client: InstanceType<typeof ThrottledOctokit>;

  constructor(private readonly configService: ConfigService) {
    this.client = new ThrottledOctokit({
      auth: configService.get('GITHUB_APP_INSTALLATION_TOKEN'),
      throttle: {
        onRateLimit: (retryAfter, options, octokit, retryCount) => {
          if (retryCount < 3) return true; // retry
          return false;
        },
        onSecondaryRateLimit: (retryAfter, options) => true, // always retry secondary
      },
    });
  }

  // Delegate paginate and request to the underlying client
  get paginate() { return this.client.paginate.bind(this.client); }
  get request() { return this.client.request.bind(this.client); }
}
```

#### Repository Layer

Each repository class handles exactly one Prisma model:

`backfill-run.repository.ts` — CRUD for `backfill_runs`:
- `create(data)`, `update(id, data)`, `updateStatus(id, status)`
- `incrementCompleted(id): Promise<BackfillRun>` — uses `UPDATE ... RETURNING` for atomic read-after-write
- `findByIdOrThrow(id)`

`backfill-task.repository.ts` — CRUD for `backfill_tasks`:
- `create(data)`, `createMany(data[])`, `update(id, data)`
- `incrementProcessed(id): Promise<BackfillTask>` — atomic increment + return
- `incrementFailed(id, errorMessage): Promise<void>`

---

### Testing Details

#### Test File Locations

```
apps/api/src/modules/backfill/
  __tests__/
    backfill.service.spec.ts
    backfill-run.repository.spec.ts
    backfill-task.repository.spec.ts
  jobs/
    __tests__/
      discover-repos.job.spec.ts
      fetch-prs.job.spec.ts
      enrich-pr.job.spec.ts
      complete-repo.job.spec.ts

apps/api/test/
  backfill-chain.e2e-spec.ts   # integration test for the full 4-step chain
```

#### Unit Tests — Job Handlers

Test each job handler in isolation by mocking all dependencies. Do not use a real pg-boss instance in unit tests.

`discover-repos.job.spec.ts` — key scenarios:
```typescript
describe('DiscoverReposJob', () => {
  let job: DiscoverReposJob;
  let octokitService: jest.Mocked<OctokitService>;
  let backfillRunRepository: jest.Mocked<BackfillRunRepository>;
  let backfillTaskRepository: jest.Mocked<BackfillTaskRepository>;
  let pgBossService: { getInstance: () => { send: jest.Mock; insert: jest.Mock } };

  beforeEach(() => {
    // create mocks with jest.createMockFromModule or manual jest.fn()
  });

  it('creates one backfill_task per discovered repo', async () => {
    octokitService.paginate.mockResolvedValueOnce([
      { id: 1, name: 'repo-a', full_name: 'org/repo-a' },
      { id: 2, name: 'repo-b', full_name: 'org/repo-b' },
    ]);
    backfillTaskRepository.createMany.mockResolvedValueOnce([
      { id: 'task-1', repositoryId: 'repo-uuid-1' },
      { id: 'task-2', repositoryId: 'repo-uuid-2' },
    ]);

    await job.handle(makeJob({ backfillRunId: 'run-1', orgLogin: 'org' }));

    expect(backfillTaskRepository.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ backfillRunId: 'run-1' }),
      ]),
    );
    expect(pgBossService.getInstance().insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: BACKFILL_JOB_NAMES.FETCH_PRS }),
      ]),
    );
  });

  it('sets backfill_run status to failed and re-throws when Octokit errors', async () => {
    octokitService.paginate.mockRejectedValueOnce(new Error('API error'));

    await expect(job.handle(makeJob({ backfillRunId: 'run-1', orgLogin: 'org' }))).rejects.toThrow('API error');
    expect(backfillRunRepository.update).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'failed' }));
  });
});
```

`fetch-prs.job.spec.ts` — key scenarios:
- Upserts PR metadata for each PR returned by Octokit paginate.
- Enqueues one `ENRICH_PR` job per PR where `additions` is null (needs enrichment), skips already-enriched PRs.
- When all PRs are already enriched (zero to enqueue), immediately enqueues `COMPLETE_REPO`.
- On error: sets task status to `failed` and re-throws.

`enrich-pr.job.spec.ts` — key scenarios:
- Calls 3 Octokit endpoints in parallel (assert all 3 are called with correct params).
- Wraps all upserts in a `prisma.$transaction` call.
- Increments `processedPrs` after successful enrichment.
- After the last PR for a task completes (processedPrs + failedPrs === totalPrs), enqueues `COMPLETE_REPO`.
- On error: increments `failedPrs` and re-throws (so pg-boss retries the job).

`complete-repo.job.spec.ts` — key scenarios:
- Sets task status to `completed` and sets `completedAt`.
- Calls `metricRollupService.computeForRepository` with the correct `repositoryId`.
- When all repos are done (completedRepos + failedRepos === totalRepos), sets run status to `completed`.
- When not all repos are done yet, does NOT update the run status.

#### Unit Tests — Repositories

`backfill-run.repository.spec.ts` and `backfill-task.repository.spec.ts` test against a real PostgreSQL instance using a test database (not mocks). Use `beforeEach` to truncate relevant tables and seed minimal required foreign-key data:

```typescript
// Pattern for repository unit tests
describe('BackfillRunRepository (integration)', () => {
  let repo: BackfillRunRepository;
  let prisma: PrismaService;

  beforeAll(async () => {
    // spin up NestJS testing module with real PrismaService pointed at test DB
  });

  beforeEach(async () => {
    await prisma.backfillRun.deleteMany();
    await prisma.organization.deleteMany();
    // seed one org for FK constraints
    await prisma.organization.create({ data: { id: 'org-1', login: 'test-org', ... } });
  });

  it('incrementCompleted returns updated run', async () => {
    const run = await repo.create({ organizationId: 'org-1', totalRepos: 3, completedRepos: 2 });
    const updated = await repo.incrementCompleted(run.id);
    expect(updated.completedRepos).toBe(3);
  });
});
```

#### Integration Test — Full Job Chain

`backfill-chain.e2e-spec.ts` tests the complete 4-step flow against a real PostgreSQL + a real (test) pg-boss instance, with Octokit calls intercepted via `nock`:

```typescript
// apps/api/test/backfill-chain.e2e-spec.ts
import nock from 'nock';

describe('Backfill Job Chain (e2e)', () => {
  beforeEach(() => {
    // Intercept GitHub API calls with nock
    nock('https://api.github.com')
      .get('/orgs/test-org/repos')
      .reply(200, [{ id: 1, name: 'my-repo', full_name: 'test-org/my-repo' }]);

    nock('https://api.github.com')
      .get('/repos/test-org/my-repo/pulls')
      .query(true)
      .reply(200, [{ number: 42, title: 'Fix bug', state: 'closed', merged_at: '2026-01-15T10:00:00Z' }]);

    nock('https://api.github.com')
      .get('/repos/test-org/my-repo/pulls/42')
      .reply(200, { number: 42, additions: 10, deletions: 3, changed_files: 2 });

    nock('https://api.github.com')
      .get('/repos/test-org/my-repo/pulls/42/reviews')
      .reply(200, []);

    nock('https://api.github.com')
      .get('/repos/test-org/my-repo/pulls/42/commits')
      .reply(200, []);
  });

  it('full chain: trigger backfill -> all 4 steps run -> PR enriched in DB', async () => {
    const { backfillRunId } = await backfillService.triggerBackfill('org-uuid');

    // Wait for pg-boss jobs to process (poll with timeout)
    await waitForCondition(
      () => prisma.backfillRun.findUnique({ where: { id: backfillRunId } }),
      (run) => run?.status === 'completed',
      { timeoutMs: 15_000, intervalMs: 500 },
    );

    const run = await prisma.backfillRun.findUniqueOrThrow({ where: { id: backfillRunId } });
    expect(run.status).toBe('completed');
    expect(run.completedRepos).toBe(1);

    const pr = await prisma.pullRequest.findFirst({ where: { number: 42 } });
    expect(pr).not.toBeNull();
    expect(pr!.additions).toBe(10);
    expect(pr!.deletions).toBe(3);
  });

  it('re-running backfill skips already-enriched PRs (idempotent)', async () => {
    // Seed a PR that already has additions set (already enriched)
    await prisma.pullRequest.create({ data: { number: 42, additions: 10, ... } });

    await backfillService.triggerBackfill('org-uuid');
    // wait for chain to complete ...

    // The enrich-pr endpoint should NOT have been called (nock would throw if called unexpectedly)
    expect(nock.pendingMocks()).toContain('GET /repos/test-org/my-repo/pulls/42'); // still pending = not called
  });
});
```

---

### Definition of Done

- [ ] pg-boss initialized in the NestJS app, creates its schema tables on startup
- [ ] Backfill tables created: `backfill_runs` and `backfill_tasks` (with enums)
- [ ] `POST /api/v1/organizations/:orgId/backfill` triggers the job chain
- [ ] **Step 1 (Discover):** Fetches repos via Octokit, creates `backfill_run` + one `backfill_task` per repo, enqueues Step 2 for each
- [ ] **Step 2 (Fetch PRs):** Paginates through `GET /repos/{owner}/{repo}/pulls?state=all`, upserts PR metadata, enqueues Step 3 per PR
- [ ] **Step 3 (Enrich PR):** Fetches single PR detail (additions/deletions/changed_files), reviews, and commits via 3 API calls, upserts all
- [ ] **Step 4 (Complete):** Updates `backfill_task.status = completed`, increments `backfill_run.completed_repos`
- [ ] `@octokit/plugin-throttling` handles rate limits automatically
- [ ] Failed jobs retry 3x with exponential backoff (pg-boss config)
- [ ] One repo failing doesn't block other repos
- [ ] Test: triggering backfill on a test org with 1 repo creates the expected data
- [ ] Test: re-running backfill skips already-imported PRs (idempotent)

---

## US-021: Metric Rollup Computation

Compute daily metric rollups after backfill completes for a repo, and on webhook events for real-time data.

**Parallel:** After US-020 (backfill) and US-016 (metrics API).

**Recommended Agents:** `sql-pro`, `backend-developer`

---

### Implementation Details

#### NestJS Module Structure

Create a `MetricsModule` at `apps/api/src/modules/metrics/`:

```
apps/api/src/modules/metrics/
  metrics.module.ts
  metrics.controller.ts
  metrics.service.ts
  metric-rollup.repository.ts   # handles metric_rollups table only
  metric-rollup.service.ts      # computation logic, called by backfill + webhook handler
  /models/
    metric-rollup.model.ts
    metrics-query.model.ts      # query param DTOs
    metrics-response.model.ts   # response DTOs
```

`metric-rollup.service.ts` is the shared computation layer. Both `CompleteRepoJob` (backfill) and the webhook `pull_request` handler call it — this avoids duplicating rollup SQL in two places.

#### Prisma Schema Addition

Add to `apps/api/prisma/schema.prisma`:

```prisma
enum PeriodType {
  day
  week
  month
}

model MetricRollup {
  id             String     @id @default(uuid()) @db.Uuid
  organizationId String     @map("organization_id") @db.Uuid
  repositoryId   String?    @map("repository_id") @db.Uuid
  periodType     PeriodType @map("period_type")
  periodStart    DateTime   @map("period_start") @db.Date
  metricName     String     @map("metric_name")
  value          Decimal    @db.Decimal(12, 4)
  updatedAt      DateTime   @updatedAt @map("updated_at") @db.Timestamptz

  organization   Organization @relation(fields: [organizationId], references: [id])
  repository     Repository?  @relation(fields: [repositoryId], references: [id])

  @@unique([organizationId, repositoryId, periodType, periodStart, metricName])
  @@index([organizationId, periodType, periodStart])
  @@map("metric_rollups")
}
```

The composite unique constraint on `(organizationId, repositoryId, periodType, periodStart, metricName)` is what makes upserts idempotent — re-running rollup computation for the same repo and date range safely overwrites existing values rather than creating duplicates.

#### MetricRollupService — Core Computation

```typescript
// apps/api/src/modules/metrics/metric-rollup.service.ts
@Injectable()
export class MetricRollupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metricRollupRepository: MetricRollupRepository,
  ) {}

  /**
   * Called by CompleteRepoJob after all PRs for a repo are enriched.
   * Computes daily rollups for the repo's full historical date range,
   * then derives weekly and monthly rollups from the daily data.
   */
  async computeForRepository(repositoryId: string): Promise<void> {
    await this.computeDailyRollupsForRepo(repositoryId);
    await this.deriveWeeklyRollupsFromDaily(repositoryId);
    await this.deriveMonthlyRollupsFromDaily(repositoryId);
  }

  /**
   * Called by the webhook handler on pull_request.closed (merged).
   * Upserts only the single day rollup for today's date.
   */
  async upsertTodayRollupForRepo(repositoryId: string, organizationId: string): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await this.computeDailyRollupsForRepo(repositoryId, today, today);
  }

  private async computeDailyRollupsForRepo(
    repositoryId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<void> {
    // Single SQL aggregation over the pull_requests table.
    // Uses prisma.$executeRaw so the DB engine does the grouping, not application code.
    await this.prisma.$executeRaw`
      INSERT INTO metric_rollups (
        id, organization_id, repository_id, period_type, period_start, metric_name, value, updated_at
      )
      SELECT
        gen_random_uuid(),
        r.organization_id,
        pr.repository_id,
        'day'::period_type,
        DATE_TRUNC('day', pr.merged_at)::date AS period_start,
        'prs_merged'              AS metric_name,
        COUNT(*)::numeric         AS value,
        NOW()
      FROM pull_requests pr
      JOIN repositories r ON r.id = pr.repository_id
      WHERE
        pr.repository_id = ${repositoryId}
        AND pr.state = 'merged'
        AND pr.merged_at IS NOT NULL
        ${fromDate ? Prisma.sql`AND pr.merged_at >= ${fromDate}` : Prisma.empty}
        ${toDate   ? Prisma.sql`AND pr.merged_at <= ${toDate}`   : Prisma.empty}
      GROUP BY r.organization_id, pr.repository_id, DATE_TRUNC('day', pr.merged_at)
      ON CONFLICT (organization_id, repository_id, period_type, period_start, metric_name)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }

  private async deriveWeeklyRollupsFromDaily(repositoryId: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO metric_rollups (
        id, organization_id, repository_id, period_type, period_start, metric_name, value, updated_at
      )
      SELECT
        gen_random_uuid(),
        organization_id,
        repository_id,
        'week'::period_type,
        DATE_TRUNC('week', period_start)::date AS period_start,
        metric_name,
        SUM(value)::numeric,
        NOW()
      FROM metric_rollups
      WHERE
        repository_id = ${repositoryId}
        AND period_type = 'day'
      GROUP BY organization_id, repository_id, DATE_TRUNC('week', period_start), metric_name
      ON CONFLICT (organization_id, repository_id, period_type, period_start, metric_name)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }

  private async deriveMonthlyRollupsFromDaily(repositoryId: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO metric_rollups (
        id, organization_id, repository_id, period_type, period_start, metric_name, value, updated_at
      )
      SELECT
        gen_random_uuid(),
        organization_id,
        repository_id,
        'month'::period_type,
        DATE_TRUNC('month', period_start)::date AS period_start,
        metric_name,
        SUM(value)::numeric,
        NOW()
      FROM metric_rollups
      WHERE
        repository_id = ${repositoryId}
        AND period_type = 'day'
      GROUP BY organization_id, repository_id, DATE_TRUNC('month', period_start), metric_name
      ON CONFLICT (organization_id, repository_id, period_type, period_start, metric_name)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }
}
```

All three SQL statements use `INSERT ... ON CONFLICT DO UPDATE` (upsert), so they are safe to re-run at any time without producing duplicates.

Weekly and monthly rollups are derived from the daily rows — they are not re-aggregated from `pull_requests` directly. This keeps the derivation logic in one place: if the daily rows are correct, the weekly/monthly rows will be correct.

#### Metrics API — Rollup-First with Fallback

The `merge-frequency` endpoint from US-016 is updated to prefer rollup data:

```typescript
// apps/api/src/modules/metrics/metrics.service.ts
async getMergeFrequency(orgId: string, query: MetricsQueryDto): Promise<MergeFrequencyResponseDto> {
  const periodType = query.groupBy ?? 'day'; // 'day' | 'week' | 'month'

  // Try rollup table first (fast, pre-computed)
  const rollupRows = await this.metricRollupRepository.findMergeFrequency({
    organizationId: orgId,
    repositoryIds: query.repositories,
    periodType,
    from: query.from,
    to: query.to,
  });

  if (rollupRows.length > 0) {
    return { data: rollupRows.map(toMergeFrequencyPeriod) };
  }

  // Fallback: direct query against pull_requests (used before backfill or rollups exist)
  const directRows = await this.pullRequestRepository.countMergedByPeriod({
    organizationId: orgId,
    repositoryIds: query.repositories,
    periodType,
    from: query.from,
    to: query.to,
  });

  return { data: directRows.map(toMergeFrequencyPeriod) };
}
```

The fallback ensures the API returns data immediately after webhook-based data starts flowing in, even before any backfill has run or rollups have been computed.

#### Webhook Integration — Real-Time Upsert

In the existing `pull_request` webhook handler (US-011), add a call to `MetricRollupService` after a merge event:

```typescript
// apps/api/src/modules/webhooks/handlers/pull-request-webhook.handler.ts
// (existing file, add to the merged case only)

if (event.action === 'closed' && event.pull_request.merged) {
  // ... existing upsert logic for the PR ...

  // Update today's daily rollup immediately (non-blocking — fire and forget)
  this.metricRollupService
    .upsertTodayRollupForRepo(repository.id, organization.id)
    .catch((err) => this.logger.error('Failed to upsert rollup after webhook merge', { err }));
}
```

The rollup update is intentionally non-blocking (fire-and-forget with error logging). A failed rollup update must not cause the webhook handler to return a non-200 response, which would trigger GitHub to retry the webhook unnecessarily.

#### MetricRollupRepository

```typescript
// apps/api/src/modules/metrics/metric-rollup.repository.ts
@Injectable()
export class MetricRollupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMergeFrequency(params: {
    organizationId: string;
    repositoryIds?: string[];
    periodType: PeriodType;
    from?: Date;
    to?: Date;
  }): Promise<Array<{ periodStart: Date; value: number }>> {
    return this.prisma.metricRollup.findMany({
      where: {
        organizationId: params.organizationId,
        repositoryId: params.repositoryIds?.length ? { in: params.repositoryIds } : undefined,
        periodType: params.periodType,
        metricName: 'prs_merged',
        periodStart: {
          gte: params.from,
          lte: params.to,
        },
      },
      select: { periodStart: true, value: true },
      orderBy: { periodStart: 'asc' },
    });
  }

  async upsertRollup(data: UpsertMetricRollupDto): Promise<void> {
    await this.prisma.metricRollup.upsert({
      where: {
        organizationId_repositoryId_periodType_periodStart_metricName: {
          organizationId: data.organizationId,
          repositoryId: data.repositoryId,
          periodType: data.periodType,
          periodStart: data.periodStart,
          metricName: data.metricName,
        },
      },
      update: { value: data.value },
      create: data,
    });
  }
}
```

---

### Testing Details

#### Test File Locations

```
apps/api/src/modules/metrics/
  __tests__/
    metric-rollup.service.spec.ts
    metric-rollup.repository.spec.ts
    metrics.service.spec.ts

apps/api/test/
  metric-rollup-computation.e2e-spec.ts  # seeded DB, verifies rollup SQL output
  webhook-rollup-upsert.e2e-spec.ts      # verifies webhook triggers rollup update
```

#### Unit Tests — MetricRollupService

`metric-rollup.service.spec.ts` tests computation method routing (not the SQL itself — SQL correctness is verified in integration tests):

```typescript
describe('MetricRollupService', () => {
  it('computeForRepository calls daily, weekly, and monthly computation in order', async () => {
    const computeDaily = jest.spyOn(service as any, 'computeDailyRollupsForRepo').mockResolvedValue(undefined);
    const deriveWeekly = jest.spyOn(service as any, 'deriveWeeklyRollupsFromDaily').mockResolvedValue(undefined);
    const deriveMonthly = jest.spyOn(service as any, 'deriveMonthlyRollupsFromDaily').mockResolvedValue(undefined);

    await service.computeForRepository('repo-1');

    expect(computeDaily).toHaveBeenCalledWith('repo-1');
    expect(deriveWeekly).toHaveBeenCalledWith('repo-1');
    expect(deriveMonthly).toHaveBeenCalledWith('repo-1');
  });

  it('upsertTodayRollupForRepo calls computeDailyRollupsForRepo with today as both from and to', async () => {
    const spy = jest.spyOn(service as any, 'computeDailyRollupsForRepo').mockResolvedValue(undefined);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    await service.upsertTodayRollupForRepo('repo-1', 'org-1');

    expect(spy).toHaveBeenCalledWith('repo-1', today, today);
  });
});
```

#### Integration Tests — Rollup SQL Correctness

`metric-rollup-computation.e2e-spec.ts` seeds a real PostgreSQL test database with known PRs and asserts on the rollup output:

```typescript
describe('MetricRollup SQL computation (integration)', () => {
  beforeEach(async () => {
    await prisma.metricRollup.deleteMany();
    await prisma.pullRequest.deleteMany();

    // Seed 10 merged PRs across 5 days: 2 PRs per day
    const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'];
    for (const day of days) {
      await prisma.pullRequest.createMany({
        data: [
          { repositoryId: 'repo-1', number: nextPrNumber++, state: 'merged', mergedAt: new Date(`${day}T10:00:00Z`), ... },
          { repositoryId: 'repo-1', number: nextPrNumber++, state: 'merged', mergedAt: new Date(`${day}T14:00:00Z`), ... },
        ],
      });
    }
  });

  it('creates daily rollup rows: 2 PRs merged per day for 5 days', async () => {
    await metricRollupService.computeForRepository('repo-1');

    const rollups = await prisma.metricRollup.findMany({
      where: { repositoryId: 'repo-1', periodType: 'day', metricName: 'prs_merged' },
      orderBy: { periodStart: 'asc' },
    });

    expect(rollups).toHaveLength(5);
    rollups.forEach((r) => expect(Number(r.value)).toBe(2));
  });

  it('weekly rollup sums daily rows correctly', async () => {
    await metricRollupService.computeForRepository('repo-1');

    const weekly = await prisma.metricRollup.findMany({
      where: { repositoryId: 'repo-1', periodType: 'week', metricName: 'prs_merged' },
    });

    // All 5 days are in the same ISO week (2026-W01), so 1 weekly row with value 10
    expect(weekly).toHaveLength(1);
    expect(Number(weekly[0].value)).toBe(10);
  });

  it('re-running computation overwrites existing rows without creating duplicates', async () => {
    await metricRollupService.computeForRepository('repo-1');
    await metricRollupService.computeForRepository('repo-1'); // run again

    const count = await prisma.metricRollup.count({
      where: { repositoryId: 'repo-1', periodType: 'day' },
    });
    expect(count).toBe(5); // still 5, not 10
  });
});
```

#### Integration Test — Webhook Triggers Rollup Update

`webhook-rollup-upsert.e2e-spec.ts` sends a simulated `pull_request.closed` (merged) webhook event through the full NestJS request stack and asserts the rollup row is updated:

```typescript
describe('Webhook -> Rollup upsert (integration)', () => {
  it("updates today's daily rollup when a PR is merged via webhook", async () => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const payload = buildPullRequestClosedPayload({ merged: true, repoId: 'repo-1' });
    await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/github',
      headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': signPayload(payload) },
      payload,
    });

    // Give the non-blocking rollup update a moment to complete
    await new Promise((r) => setTimeout(r, 200));

    const rollup = await prisma.metricRollup.findFirst({
      where: { repositoryId: 'repo-1', periodType: 'day', periodStart: today, metricName: 'prs_merged' },
    });
    expect(rollup).not.toBeNull();
    expect(Number(rollup!.value)).toBeGreaterThanOrEqual(1);
  });
});
```

#### Unit Test — Metrics API Fallback Behavior

`metrics.service.spec.ts` verifies the rollup-first + fallback logic:

```typescript
describe('MetricsService.getMergeFrequency', () => {
  it('returns rollup data when rollup rows exist', async () => {
    metricRollupRepository.findMergeFrequency.mockResolvedValueOnce([
      { periodStart: new Date('2026-01-01'), value: 5 },
    ]);

    const result = await metricsService.getMergeFrequency('org-1', { groupBy: 'day' });

    expect(result.data).toHaveLength(1);
    expect(pullRequestRepository.countMergedByPeriod).not.toHaveBeenCalled();
  });

  it('falls back to direct query when no rollup rows exist', async () => {
    metricRollupRepository.findMergeFrequency.mockResolvedValueOnce([]);
    pullRequestRepository.countMergedByPeriod.mockResolvedValueOnce([
      { period: '2026-01-01', count: 3 },
    ]);

    const result = await metricsService.getMergeFrequency('org-1', { groupBy: 'day' });

    expect(result.data).toHaveLength(1);
    expect(pullRequestRepository.countMergedByPeriod).toHaveBeenCalled();
  });
});
```

---

### Definition of Done

- [ ] After backfill Step 4 (repo complete): run a SQL aggregation to compute daily `metric_rollups` for that repo's date range
- [ ] `metric_rollups` table stores: `organization_id`, `repository_id`, `period_type` (day/week/month), `period_start`, `metric_name`, `value`
- [ ] For the "PRs Merged" metric: rollup stores the count of merged PRs per day
- [ ] Weekly/monthly rollups derived from daily rollups
- [ ] Metrics API endpoint (`merge-frequency`) reads from rollups when available, falls back to direct query
- [ ] On webhook `pull_request.closed` (merged): upsert into today's daily rollup
- [ ] Test: after backfill of a repo with 10 merged PRs across 5 days, daily rollups exist for those 5 days
- [ ] Test: webhook-triggered merge updates today's rollup immediately
