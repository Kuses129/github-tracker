# Epic 4: Historical Backfill (Week 4-5)

Build the background backfill pipeline so historical data (before GitHub App install) appears in the dashboard.

---

## US-020: pg-boss Setup + Backfill Job Chain

Set up pg-boss and implement the 4-step backfill job chain.

**Parallel:** After US-003 (schema) and US-009 (GitHub App for Octokit auth). Can run in parallel with Epic 3 frontend stories.

**Recommended Agents:** `backend-developer`, `sql-pro`

---

### Implementation Details

#### pg-boss Shared Module

Create a shared `PgBossModule` at `apps/api/src/modules/pg-boss/` as a `@Global()` NestJS module. It wraps the pg-boss instance lifecycle — start on `onModuleInit`, stop on `onModuleDestroy`. Configuration (connection string, retry limit of 3, exponential backoff) comes from `ConfigService`. Register it once in `AppModule` so all feature modules can inject `PgBossService`.

```
apps/api/src/modules/pg-boss/
  pg-boss.module.ts
  pg-boss.service.ts
```

#### Backfill Module

Create a dedicated `BackfillModule` at `apps/api/src/modules/backfill/` following the project's module convention (module → controller → service → repository → `/models/`). It imports `PgBossModule`, `PrismaModule`, and the existing modules it needs (organizations, repositories, pull-requests, commits, pr-reviews, contributors).

```
apps/api/src/modules/backfill/
  backfill.module.ts
  backfill.controller.ts
  backfill.service.ts
  backfill-run.repository.ts
  backfill-task.repository.ts
  jobs/
    discover-repos.job.ts
    fetch-prs.job.ts
    enrich-pr.job.ts
    complete-repo.job.ts
  models/
    backfill-run.model.ts
    backfill-task.model.ts
    backfill-job-payloads.model.ts
```

#### Prisma Schema Additions

Add two new models to `apps/api/prisma/schema.prisma`:

- **`BackfillRun`** — tracks a full backfill execution for one organization. Fields: `organizationId`, `status` (enum: pending/discovering/in_progress/completed/failed/cancelled), `totalRepos`, `completedRepos`, `failedRepos`, `startedAt`, `completedAt`, `errorMessage`. Indexed on `organizationId` and `status`.
- **`BackfillTask`** — tracks backfill progress per repository within a run. Fields: `backfillRunId`, `repositoryId`, `status` (enum: pending/fetching_prs/enriching/completed/failed), `totalPrs`, `processedPrs`, `failedPrs`, `cursor`, `startedAt`, `completedAt`, `errorMessage`. Indexed on `backfillRunId` and `repositoryId`.

Add the corresponding relation fields to the existing `Organization` and `Repository` models.

#### Data Origin Traceability

Add an optional `backfillTaskId` foreign key to the existing `PullRequest`, `Commit`, `PrReview`, and `Repository` models. When a record is created via the backfill pipeline, this FK is set to the originating `BackfillTask`. Records created via webhooks leave this field `null`. This allows tracing any record back to the specific backfill run/task that created it, and makes it easy to query "all data from backfill run X" or "was this record backfilled?"

Add the corresponding `backfillTask` relation on these models and a reverse relation (`pullRequests`, `commits`, etc.) on `BackfillTask`.

#### API Endpoint

`POST /api/v1/organizations/:orgId/backfill` — triggers the backfill job chain. Returns `202 Accepted` with `{ backfillRunId }` immediately; the work runs asynchronously via pg-boss.

#### Backfill Service

On startup (`onModuleInit`), registers workers for all 4 job types with pg-boss. The `triggerBackfill(orgId)` method creates a `BackfillRun` record and enqueues the first job (discover repos).

Define all job names as constants in a typed payloads model file to avoid magic strings. Each job type has a typed payload interface.

#### 4-Step Job Chain

**Step 1 — Discover Repos:** Fetches all repos for the org via the GitHub API (`GET /orgs/{org}/repos`), upserts them into the `repositories` table using the existing `RepositoryRepository`, creates one `BackfillTask` per repo, then enqueues Step 2 for each. Updates run status to `in_progress`.

**Step 2 — Fetch PRs:** Paginates through `GET /repos/{owner}/{repo}/pulls?state=all` for a single repo, upserts PR metadata using the existing `PullRequestRepository`, setting `backfillTaskId` on each upserted record. Only enqueues Step 3 (enrich) for PRs that haven't been enriched yet (i.e., `additions` is null). If all PRs are already enriched, skips to Step 4.

**Step 3 — Enrich PR:** Fetches detailed data for a single PR via 3 parallel API calls (PR detail, reviews, commits). Wraps all upserts in a Prisma transaction, setting `backfillTaskId` on created reviews and commits. After processing, atomically increments the task's processed count. When all PRs for a task are done, enqueues Step 4. Runs with `teamSize: 5` for concurrency.

**Step 4 — Complete Repo:** Marks the `BackfillTask` as completed. Triggers metric rollup computation for the repo (US-021). Atomically increments the run's completed count. When all repos are done, marks the `BackfillRun` as completed.

#### Rate Limit Handling

Use `@octokit/plugin-throttling` in the existing GitHub/Octokit service (or create one if not yet present). The throttling plugin automatically handles 403/429 responses with backoff — no custom rate limit code needed in the job handlers.

#### Error Handling

- Each job catches errors, updates the relevant run/task status to `failed` with the error message, then re-throws so pg-boss retries (up to 3x with exponential backoff).
- One repo failing does not block other repos — each repo's job chain is independent.

#### Repository Layer

Each repository class handles exactly one Prisma model, following project conventions:

- `BackfillRunRepository` — CRUD + `incrementCompleted(id)` using atomic `UPDATE ... RETURNING`
- `BackfillTaskRepository` — CRUD + `createMany`, `incrementProcessed(id)`, `incrementFailed(id, errorMessage)`

---

### Definition of Done

- [ ] pg-boss initialized in the NestJS app, creates its schema tables on startup
- [ ] Backfill tables created: `backfill_runs` and `backfill_tasks` (with enums)
- [ ] `POST /api/v1/organizations/:orgId/backfill` triggers the job chain
- [ ] **Step 1 (Discover):** Fetches repos via GitHub API, creates `backfill_run` + one `backfill_task` per repo, enqueues Step 2 for each
- [ ] **Step 2 (Fetch PRs):** Paginates through all PRs, upserts PR metadata, enqueues Step 3 per un-enriched PR
- [ ] **Step 3 (Enrich PR):** Fetches single PR detail (additions/deletions/changed_files), reviews, and commits via 3 parallel API calls, upserts all in a transaction
- [ ] **Step 4 (Complete):** Updates `backfill_task.status = completed`, increments `backfill_run.completed_repos`
- [ ] `@octokit/plugin-throttling` handles rate limits automatically
- [ ] Failed jobs retry 3x with exponential backoff (pg-boss config)
- [ ] One repo failing doesn't block other repos
- [ ] Backfilled records (PRs, commits, reviews) have `backfillTaskId` set; webhook-created records have it `null`
- [ ] Test: triggering backfill on a test org with 1 repo creates the expected data with `backfillTaskId` set
- [ ] Test: re-running backfill skips already-imported PRs (idempotent)

---

## US-021: Metric Rollup Computation

Compute daily metric rollups after backfill completes for a repo, and on webhook events for real-time data.

**Parallel:** After US-020 (backfill) and US-016 (metrics API).

**Recommended Agents:** `sql-pro`, `backend-developer`

---

### Implementation Details

#### Extending the Existing Metrics Module

Add rollup computation to the existing `apps/api/src/modules/metrics/` module. New files to add:

```
apps/api/src/modules/metrics/
  ... (existing files)
  metric-rollup.repository.ts
  metric-rollup.service.ts
  models/
    metric-rollup.model.ts
```

#### Prisma Schema Addition

Add a `MetricRollup` model to `apps/api/prisma/schema.prisma`:

- Fields: `organizationId`, `repositoryId` (nullable), `periodType` (enum: day/week/month), `periodStart` (date), `metricName` (string), `value` (decimal), `updatedAt`.
- Composite unique constraint on `(organizationId, repositoryId, periodType, periodStart, metricName)` — makes upserts idempotent.
- Indexed on `(organizationId, periodType, periodStart)`.
- Relations to `Organization` and `Repository`.

#### MetricRollupService — Core Computation

This service is the shared computation layer called from both the backfill pipeline and the webhook handlers.

**`computeForRepository(repositoryId)`** — Called by `CompleteRepoJob` (Step 4 of backfill). Computes daily rollups for the repo's full historical date range using a raw SQL `INSERT ... ON CONFLICT DO UPDATE` aggregation against the `pull_requests` table. Then derives weekly and monthly rollups by summing daily rows. All operations are idempotent via upsert.

**`upsertTodayRollupForRepo(repositoryId, organizationId)`** — Called by the webhook handler on `pull_request.closed` (merged). Upserts only the single daily rollup for today's date.

Weekly and monthly rollups are derived from daily rows (not re-aggregated from `pull_requests`), keeping the derivation logic in one place.

#### Metrics API — Rollup-First with Fallback

Update the existing `MetricsService.getMergeFrequency()` to:

1. Query the `metric_rollups` table first (fast, pre-computed data)
2. Fall back to a direct query against `pull_requests` when no rollup rows exist (for orgs that haven't been backfilled yet)

This ensures the API returns data immediately after webhook-based data starts flowing in, even before any backfill or rollups exist.

#### Webhook Integration — Real-Time Upsert

In the existing `pull-request.handler.ts` webhook handler, add a non-blocking (fire-and-forget) call to `MetricRollupService.upsertTodayRollupForRepo()` when a PR is merged. A failed rollup must not cause the webhook handler to return a non-200 response.

#### MetricRollupRepository

Handles CRUD for the `metric_rollups` table:

- `findMergeFrequency(params)` — query rollups by org, repos, period type, and date range
- `upsertRollup(data)` — single-row upsert using Prisma's compound unique

---

### Definition of Done

- [ ] `metric_rollups` table created with composite unique constraint
- [ ] After backfill Step 4 (repo complete): daily `metric_rollups` computed for that repo's full date range
- [ ] For the "PRs Merged" metric: rollup stores the count of merged PRs per day
- [ ] Weekly/monthly rollups derived from daily rollups
- [ ] Metrics API endpoint (`merge-frequency`) reads from rollups when available, falls back to direct query
- [ ] On webhook `pull_request.closed` (merged): upsert into today's daily rollup (non-blocking)
- [ ] Re-running rollup computation overwrites existing rows without creating duplicates
- [ ] Test: after backfill of a repo with known merged PRs, daily rollups exist for the correct days
- [ ] Test: webhook-triggered merge updates today's rollup immediately
