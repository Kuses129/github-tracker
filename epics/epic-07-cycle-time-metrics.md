# Epic 7: Cycle Time Metrics (Weeks 7-8)

Adds cycle time breakdown metrics end-to-end: a new REST endpoint returning percentile aggregates, a dashboard with KPI card and two chart types, and enriched PR detail views with a visual lifecycle timeline.

---

## US-026: REST API — Cycle Time Metrics

Add cycle time breakdown metrics to the API.

**Parallel:** Can run in parallel with US-027.

**Recommended Agents:** `api-designer`, `sql-pro`, `backend-developer`

### Implementation Details

**Module location:** `apps/api/src/modules/metrics/`

Following the established module structure:
- `metrics.module.ts` — declares controller, service, repository
- `metrics.controller.ts` — route handler, query param parsing, response mapping
- `metrics.service.ts` — orchestrates repository calls, handles period splitting for delta
- `metrics.repository.ts` — raw SQL queries via `prisma.$queryRaw`
- `models/cycle-time.models.ts` — all request/response types for this feature

**Query param parsing (controller):**

Parse and validate incoming filter params using a shared `CycleTimeQueryDto`:

```typescript
// apps/api/src/modules/metrics/models/cycle-time.models.ts

export type GroupBy = 'day' | 'week' | 'month';

export interface CycleTimeQueryDto {
  from: string;       // ISO date string
  to: string;
  groupBy: GroupBy;
  repositories?: string;   // comma-separated UUIDs
  contributors?: string;   // comma-separated UUIDs
}

export interface CycleTimePhaseStats {
  avg: number;    // seconds
  p50: number;
  p75: number;
  p90: number;
}

export interface CycleTimePeriod {
  period: string;             // e.g. "2026-02-01"
  pr_count: number;
  coding_time: CycleTimePhaseStats;
  pickup_time: CycleTimePhaseStats;
  review_time: CycleTimePhaseStats;
  deploy_time: CycleTimePhaseStats;
  total_cycle_time: CycleTimePhaseStats;
}

export interface CycleTimeResponse {
  data: CycleTimePeriod[];
}
```

**Core SQL query (repository):**

Cycle times are derived at query time using `EXTRACT(EPOCH FROM ...)` to get durations in seconds. `PERCENTILE_CONT` is a PostgreSQL ordered-set aggregate that requires a raw query — it cannot be expressed with the Prisma fluent API.

```sql
-- apps/api/src/modules/metrics/metrics.repository.ts (raw SQL fragment)

SELECT
  date_trunc($groupBy, pr.merged_at)                           AS period,
  COUNT(*)::int                                                AS pr_count,

  -- Coding time: first_commit_at -> github_created_at
  AVG(
    EXTRACT(EPOCH FROM (pr.github_created_at - pr.first_commit_at))
  ) FILTER (WHERE pr.first_commit_at IS NOT NULL)              AS coding_time_avg,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.github_created_at - pr.first_commit_at))
  ) FILTER (WHERE pr.first_commit_at IS NOT NULL)              AS coding_time_p50,
  PERCENTILE_CONT(0.75) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.github_created_at - pr.first_commit_at))
  ) FILTER (WHERE pr.first_commit_at IS NOT NULL)              AS coding_time_p75,
  PERCENTILE_CONT(0.9) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.github_created_at - pr.first_commit_at))
  ) FILTER (WHERE pr.first_commit_at IS NOT NULL)              AS coding_time_p90,

  -- Pickup time: github_created_at -> first_review_at
  AVG(
    EXTRACT(EPOCH FROM (pr.first_review_at - pr.github_created_at))
  ) FILTER (WHERE pr.first_review_at IS NOT NULL)              AS pickup_time_avg,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.first_review_at - pr.github_created_at))
  ) FILTER (WHERE pr.first_review_at IS NOT NULL)              AS pickup_time_p50,
  PERCENTILE_CONT(0.75) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.first_review_at - pr.github_created_at))
  ) FILTER (WHERE pr.first_review_at IS NOT NULL)              AS pickup_time_p75,
  PERCENTILE_CONT(0.9) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.first_review_at - pr.github_created_at))
  ) FILTER (WHERE pr.first_review_at IS NOT NULL)              AS pickup_time_p90,

  -- Review time: first_review_at -> approved_at
  AVG(
    EXTRACT(EPOCH FROM (pr.approved_at - pr.first_review_at))
  ) FILTER (WHERE pr.first_review_at IS NOT NULL AND pr.approved_at IS NOT NULL) AS review_time_avg,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.approved_at - pr.first_review_at))
  ) FILTER (WHERE pr.first_review_at IS NOT NULL AND pr.approved_at IS NOT NULL) AS review_time_p50,
  PERCENTILE_CONT(0.75) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.approved_at - pr.first_review_at))
  ) FILTER (WHERE pr.first_review_at IS NOT NULL AND pr.approved_at IS NOT NULL) AS review_time_p75,
  PERCENTILE_CONT(0.9) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.approved_at - pr.first_review_at))
  ) FILTER (WHERE pr.first_review_at IS NOT NULL AND pr.approved_at IS NOT NULL) AS review_time_p90,

  -- Deploy time: approved_at -> merged_at
  AVG(
    EXTRACT(EPOCH FROM (pr.merged_at - pr.approved_at))
  ) FILTER (WHERE pr.approved_at IS NOT NULL)                  AS deploy_time_avg,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.merged_at - pr.approved_at))
  ) FILTER (WHERE pr.approved_at IS NOT NULL)                  AS deploy_time_p50,
  PERCENTILE_CONT(0.75) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.merged_at - pr.approved_at))
  ) FILTER (WHERE pr.approved_at IS NOT NULL)                  AS deploy_time_p75,
  PERCENTILE_CONT(0.9) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pr.merged_at - pr.approved_at))
  ) FILTER (WHERE pr.approved_at IS NOT NULL)                  AS deploy_time_p90

FROM pull_requests pr
JOIN repositories r ON r.id = pr.repository_id
WHERE
  r.organization_id = $orgId::uuid
  AND pr.state = 'merged'
  AND pr.merged_at BETWEEN $from::timestamptz AND $to::timestamptz
  -- optional: AND pr.repository_id = ANY($repositoryIds::uuid[])
  -- optional: AND pr.author_id    = ANY($contributorIds::uuid[])
GROUP BY date_trunc($groupBy, pr.merged_at)
ORDER BY period ASC
```

Parameterised via `Prisma.sql` tagged template to prevent SQL injection. Repository IDs and contributor IDs are passed as PostgreSQL array literals when provided.

**Rollup aggregation (upsert after backfill and on webhook merge):**

The `metric_rollups` table stores pre-aggregated daily values. After a repo backfill completes (Step 4 of the job chain) and on each real-time merge webhook, the service calls a rollup upsert that writes `coding_time_avg`, `pickup_time_avg`, `review_time_avg`, `deploy_time_avg`, and `total_cycle_time_avg` for `period_type = 'day'`. Weekly and monthly rollups derive from daily on read (or via a separate nightly job in Phase 3).

```sql
-- Rollup upsert (runs per day bucket after backfill or on webhook)
INSERT INTO metric_rollups (
  organization_id, repository_id, period_type, period_start,
  metric_name, value
)
SELECT
  r.organization_id,
  pr.repository_id,
  'day',
  date_trunc('day', pr.merged_at),
  'cycle_time_coding_avg',
  AVG(EXTRACT(EPOCH FROM (pr.github_created_at - pr.first_commit_at)))
    FILTER (WHERE pr.first_commit_at IS NOT NULL)
FROM pull_requests pr
JOIN repositories r ON r.id = pr.repository_id
WHERE pr.repository_id = $repoId::uuid
  AND pr.state = 'merged'
  AND pr.merged_at::date = $day::date
GROUP BY r.organization_id, pr.repository_id, date_trunc('day', pr.merged_at)
ON CONFLICT (organization_id, repository_id, period_type, period_start, metric_name)
DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

One `INSERT ... ON CONFLICT` statement per metric name (`cycle_time_coding_avg`, `cycle_time_pickup_avg`, `cycle_time_review_avg`, `cycle_time_deploy_avg`, `cycle_time_total_avg`).

**Service method signatures:**

```typescript
// apps/api/src/modules/metrics/metrics.service.ts

getCycleTimeMetrics(
  orgId: string,
  query: CycleTimeQueryDto
): Promise<CycleTimeResponse>

upsertCycleTimeRollup(
  repositoryId: string,
  day: Date
): Promise<void>
```

**Controller endpoint:**

```typescript
// GET /api/v1/organizations/:orgId/metrics/cycle-time
@Get(':orgId/metrics/cycle-time')
async getCycleTime(
  @Param('orgId') orgId: string,
  @Query() query: CycleTimeQueryDto,
): Promise<CycleTimeResponse>
```

### Testing Details

**Test file:** `apps/api/src/modules/metrics/metrics.controller.spec.ts`
**Repository test:** `apps/api/src/modules/metrics/metrics.repository.spec.ts`

**Seed fixture — known timestamps for deterministic assertions:**

Create a seed helper used across all cycle time tests:

```typescript
// apps/api/test/fixtures/cycle-time.fixtures.ts

// PR A: all phases present, merged 2026-01-15
// Coding:  2 hours  (first_commit_at = 2026-01-15T08:00Z, github_created_at = 2026-01-15T10:00Z)
// Pickup:  4 hours  (first_review_at = 2026-01-15T14:00Z)
// Review:  3 hours  (approved_at    = 2026-01-15T17:00Z)
// Deploy:  1 hour   (merged_at      = 2026-01-15T18:00Z)
// Total:  10 hours  = 36000 seconds

export const PR_A = {
  first_commit_at:   new Date('2026-01-15T08:00:00Z'),
  github_created_at: new Date('2026-01-15T10:00:00Z'),
  first_review_at:   new Date('2026-01-15T14:00:00Z'),
  approved_at:       new Date('2026-01-15T17:00:00Z'),
  merged_at:         new Date('2026-01-15T18:00:00Z'),
};

// PR B: no first_commit_at (coding_time is null), merged same day
// Pickup:  1 hour
// Review:  2 hours
// Deploy:  30 min
export const PR_B = {
  first_commit_at:   null,
  github_created_at: new Date('2026-01-15T09:00:00Z'),
  first_review_at:   new Date('2026-01-15T10:00:00Z'),
  approved_at:       new Date('2026-01-15T12:00:00Z'),
  merged_at:         new Date('2026-01-15T12:30:00Z'),
};

// PR C: no approved_at (review_time and deploy_time are null), merged 2026-01-16
export const PR_C = {
  first_commit_at:   new Date('2026-01-16T06:00:00Z'),
  github_created_at: new Date('2026-01-16T08:00:00Z'),
  first_review_at:   new Date('2026-01-16T09:00:00Z'),
  approved_at:       null,
  merged_at:         new Date('2026-01-16T11:00:00Z'),
};
```

**Test scenarios:**

1. **Returns correct averages for a day with two PRs having all timestamps:**
   - Seed PR_A and PR_B (PR_B has `first_commit_at = null`)
   - Call `GET /metrics/cycle-time?from=2026-01-15&to=2026-01-15&groupBy=day`
   - Assert `data[0].coding_time.avg` equals `7200` (only PR_A contributes)
   - Assert `data[0].pickup_time.avg` equals `(14400 + 3600) / 2 = 9000`
   - Assert `data[0].pr_count` equals `2`

2. **Returns null-safe results when phases are missing:**
   - Seed PR_C (no `approved_at`)
   - Assert `data[0].review_time` fields are `null` (or absent) — not zero
   - Assert `data[0].deploy_time` fields are `null`

3. **Percentile correctness with three PRs of known durations:**
   - Seed three PRs on the same day with pickup times of 3600s, 7200s, 14400s
   - Assert `pickup_time.p50` is `7200`, `p75` is `10800`, `p90` is `13320` (±1s for floating point)

4. **Repository filter narrows to correct subset:**
   - Seed PRs across two repositories
   - Call with `?repositories=<repoAId>`
   - Assert only PRs from repo A are included

5. **Contributor filter narrows correctly:**
   - Seed PRs by two contributors
   - Call with `?contributors=<contributorId>`
   - Assert returned `pr_count` matches only that contributor's PRs

6. **groupBy=week aggregates across days:**
   - Seed PR_A (Jan 15) and PR_C (Jan 16), both in the same ISO week
   - Call with `?groupBy=week`
   - Assert single period returned with `pr_count = 2`

7. **Empty range returns empty array, not error:**
   - Call with a date range containing no merged PRs
   - Assert `{ data: [] }` with HTTP 200

8. **Rollup upsert writes correct row to metric_rollups:**
   - Seed PR_A
   - Call `upsertCycleTimeRollup(repoId, new Date('2026-01-15'))`
   - Query `metric_rollups` directly
   - Assert `metric_name = 'cycle_time_coding_avg'` and `value ≈ 7200`

---

### Definition of Done

- [ ] `GET /api/v1/organizations/:orgId/metrics/cycle-time` returns average coding_time, pickup_time, review_time, deploy_time
- [ ] Supports `?from=`, `?to=`, `?groupBy=`, `?repositories=`, `?contributors=`
- [ ] Cycle times calculated from PR lifecycle timestamps at query time
- [ ] Returns percentiles (p50, p75, p90) in addition to averages
- [ ] Daily rollups include cycle time aggregates
- [ ] Test: with seeded PRs having known timestamps, returns correct cycle time values

---

## US-027: Cycle Time Dashboard

Add cycle time visualization to the dashboard.

**Parallel:** After US-026 API is available. Can start with mock data.

**Recommended Agents:** `react-specialist`, `ui-designer`

### Implementation Details

**New files:**

```
apps/web/src/api/metrics/
  cycle-time.api.ts          # fetch function calling GET /metrics/cycle-time
  cycle-time.types.ts        # CycleTimeQueryParams, CycleTimePeriod, CycleTimeResponse

apps/web/src/hooks/
  useCycleTimeMetrics.ts     # TanStack Query hook

apps/web/src/components/metrics/
  CycleTimeKpiCard.tsx       # KPI card with avg total cycle time + delta
  CycleTimeBreakdownChart.tsx  # Stacked horizontal Nivo bar
  CycleTimeTrendChart.tsx      # Nivo line chart over time
```

**Types (kept separate from logic per project guidelines):**

```typescript
// apps/web/src/api/metrics/cycle-time.types.ts

export interface CycleTimePhaseStats {
  avg: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
}

export interface CycleTimePeriod {
  period: string;
  pr_count: number;
  coding_time: CycleTimePhaseStats;
  pickup_time: CycleTimePhaseStats;
  review_time: CycleTimePhaseStats;
  deploy_time: CycleTimePhaseStats;
  total_cycle_time: CycleTimePhaseStats;
}

export interface CycleTimeResponse {
  data: CycleTimePeriod[];
}

export interface CycleTimeQueryParams {
  orgId: string;
  from: string;
  to: string;
  groupBy: 'day' | 'week' | 'month';
  repositories?: string[];
  contributors?: string[];
}
```

**API fetch function:**

```typescript
// apps/web/src/api/metrics/cycle-time.api.ts

export async function fetchCycleTimeMetrics(
  params: CycleTimeQueryParams,
): Promise<CycleTimeResponse> {
  const { orgId, repositories, contributors, ...rest } = params;
  const searchParams = new URLSearchParams(rest as Record<string, string>);
  if (repositories?.length) searchParams.set('repositories', repositories.join(','));
  if (contributors?.length) searchParams.set('contributors', contributors.join(','));
  const res = await apiClient.get(
    `/organizations/${orgId}/metrics/cycle-time?${searchParams}`
  );
  return res.json<CycleTimeResponse>();
}
```

**TanStack Query hook (reuses existing filter store):**

```typescript
// apps/web/src/hooks/useCycleTimeMetrics.ts

export function useCycleTimeMetrics() {
  const { orgId, dateRange, selectedRepositories, groupBy } = useFilterStore();
  return useQuery({
    queryKey: ['cycle-time', orgId, dateRange, selectedRepositories, groupBy],
    queryFn: () =>
      fetchCycleTimeMetrics({
        orgId,
        from: dateRange.from,
        to: dateRange.to,
        groupBy,
        repositories: selectedRepositories,
      }),
    enabled: Boolean(orgId && dateRange.from && dateRange.to),
    staleTime: 5 * 60 * 1000,
  });
}
```

**KPI card — reuse existing KPI card component, pass computed values:**

The existing `KpiCard` component from Phase 1 accepts `label`, `value`, `delta`, and `deltaLabel` props. `CycleTimeKpiCard` is a thin wrapper that derives the overall average from the query data and computes the delta vs previous period by issuing a second query for the prior period window.

```typescript
// apps/web/src/components/metrics/CycleTimeKpiCard.tsx

// Derives totalAvg by summing weighted averages across all periods
// Formats seconds into "Xd Yh Zm" for display
// Passes delta as percentage string to base KpiCard
```

**Stacked horizontal bar chart:**

Uses `@nivo/bar` in horizontal mode. Each bar represents one period; segments are `coding_time.avg`, `pickup_time.avg`, `review_time.avg`, `deploy_time.avg`. Null values for a segment are replaced with `0` and the segment is hidden via `color: transparent` to avoid misleading proportions.

```typescript
// apps/web/src/components/metrics/CycleTimeBreakdownChart.tsx

const PHASE_KEYS = ['coding_time', 'pickup_time', 'review_time', 'deploy_time'] as const;
const PHASE_COLORS = {
  coding_time: '#6366f1',   // indigo
  pickup_time: '#f59e0b',   // amber
  review_time: '#10b981',   // emerald
  deploy_time: '#ef4444',   // red
};

// Transform CycleTimePeriod[] into Nivo BarDatum[]
// Each datum: { period, coding_time: avg|0, pickup_time: avg|0, ... }
// layout="horizontal", indexBy="period", keys=PHASE_KEYS
// Custom tooltip: shows phase name + formatted duration for hovered segment
```

**Trend line chart:**

Uses `@nivo/line`. One series per phase showing `avg` values over time. A second series for `p90` can be toggled via a legend click (implemented via `hiddenIds` state in the parent component).

```typescript
// apps/web/src/components/metrics/CycleTimeTrendChart.tsx

// Transforms data into Nivo LineSerie[] — one serie per phase
// xScale: time, yScale: linear (seconds), yFormat: formatDuration
// Custom tooltip: renders a small table with all four phase values for that period
// enablePoints: false for dense data, true for sparse (>= groupBy=week)
```

**Dashboard page integration:**

Add `CycleTimeKpiCard`, `CycleTimeBreakdownChart`, and `CycleTimeTrendChart` to `apps/web/src/pages/dashboard/DashboardPage.tsx`. The three components share the same `useCycleTimeMetrics()` hook call at the page level — the hook result is passed down as props so there is only one network request.

**Mock data for parallel development:**

While the API is being built, `useCycleTimeMetrics` can be replaced with a mock hook that returns static `CycleTimeResponse` data matching the production shape. The mock is a separate file (`useCycleTimeMetrics.mock.ts`) and swapped via a module alias in Vite config during development.

### Testing Details

**Test files:**
- `apps/web/src/components/metrics/CycleTimeKpiCard.test.tsx`
- `apps/web/src/components/metrics/CycleTimeBreakdownChart.test.tsx`
- `apps/web/src/components/metrics/CycleTimeTrendChart.test.tsx`
- `apps/web/src/hooks/useCycleTimeMetrics.test.ts`

**Test tooling:** Vitest + React Testing Library + MSW for API mocking.

**Component test scenarios:**

1. **KPI card renders total cycle time formatted correctly:**
   - Provide mock data with `total_cycle_time.avg = 36000` (10 hours)
   - Assert text "10h 0m" (or equivalent `formatDuration` output) is present in the DOM

2. **KPI card shows positive delta with up indicator:**
   - Current period avg: 36000s, previous period avg: 30000s (+20%)
   - Assert delta chip displays "+20%" with upward icon

3. **KPI card shows negative delta with down indicator:**
   - Current period avg: 28000s, previous period avg: 36000s
   - Assert delta chip displays "-22%" with downward icon

4. **Breakdown chart renders four colored segments per period:**
   - Provide two periods of mock data
   - Assert the Nivo bar SVG contains elements with the four phase colors

5. **Breakdown chart tooltip shows phase label and formatted duration:**
   - Simulate hover over a bar segment
   - Assert tooltip text includes "Pickup Time" and a formatted duration string

6. **Trend chart renders one line per phase:**
   - Provide mock data with all four phases populated
   - Assert four `<path>` elements are rendered in the SVG (one per Nivo line serie)

7. **Charts show empty state when data array is empty:**
   - Pass `data = []` to each chart component
   - Assert a human-readable empty state message is rendered instead of the SVG

8. **Hook passes filter store values into query key:**
   - Set filter store state to specific `from`, `to`, `orgId`
   - Assert `fetchCycleTimeMetrics` is called with matching params (via MSW handler assertion)

9. **Hook is disabled when orgId is absent:**
   - Render hook with `orgId = undefined` in filter store
   - Assert no network request is made

---

### Definition of Done

- [ ] New KPI card: "Avg Cycle Time" with delta vs previous period
- [ ] Cycle time breakdown chart: stacked horizontal bar showing coding / pickup / review / deploy time proportions
- [ ] Cycle time trend line chart over selected date range
- [ ] Tooltip on chart shows exact values per period
- [ ] Responds to global filters

---

## US-028: PR Detail — Cycle Time Breakdown

Add cycle time breakdown to the individual PR detail view.

**Parallel:** After US-026.

**Recommended Agents:** `react-specialist`, `backend-developer`

### Implementation Details

**Backend — enriching the existing PR detail endpoint:**

The existing `GET /api/v1/pull-requests/:prId` endpoint lives in `apps/api/src/modules/pull-requests/`. The response DTO is extended (not changed) to include a `cycle_time` field that is computed in the service layer from the PR's lifecycle timestamps already present on the row.

```typescript
// apps/api/src/modules/pull-requests/models/pull-request.models.ts

export interface CycleTimeBreakdown {
  coding_time_seconds:  number | null;   // github_created_at - first_commit_at
  pickup_time_seconds:  number | null;   // first_review_at   - github_created_at
  review_time_seconds:  number | null;   // approved_at       - first_review_at
  deploy_time_seconds:  number | null;   // merged_at         - approved_at
  total_seconds:        number | null;   // sum of non-null phases
}

export interface PullRequestDetailResponse {
  // ... existing fields ...
  cycle_time: CycleTimeBreakdown;
}
```

The computation is a pure function in the service — no extra DB query needed because all timestamps are on the PR row:

```typescript
// apps/api/src/modules/pull-requests/pull-requests.service.ts

function computeCycleTimeBreakdown(pr: PullRequest): CycleTimeBreakdown {
  const coding  = diffSeconds(pr.first_commit_at, pr.github_created_at);
  const pickup  = diffSeconds(pr.github_created_at, pr.first_review_at);
  const review  = diffSeconds(pr.first_review_at, pr.approved_at);
  const deploy  = diffSeconds(pr.approved_at, pr.merged_at);
  const phases  = [coding, pickup, review, deploy].filter((v): v is number => v !== null);
  return {
    coding_time_seconds: coding,
    pickup_time_seconds: pickup,
    review_time_seconds: review,
    deploy_time_seconds: deploy,
    total_seconds: phases.length ? phases.reduce((a, b) => a + b, 0) : null,
  };
}

function diffSeconds(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 1000);
}
```

**PR list page — new "Cycle Time" column:**

The existing `PullRequestsPage` uses MUI X DataGrid. Add a `cycle_time` column that:
- Displays `total_seconds` formatted as `Xd Yh Zm` using the shared `formatDuration` utility
- Renders `—` when `total_seconds` is `null` (lifecycle incomplete)
- Is sortable (DataGrid sorts on the numeric raw value passed via `valueGetter`)

The column definition is added to the existing columns array in `apps/web/src/pages/pull-requests/PullRequestsPage.tsx`. The `cycle_time.total_seconds` field must be included in the PR list API response, which means the list endpoint (`GET /repositories/:repoId/pull-requests`) also needs to return the computed breakdown. This is done by applying the same `computeCycleTimeBreakdown` function in the list service method (no extra query).

**PR detail drawer — breakdown section + timeline:**

Two new components are added:

```
apps/web/src/components/pull-requests/
  CycleTimeBreakdownPanel.tsx    # Four phase rows with duration + proportion bar
  PrLifecycleTimeline.tsx        # Vertical stepper showing lifecycle events
```

`CycleTimeBreakdownPanel` renders four horizontal rows (Coding, Pickup, Review, Deploy). Each row shows:
- Phase label
- Duration formatted (`Xd Yh Zm`)
- A thin proportional fill bar scaled to the total cycle time

`PrLifecycleTimeline` renders a vertical stepper (MUI `Stepper` with `orientation="vertical"`) with one step per lifecycle event:

| Step | Label | Timestamp field |
|------|-------|----------------|
| 1 | First Commit | `first_commit_at` |
| 2 | PR Opened | `github_created_at` |
| 3 | First Review | `first_review_at` |
| 4 | Approved | `approved_at` |
| 5 | Merged | `merged_at` |

Steps with a `null` timestamp render as incomplete (MUI `StepIcon` in default state). Steps with a timestamp render as complete with the absolute date + relative time ("3 days ago"). The gap label between steps (e.g., "2h 14m") is shown as a secondary annotation using MUI `StepContent`.

Both components receive the `PullRequestDetailResponse` as a prop and extract what they need — no separate data-fetching hooks required.

**Shared `formatDuration` utility:**

```typescript
// apps/web/src/lib/format-duration.ts

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}
```

This utility is reused by `CycleTimeKpiCard`, `CycleTimeBreakdownPanel`, `CycleTimeTrendChart`, and the DataGrid column formatter — consistent with the DRY principle.

### Testing Details

**Test files:**
- `apps/api/src/modules/pull-requests/pull-requests.service.spec.ts` (unit test for `computeCycleTimeBreakdown`)
- `apps/api/src/modules/pull-requests/pull-requests.controller.spec.ts` (integration: endpoint returns enriched response)
- `apps/web/src/components/pull-requests/CycleTimeBreakdownPanel.test.tsx`
- `apps/web/src/components/pull-requests/PrLifecycleTimeline.test.tsx`
- `apps/web/src/lib/format-duration.test.ts`

**Backend unit test scenarios for `computeCycleTimeBreakdown`:**

1. **All timestamps present — returns all four phases and correct total:**
   - Input: PR_A fixture (coding=7200, pickup=14400, review=10800, deploy=3600)
   - Assert all four `*_seconds` values match; `total_seconds = 36000`

2. **Missing `first_commit_at` — coding_time is null, total excludes it:**
   - Input: PR_B fixture (`first_commit_at = null`)
   - Assert `coding_time_seconds = null`
   - Assert `total_seconds` equals sum of the three non-null phases

3. **Missing `approved_at` — review_time and deploy_time are null:**
   - Input: PR_C fixture
   - Assert both `review_time_seconds = null` and `deploy_time_seconds = null`
   - Assert `total_seconds` equals coding + pickup only

4. **Unmerged PR — deploy_time is null:**
   - Input: PR with `merged_at = null`
   - Assert `deploy_time_seconds = null`

5. **All timestamps null — total_seconds is null:**
   - Input: PR with only `github_created_at` populated
   - Assert `total_seconds = null`

**Backend integration test — endpoint includes cycle_time field:**

6. **`GET /pull-requests/:prId` returns `cycle_time` object:**
   - Seed a PR with PR_A timestamps
   - Assert response body has `cycle_time.coding_time_seconds = 7200`
   - Assert response body has `cycle_time.total_seconds = 36000`

**Frontend component test scenarios:**

7. **`CycleTimeBreakdownPanel` renders all four phases:**
   - Pass a `CycleTimeBreakdown` with all four phases present
   - Assert text "Coding", "Pickup", "Review", "Deploy" all appear in the DOM
   - Assert formatted durations are displayed

8. **`CycleTimeBreakdownPanel` renders dash for null phases:**
   - Pass `review_time_seconds: null` and `deploy_time_seconds: null`
   - Assert "—" appears for those two rows

9. **`PrLifecycleTimeline` renders five steps:**
   - Pass PR_A fixture data
   - Assert five step labels are present in the DOM

10. **`PrLifecycleTimeline` marks incomplete steps correctly:**
    - Pass PR with `approved_at = null` and `merged_at = null`
    - Assert step 4 (Approved) and step 5 (Merged) have an incomplete visual state

11. **`formatDuration` edge cases:**
    - `formatDuration(null)` returns `'—'`
    - `formatDuration(0)` returns `'0m'`
    - `formatDuration(3600)` returns `'1h 0m'`
    - `formatDuration(90061)` returns `'1d 1h 1m'`
    - `formatDuration(45)` returns `'45s'`

12. **PR list DataGrid renders Cycle Time column:**
    - Render list page with mock API data including `cycle_time.total_seconds`
    - Assert a cell with the formatted duration is visible in the grid

---

### Definition of Done

- [ ] `GET /api/v1/pull-requests/:prId` response includes computed cycle time breakdown
- [ ] PR list page shows "Cycle Time" column with total time
- [ ] PR detail drawer (or page) shows breakdown: coding → pickup → review → deploy with durations
- [ ] Visual timeline of PR lifecycle events
