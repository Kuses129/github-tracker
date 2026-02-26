# Epic 8: Code Change & Review Metrics (Weeks 8-9)

## Overview

Adds two new metric categories — code change volume (additions/deletions over time) and review responsiveness (time to first review, review count per PR) — and surfaces them on the overview dashboard alongside the KPI cards introduced in earlier epics. By the end of this epic all five KPI cards defined in ARCHITECTURE.md are present on the overview page.

**Parallel dependency map:**
- US-029 and US-030 can run in parallel with each other.
- US-031 starts after both US-029 and US-030 APIs are available (can begin with mock data).

---

## US-029: REST API — Code Change Metrics

**Parallel:** Can run in parallel with US-030.

**Recommended Agents:** `api-designer`, `sql-pro`, `backend-developer`

### Implementation Details

**Module location:** `apps/api/src/modules/metrics/`

**File structure (following module.ts -> controller.ts -> service.ts -> repository.ts -> /models/ convention):**

```
apps/api/src/modules/metrics/
  metrics.module.ts
  metrics.controller.ts
  code-changes.service.ts          # new — code change metric logic
  code-changes.repository.ts       # new — SQL aggregation queries
  review-time.service.ts           # new (US-030) — review time logic
  review-time.repository.ts        # new (US-030) — SQL aggregation queries
  rollup.service.ts                # existing — rollup computation
  /models/
    code-changes-metric.model.ts   # new — request/response types
    review-time-metric.model.ts    # new (US-030)
```

**Query params DTO** (`code-changes-metric.model.ts`):

```typescript
export interface CodeChangesQueryParams {
  from: string;           // ISO date
  to: string;             // ISO date
  groupBy: 'day' | 'week' | 'month';
  repositories?: string;  // comma-separated UUIDs
  contributors?: string;  // comma-separated UUIDs
}

export interface CodeChangesPeriod {
  period: string;         // ISO date — start of period
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface CodeChangesResponse {
  data: CodeChangesPeriod[];
}
```

**Repository layer** (`code-changes.repository.ts`):

The primary query aggregates `additions`, `deletions`, and `changed_files` from `pull_requests` grouped by a truncated timestamp period. Only merged PRs are included (state = 'merged') to reflect shipped code.

```sql
-- groupBy = 'week' example; DATE_TRUNC value switches to 'day' or 'month' based on param
SELECT
  DATE_TRUNC('week', pr.merged_at) AS period,
  SUM(pr.additions)                AS additions,
  SUM(pr.deletions)                AS deletions,
  SUM(pr.changed_files)            AS changed_files
FROM pull_requests pr
JOIN repositories r ON pr.repository_id = r.id
WHERE r.organization_id = $1
  AND pr.state = 'merged'
  AND pr.merged_at >= $2
  AND pr.merged_at < $3
  -- optional repository filter:
  AND ($4::uuid[] IS NULL OR pr.repository_id = ANY($4))
  -- optional contributor filter:
  AND ($5::uuid[] IS NULL OR pr.author_id = ANY($5))
GROUP BY DATE_TRUNC('week', pr.merged_at)
ORDER BY period ASC;
```

This query runs against the `pull_requests` table directly. For dashboard queries the caller should prefer the `metric_rollups` table when rollups exist (see rollup strategy below).

**Rollup computation** (`rollup.service.ts`):

After backfill Step 4 completes for a repo, and on each webhook `pull_request.closed` (merged) event, the rollup service upserts daily rows for the three code-change metrics:

```
metric_name: 'code_changes_additions'
metric_name: 'code_changes_deletions'
metric_name: 'code_changes_changed_files'
```

Each daily row carries the sum for that day. Weekly and monthly rollups are derived by re-aggregating from daily rows (consistent with the existing rollup strategy).

**Service layer** (`code-changes.service.ts`):

1. Parse and validate `CodeChangesQueryParams`.
2. Attempt to read from `metric_rollups` first (cache hit path — single-digit ms).
3. Fall back to `CodeChangesRepository.aggregate()` when rollups are not yet available.
4. Map raw rows to `CodeChangesPeriod[]`, filling in zero-value periods for gaps in the date range so the frontend chart always receives a complete series.

**Controller layer** (`metrics.controller.ts`):

```
GET /api/v1/organizations/:orgId/metrics/code-changes
```

Guards: `AuthGuard`, `OrgMemberGuard`.
Response: `CodeChangesResponse` (typed DTO, not raw Prisma model).
Validation: `?from` and `?to` are required ISO dates; `?groupBy` defaults to `'week'`.

**Index relied upon:**

```sql
-- already defined in ARCHITECTURE.md:
CREATE INDEX idx_prs_repo_merged_at ON pull_requests (repository_id, merged_at)
  WHERE merged_at IS NOT NULL;
-- for contributor filter:
CREATE INDEX idx_prs_author_merged_at ON pull_requests (author_id, merged_at)
  WHERE merged_at IS NOT NULL;
```

### Testing Details

**Test file:** `apps/api/src/modules/metrics/code-changes.service.spec.ts`
**Integration test file:** `apps/api/src/modules/metrics/code-changes.repository.spec.ts`

**Seed data scenario A — basic weekly aggregation:**
- Org: `org-1`
- Repo: `repo-1` (belongs to `org-1`)
- 3 merged PRs in week 1 (2026-02-02 to 2026-02-08):
  - PR-A: additions=100, deletions=40, changed_files=5, merged_at=2026-02-03
  - PR-B: additions=200, deletions=80, changed_files=10, merged_at=2026-02-05
  - PR-C: additions=50, deletions=20, changed_files=3, merged_at=2026-02-06
- 1 merged PR in week 2 (2026-02-09 to 2026-02-15):
  - PR-D: additions=300, deletions=100, changed_files=12, merged_at=2026-02-10

**Assertions for scenario A:**
```
GET /api/v1/organizations/org-1/metrics/code-changes
  ?from=2026-02-02&to=2026-02-15&groupBy=week

Expected response.data:
  [
    { period: "2026-02-02", additions: 350, deletions: 140, changedFiles: 18 },
    { period: "2026-02-09", additions: 300, deletions: 100, changedFiles: 12 }
  ]
```

**Seed data scenario B — repository filter:**
- Same org-1 with two repos: `repo-1` and `repo-2`
- PR-E in repo-2: additions=999, deletions=999, merged_at=2026-02-03

**Assertion:** `?repositories=repo-1` returns only repo-1 totals; repo-2 PRs are excluded.

**Seed data scenario C — contributor filter:**
- PR-F authored by `contributor-alice`, PR-G authored by `contributor-bob`, same week
- `?contributors=contributor-alice` returns only PR-F totals.

**Seed data scenario D — open PRs excluded:**
- PR-H is state='open' with additions=500
- Endpoint returns zero for that period (open PRs do not count).

**Seed data scenario E — empty range:**
- `?from=2025-01-01&to=2025-01-07` (no data)
- Response is `{ data: [] }` (not an error).

**Unit test: gap filling:**
- Service receives raw rows for only 2 of 4 weeks in range.
- Output contains 4 entries; the 2 missing weeks have additions=0, deletions=0, changedFiles=0.

**Component/controller test:**
- Missing `?from` or `?to` returns HTTP 400 with structured error.
- Unauthenticated request returns HTTP 401.
- Request for org the authenticated user does not belong to returns HTTP 403.

### Definition of Done

- [ ] `GET /api/v1/organizations/:orgId/metrics/code-changes` returns additions/deletions over time
- [ ] Supports `?from=`, `?to=`, `?groupBy=`, `?repositories=`, `?contributors=`
- [ ] Daily rollups include code change aggregates
- [ ] Test: returns correct sums for seeded data

---

## US-030: REST API — Review Time Metrics

**Parallel:** Can run in parallel with US-029.

**Recommended Agents:** `api-designer`, `sql-pro`, `backend-developer`

### Implementation Details

**Module location:** `apps/api/src/modules/metrics/` (same module, separate service/repository files)

**Models** (`review-time-metric.model.ts`):

```typescript
export interface ReviewTimeQueryParams {
  from: string;
  to: string;
  groupBy: 'day' | 'week' | 'month';
  repositories?: string;
  contributors?: string;
}

export interface ReviewTimePeriod {
  period: string;                    // ISO date — start of period
  avgTimeToFirstReviewHours: number; // AVG(first_review_at - github_created_at)
  avgReviewCountPerPr: number;       // AVG(review count per PR)
  prCount: number;                   // denominator — PRs that received at least one review
}

export interface ReviewTimeResponse {
  data: ReviewTimePeriod[];
  summary: {
    overallAvgTimeToFirstReviewHours: number;
    overallAvgReviewCountPerPr: number;
  };
}
```

**Repository layer** (`review-time.repository.ts`):

**Query 1 — average time to first review, grouped by period:**

`first_review_at` is already stored on the `pull_requests` row (set by the webhook handler in US-012). No join to `pr_reviews` is required for this metric.

```sql
SELECT
  DATE_TRUNC('week', pr.merged_at)             AS period,
  AVG(
    EXTRACT(EPOCH FROM (pr.first_review_at - pr.github_created_at)) / 3600.0
  )                                             AS avg_hours_to_first_review,
  COUNT(*)                                      AS pr_count
FROM pull_requests pr
JOIN repositories r ON pr.repository_id = r.id
WHERE r.organization_id = $1
  AND pr.state = 'merged'
  AND pr.merged_at >= $2
  AND pr.merged_at < $3
  AND pr.first_review_at IS NOT NULL
  AND ($4::uuid[] IS NULL OR pr.repository_id = ANY($4))
  AND ($5::uuid[] IS NULL OR pr.author_id = ANY($5))
GROUP BY DATE_TRUNC('week', pr.merged_at)
ORDER BY period ASC;
```

**Query 2 — average review count per PR, grouped by period:**

```sql
SELECT
  DATE_TRUNC('week', pr.merged_at)   AS period,
  AVG(review_counts.cnt)             AS avg_review_count
FROM pull_requests pr
JOIN repositories r ON pr.repository_id = r.id
JOIN (
  SELECT pull_request_id, COUNT(*) AS cnt
  FROM pr_reviews
  GROUP BY pull_request_id
) AS review_counts ON review_counts.pull_request_id = pr.id
WHERE r.organization_id = $1
  AND pr.state = 'merged'
  AND pr.merged_at >= $2
  AND pr.merged_at < $3
  AND ($4::uuid[] IS NULL OR pr.repository_id = ANY($4))
  AND ($5::uuid[] IS NULL OR pr.author_id = ANY($5))
GROUP BY DATE_TRUNC('week', pr.merged_at)
ORDER BY period ASC;
```

The service merges the two result sets by period key before returning the response.

**Rollup computation:**

Rollup service stores:
```
metric_name: 'review_time_avg_hours_to_first_review'   value: float (hours)
metric_name: 'review_time_avg_review_count_per_pr'     value: float
metric_name: 'review_time_pr_count'                    value: integer
```

For real-time updates: on `pull_request_review.submitted` webhook, if this is the first review for the PR, add the time-to-first-review to the day's running total and increment the denominator in the rollup row.

**Service layer** (`review-time.service.ts`):

1. Validate query params; require `from` and `to`.
2. Run both repository queries in parallel (`Promise.all`).
3. Merge period arrays by `period` key.
4. Compute summary fields as weighted averages across all periods.
5. Fill gaps (periods with no merged PRs) with null values for averages (unlike code changes, zero is misleading here — a week with no reviews is not the same as a week with instant reviews).

**Controller:**

```
GET /api/v1/organizations/:orgId/metrics/review-time
```

Same guards and validation pattern as US-029.

**Index relied upon:**

```sql
-- first_review_at lookup:
CREATE INDEX idx_prs_org_merged_review ON pull_requests (repository_id, merged_at, first_review_at)
  WHERE merged_at IS NOT NULL AND first_review_at IS NOT NULL;

-- pr_reviews join:
CREATE INDEX idx_pr_reviews_pr_id ON pr_reviews (pull_request_id);
```

### Testing Details

**Test files:**
- `apps/api/src/modules/metrics/review-time.service.spec.ts`
- `apps/api/src/modules/metrics/review-time.repository.spec.ts`

**Seed data scenario A — time to first review calculation:**
- Org: `org-1`, Repo: `repo-1`
- PR-A: github_created_at=2026-02-03T10:00:00Z, first_review_at=2026-02-03T14:00:00Z, merged_at=2026-02-04
  - Time to first review = 4 hours
- PR-B: github_created_at=2026-02-05T09:00:00Z, first_review_at=2026-02-05T15:00:00Z, merged_at=2026-02-06
  - Time to first review = 6 hours
- Both fall in week 2026-02-02

**Assertion:**
```
GET .../metrics/review-time?from=2026-02-02&to=2026-02-09&groupBy=week

Expected response.data[0].avgTimeToFirstReviewHours ≈ 5.0  (AVG of 4 and 6)
Expected response.data[0].prCount = 2
```

**Seed data scenario B — average review count per PR:**
- PR-A has 1 review record in `pr_reviews`
- PR-B has 3 review records in `pr_reviews`
- Same week

**Assertion:**
```
Expected response.data[0].avgReviewCountPerPr = 2.0  (AVG of 1 and 3)
```

**Seed data scenario C — PRs with no first_review_at are excluded from avg hours:**
- PR-C merged in the same week but `first_review_at IS NULL`
- `avgTimeToFirstReviewHours` still reflects only PR-A and PR-B
- `prCount` reflects only the PRs that had a review (denominator for avg hours)

**Seed data scenario D — summary field:**
- 2 weeks of data: week 1 avg=4h (10 PRs), week 2 avg=6h (5 PRs)
- `summary.overallAvgTimeToFirstReviewHours` = weighted average = (4*10 + 6*5) / 15 ≈ 4.67

**Seed data scenario E — empty range:**
- `?from=2025-01-01&to=2025-01-07`
- Response: `{ data: [], summary: { overallAvgTimeToFirstReviewHours: null, overallAvgReviewCountPerPr: null } }`

**Unit test: parallel query merge:**
- Mock repository returns period arrays from Query 1 and Query 2 that partially overlap.
- Service correctly merges all periods and fills missing fields with null.

**Controller tests:**
- Missing `?from` returns HTTP 400.
- Valid authenticated request returns HTTP 200.
- Unauthenticated request returns HTTP 401.

### Definition of Done

- [ ] `GET /api/v1/organizations/:orgId/metrics/review-time` returns avg time to first review, avg review count per PR
- [ ] Supports standard filter params
- [ ] Test: returns correct values for seeded data

---

## US-031: Code Change + Review Dashboards

**Parallel:** After US-029 and US-030 APIs are available.

**Recommended Agents:** `react-specialist`, `ui-designer`

### Implementation Details

**Frontend file structure:**

```
apps/web/src/
  api/
    metrics/
      code-changes.api.ts          # new — fetch code-changes endpoint
      code-changes.types.ts        # new — mirrors backend models
      review-time.api.ts           # new — fetch review-time endpoint
      review-time.types.ts         # new

  hooks/
    useCodeChangesMetrics.ts       # new — TanStack Query hook
    useReviewTimeMetrics.ts        # new — TanStack Query hook

  components/
    metrics/
      KpiCard.tsx                  # existing — reused from US-018/US-027
      CodeThroughputKpiCard.tsx    # new — thin wrapper providing label + data
      ReviewResponseTimeKpiCard.tsx # new — thin wrapper
    charts/
      CodeChurnChart.tsx           # new — mirror/diverging area chart (Nivo)
      ReviewTimeTrendChart.tsx     # new — line chart (Nivo)

  pages/
    dashboard/
      OverviewDashboard.tsx        # existing — add new cards + charts
```

**API layer** (`code-changes.api.ts`):

```typescript
import { apiClient } from '../github-client';
import type { CodeChangesResponse, CodeChangesQueryParams } from './code-changes.types';

export async function fetchCodeChanges(
  orgId: string,
  params: CodeChangesQueryParams,
): Promise<CodeChangesResponse> {
  const { data } = await apiClient.get(
    `/organizations/${orgId}/metrics/code-changes`,
    { params },
  );
  return data;
}
```

Types file mirrors the backend model exactly (shared via `packages/shared` if available, otherwise duplicated with a TODO).

**TanStack Query hook** (`useCodeChangesMetrics.ts`):

```typescript
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '../../store/filter.store';
import { fetchCodeChanges } from '../api/metrics/code-changes.api';

export function useCodeChangesMetrics(orgId: string) {
  const { from, to, groupBy, repositories, contributors } = useFilterStore();
  return useQuery({
    queryKey: ['code-changes', orgId, from, to, groupBy, repositories, contributors],
    queryFn: () =>
      fetchCodeChanges(orgId, { from, to, groupBy, repositories, contributors }),
    enabled: Boolean(orgId && from && to),
    staleTime: 5 * 60 * 1000,
  });
}
```

Same pattern for `useReviewTimeMetrics`.

**CodeChurnChart component** (`CodeChurnChart.tsx`):

Uses Nivo `ResponsiveAreaBump` or, more precisely, `ResponsiveLine` with a diverging axis: additions series is rendered above zero with positive values; deletions series is rendered below zero with negated values. This matches the "mirror/diverging area chart" described in ARCHITECTURE.md.

```typescript
import { ResponsiveLine } from '@nivo/line';

interface CodeChurnChartProps {
  data: CodeChangesPeriod[];
  groupBy: 'day' | 'week' | 'month';
}

export function CodeChurnChart({ data, groupBy }: CodeChurnChartProps) {
  const chartData = [
    {
      id: 'additions',
      data: data.map(d => ({ x: d.period, y: d.additions })),
    },
    {
      id: 'deletions',
      // negate deletions so the series renders below the zero axis
      data: data.map(d => ({ x: d.period, y: -d.deletions })),
    },
  ];

  return (
    <ResponsiveLine
      data={chartData}
      enableArea
      areaOpacity={0.3}
      yScale={{ type: 'linear', stacked: false }}
      axisLeft={{
        format: v => (v < 0 ? `${Math.abs(v)}` : `${v}`),
        legend: 'Lines changed',
      }}
      colors={['#4caf50', '#f44336']}  // green additions, red deletions
      tooltip={({ point }) => (
        <div>
          <strong>{point.serieId}</strong>: {Math.abs(Number(point.data.y)).toLocaleString()}
        </div>
      )}
      markers={[{ axis: 'y', value: 0, lineStyle: { stroke: '#888', strokeWidth: 1 } }]}
    />
  );
}
```

The zero-line marker visually separates additions from deletions. The `axisLeft` format strips the negative sign from deletion labels so users see positive numbers on both sides.

**ReviewTimeTrendChart component** (`ReviewTimeTrendChart.tsx`):

Standard Nivo `ResponsiveLine` chart rendering `avgTimeToFirstReviewHours` over time. Tooltip shows the formatted duration (e.g., "5.2 hours"). Periods where `avgTimeToFirstReviewHours` is null are rendered as gaps in the line (Nivo supports this natively with `null` data points).

**KPI card wrappers:**

`CodeThroughputKpiCard` and `ReviewResponseTimeKpiCard` are thin wrappers around the existing `KpiCard` component introduced in US-018. They derive their `value` and `delta` props from the respective hooks and pass the appropriate `label` and `unit` strings. No duplication of KPI card rendering logic.

```typescript
export function CodeThroughputKpiCard({ orgId }: { orgId: string }) {
  const { data, isLoading } = useCodeChangesMetrics(orgId);
  const throughput = computeWeeklyThroughput(data);  // sum additions+deletions for current period
  const delta = computeDeltaVsPreviousPeriod(data);
  return (
    <KpiCard
      label="Code Throughput"
      value={throughput}
      unit="lines/week"
      delta={delta}
      isLoading={isLoading}
    />
  );
}
```

**Overview dashboard integration** (`OverviewDashboard.tsx`):

The 5 KPI cards are laid out in a single `Grid` row. Cards 1-3 were added in earlier epics (PRs Merged, Avg Cycle Time, Active Open PRs). Cards 4 and 5 are added here:

| Position | Card | Data source |
|----------|------|-------------|
| 1 | PRs Merged | US-016 / US-018 |
| 2 | Avg Cycle Time | US-026 / US-027 |
| 3 | Active Open PRs | US-015 |
| 4 | Code Throughput | US-029 (this epic) |
| 5 | Review Response Time | US-030 (this epic) |

The code churn chart and review time trend chart are placed below the KPI cards in the same overview page. Both charts respond to global filter changes via their respective Zustand filter store subscriptions.

**Global filter integration:**

Both hooks (`useCodeChangesMetrics`, `useReviewTimeMetrics`) read from the Zustand filter store directly. When the user changes a filter in the filter bar, the store updates, the query keys change, and TanStack Query automatically refetches. No additional wiring is required.

**Loading and empty states:**

- Loading: `KpiCard` renders an MUI `Skeleton` in place of the value. Charts render a full-height `Skeleton` block.
- Empty: when `data.data` is an empty array, charts render an MUI `EmptyState` component with the message "No code changes in the selected period."

### Testing Details

**Test files:**

```
apps/web/src/
  hooks/useCodeChangesMetrics.test.ts
  hooks/useReviewTimeMetrics.test.ts
  components/charts/CodeChurnChart.test.tsx
  components/charts/ReviewTimeTrendChart.test.tsx
  components/metrics/CodeThroughputKpiCard.test.tsx
  components/metrics/ReviewResponseTimeKpiCard.test.tsx
  pages/dashboard/OverviewDashboard.test.tsx
```

**Hook tests** (`useCodeChangesMetrics.test.ts`):

Using `@testing-library/react` with a `QueryClientProvider` wrapper and MSW (Mock Service Worker) for API mocking.

```typescript
// scenario: successful fetch returns correct data shape
it('returns CodeChangesResponse when API succeeds', async () => {
  server.use(
    rest.get('/api/v1/organizations/org-1/metrics/code-changes', (req, res, ctx) =>
      res(ctx.json({ data: [{ period: '2026-02-02', additions: 350, deletions: 140, changedFiles: 18 }] })),
    ),
  );
  const { result } = renderHook(() => useCodeChangesMetrics('org-1'), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.data[0].additions).toBe(350);
});

// scenario: hook is disabled when from/to not set
it('does not fetch when from/to are absent', () => {
  useFilterStore.setState({ from: '', to: '' });
  const { result } = renderHook(() => useCodeChangesMetrics('org-1'), { wrapper });
  expect(result.current.fetchStatus).toBe('idle');
});
```

**CodeChurnChart tests** (`CodeChurnChart.test.tsx`):

```typescript
// scenario: renders without crashing with valid data
it('renders additions and deletions series', () => {
  const data = [
    { period: '2026-02-02', additions: 350, deletions: 140, changedFiles: 18 },
    { period: '2026-02-09', additions: 300, deletions: 100, changedFiles: 12 },
  ];
  render(<CodeChurnChart data={data} groupBy="week" />);
  // Nivo renders SVG; assert the chart container is present
  expect(document.querySelector('svg')).toBeInTheDocument();
});

// scenario: empty data renders without crashing
it('renders with empty data array', () => {
  render(<CodeChurnChart data={[]} groupBy="week" />);
  expect(document.querySelector('svg')).toBeInTheDocument();
});

// snapshot test to catch unintended visual regressions
it('matches snapshot', () => {
  const { container } = render(<CodeChurnChart data={mockData} groupBy="week" />);
  expect(container).toMatchSnapshot();
});
```

**KPI card wrapper tests** (`CodeThroughputKpiCard.test.tsx`):

```typescript
// scenario: renders value from hook data
it('displays computed throughput value', async () => {
  // MSW returns known data; computed throughput for that data = 650 lines/week
  render(<CodeThroughputKpiCard orgId="org-1" />, { wrapper });
  await screen.findByText('650');
  expect(screen.getByText('lines/week')).toBeInTheDocument();
});

// scenario: loading state shows skeleton
it('shows skeleton while loading', () => {
  // MSW delays response
  render(<CodeThroughputKpiCard orgId="org-1" />, { wrapper });
  expect(document.querySelector('.MuiSkeleton-root')).toBeInTheDocument();
});
```

**Overview dashboard integration test** (`OverviewDashboard.test.tsx`):

```typescript
// scenario: all 5 KPI cards render
it('renders all 5 KPI cards', async () => {
  // MSW mocks all 5 metric endpoints
  render(<OverviewDashboard />, { wrapper });
  await screen.findByText('PRs Merged');
  expect(screen.getByText('Avg Cycle Time')).toBeInTheDocument();
  expect(screen.getByText('Active Open PRs')).toBeInTheDocument();
  expect(screen.getByText('Code Throughput')).toBeInTheDocument();
  expect(screen.getByText('Review Response Time')).toBeInTheDocument();
});

// scenario: filter change triggers refetch
it('refetches on filter change', async () => {
  render(<OverviewDashboard />, { wrapper });
  await screen.findByText('Code Throughput');
  act(() => {
    useFilterStore.setState({ from: '2026-01-01', to: '2026-01-31' });
  });
  // MSW captures the new request with updated date params
  await waitFor(() => {
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('from=2026-01-01'),
    );
  });
});
```

**ReviewTimeTrendChart tests:**

Mirror the CodeChurnChart test patterns — render with valid data, render with empty data, snapshot. Additionally assert that null data points (periods with no reviews) do not throw.

### Definition of Done

- [ ] KPI cards: "Code Throughput" (lines/week), "Review Response Time" (avg time to first review)
- [ ] Code churn chart: mirror/diverging area chart (additions above, deletions below)
- [ ] Review time trend chart
- [ ] All 5 KPI cards from ARCHITECTURE.md now present on the overview dashboard
- [ ] Responds to global filters
