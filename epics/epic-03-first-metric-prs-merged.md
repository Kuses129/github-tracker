# Epic 3: First Metric — PRs Merged (Week 3-4)

This is the **vertical slice** that proves the full stack works. One metric, all the way from webhook to dashboard.

---

## US-014: REST API — Organizations & Repositories

Create the API endpoints for listing organizations and repositories.

**Parallel:** After US-002 and US-003. Can run in parallel with US-015, US-016.

**Recommended Agents:** `api-designer`, `backend-developer`

### Implementation Details

**NestJS module to create:**

```
apps/api/src/modules/organizations/
  organizations.module.ts
  organizations.controller.ts
  organizations.service.ts
  organizations.repository.ts
  models/
    organization.dto.ts
    repository.dto.ts

apps/api/src/modules/repositories/
  repositories.module.ts
  repositories.controller.ts
  repositories.service.ts
  repositories.repository.ts
  models/
    repository.dto.ts
    repository-stats.dto.ts
```

**`organizations.repository.ts`** — Prisma queries only, no business logic:
- `findAll(): Promise<Organization[]>` — `prisma.organization.findMany()`
- `findById(id: string): Promise<Organization | null>`
- `findRepositoriesByOrgId(orgId: string): Promise<Repository[]>` — `prisma.repository.findMany({ where: { organizationId: orgId } })`

**`repositories.repository.ts`**:
- `findById(id: string): Promise<Repository | null>`
- `findWithStats(id: string): Promise<RepositoryWithStats | null>` — joins aggregate counts of PRs and commits using Prisma's `_count` relation

**`organizations.service.ts`** — delegates to repository, maps Prisma models to DTOs:
- `getOrganizations(): Promise<OrganizationDto[]>`
- `getRepositoriesByOrg(orgId: string): Promise<RepositoryDto[]>`

**`repositories.service.ts`**:
- `getRepository(repoId: string): Promise<RepositoryStatsDto>`

**`models/organization.dto.ts`**:
```typescript
export interface OrganizationDto {
  id: string;
  githubId: number;
  login: string;
  avatarUrl: string | null;
  createdAt: string;
}
```

**`models/repository.dto.ts`**:
```typescript
export interface RepositoryDto {
  id: string;
  githubId: number;
  name: string;
  fullName: string;
  organizationId: string;
  createdAt: string;
}

export interface RepositoryStatsDto extends RepositoryDto {
  totalPullRequests: number;
  mergedPullRequests: number;
  openPullRequests: number;
}
```

**`organizations.controller.ts`** — guards + routing:
- `GET /api/v1/organizations` — calls `organizationsService.getOrganizations()`
- `GET /api/v1/organizations/:orgId/repositories` — calls `organizationsService.getRepositoriesByOrg(orgId)`

**`repositories.controller.ts`**:
- `GET /api/v1/repositories/:repoId` — calls `repositoriesService.getRepository(repoId)`

Apply `JwtAuthGuard` (from `AuthModule`) to all controllers. Return 401 via the guard before handlers execute.

**`common/pagination/cursor-pagination.ts`** — shared cursor utility used across list endpoints:
```typescript
export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}
```

Register `OrganizationsModule` and `RepositoriesModule` in `AppModule`.

### Testing Details

**Unit test files:**

```
apps/api/src/modules/organizations/
  organizations.service.spec.ts
  organizations.repository.spec.ts

apps/api/src/modules/repositories/
  repositories.service.spec.ts
```

**`organizations.service.spec.ts`** — mock `OrganizationsRepository`:
- Returns mapped `OrganizationDto[]` — assert DTO fields match, Prisma model fields are excluded
- `getRepositoriesByOrg` with unknown `orgId` — returns empty array, no throw

**`organizations.repository.spec.ts`** — use Prisma test client against a test DB or mock `PrismaService`:
- `findAll()` returns all seeded organizations
- `findRepositoriesByOrgId(orgId)` returns only repos belonging to that org

**Integration test file:** `apps/api/test/organizations.e2e-spec.ts`

Scenarios:
- `GET /api/v1/organizations` with valid JWT → 200, array of org DTOs
- `GET /api/v1/organizations` without JWT → 401
- `GET /api/v1/organizations/:orgId/repositories` with valid JWT and known org → 200, array of repository DTOs
- `GET /api/v1/organizations/:orgId/repositories` with unknown orgId → 200, empty array
- `GET /api/v1/repositories/:repoId` with valid JWT and known repo → 200, includes `totalPullRequests`
- `GET /api/v1/repositories/:repoId` with unknown repoId → 404

**Test fixtures** (`apps/api/test/fixtures/organizations.fixture.ts`):
- Seed 2 orgs, 3 repos (2 under org-1, 1 under org-2), 5 merged PRs under repo-1

**What to mock:** In unit tests, mock `PrismaService` with `jest.fn()`. In integration tests, use a real test PostgreSQL instance (via Docker Compose) and run migrations before the suite.

### Definition of Done

- [ ] `GET /api/v1/organizations` — returns all orgs for the authenticated user
- [ ] `GET /api/v1/organizations/:orgId/repositories` — returns repos for an org
- [ ] `GET /api/v1/repositories/:repoId` — returns a single repo with basic stats
- [ ] All endpoints require authentication (401 if not authenticated)
- [ ] Response DTOs are typed (not raw Prisma models)
- [ ] Test: authenticated request returns expected data
- [ ] Test: unauthenticated request returns 401

---

## US-015: REST API — Pull Requests List + Detail

Create the API endpoints for listing and viewing pull requests with cursor-based pagination.

**Parallel:** After US-003. Can run in parallel with US-014, US-016.

**Recommended Agents:** `api-designer`, `backend-developer`, `sql-pro`

### Implementation Details

**NestJS module:**

```
apps/api/src/modules/pull-requests/
  pull-requests.module.ts
  pull-requests.controller.ts
  pull-requests.service.ts
  pull-requests.repository.ts
  models/
    pull-request.dto.ts
    pull-request-list-query.dto.ts
    cycle-time.dto.ts
```

**`models/pull-request-list-query.dto.ts`** — validated with `class-validator`:
```typescript
export class PullRequestListQueryDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsIn(['open', 'closed', 'merged']) state?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}
```

**`models/cycle-time.dto.ts`**:
```typescript
export interface CycleTimeDto {
  codingTimeSeconds: number | null;   // github_created_at - first_commit_at
  pickupTimeSeconds: number | null;   // first_review_at - github_created_at
  reviewTimeSeconds: number | null;   // approved_at - first_review_at
  deployTimeSeconds: number | null;   // merged_at - approved_at
  totalSeconds: number | null;
}
```

**`models/pull-request.dto.ts`**:
```typescript
export interface PullRequestDto {
  id: string;
  githubId: number;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  additions: number;
  deletions: number;
  changedFiles: number;
  repositoryId: string;
  authorId: string | null;
  githubCreatedAt: string;
  firstCommitAt: string | null;
  firstReviewAt: string | null;
  approvedAt: string | null;
  mergedAt: string | null;
}

export interface PullRequestDetailDto extends PullRequestDto {
  cycleTime: CycleTimeDto;
}
```

**`pull-requests.repository.ts`**:
- `findByRepository(repoId: string, query: PullRequestListQueryDto): Promise<CursorPage<PullRequest>>` — uses cursor-based pagination: `where: { id: { gt: cursor } }`, `take: limit + 1` (extra record determines if next page exists), `orderBy: { githubCreatedAt: 'asc' }`
- `findById(prId: string): Promise<PullRequest | null>`

Cursor is the UUID of the last record on the current page, base64-encoded. Decode on input, encode on output in the service layer.

**`pull-requests.service.ts`**:
- `listPullRequests(repoId, query): Promise<CursorPage<PullRequestDto>>` — delegates to repository, maps to DTOs
- `getPullRequest(prId): Promise<PullRequestDetailDto>` — maps to DTO, **computes `CycleTimeDto` at this layer** by diffing lifecycle timestamps:
  ```typescript
  private computeCycleTime(pr: PullRequest): CycleTimeDto {
    const diff = (a: Date | null, b: Date | null) =>
      a && b ? Math.round((a.getTime() - b.getTime()) / 1000) : null;
    return {
      codingTimeSeconds: diff(pr.githubCreatedAt, pr.firstCommitAt),
      pickupTimeSeconds: diff(pr.firstReviewAt, pr.githubCreatedAt),
      reviewTimeSeconds: diff(pr.approvedAt, pr.firstReviewAt),
      deployTimeSeconds: diff(pr.mergedAt, pr.approvedAt),
      totalSeconds: diff(pr.mergedAt, pr.firstCommitAt),
    };
  }
  ```

**`pull-requests.controller.ts`**:
- `GET /api/v1/repositories/:repoId/pull-requests` — `@Query()` bound to `PullRequestListQueryDto`
- `GET /api/v1/pull-requests/:prId`

Both routes protected by `JwtAuthGuard`.

### Testing Details

**Unit test files:**

```
apps/api/src/modules/pull-requests/
  pull-requests.service.spec.ts
  pull-requests.repository.spec.ts
```

**`pull-requests.service.spec.ts`** — mock `PullRequestsRepository`:

- `listPullRequests` with `from`/`to` range — assert repository called with correct `where` clause dates
- `listPullRequests` with cursor — assert returned `nextCursor` is set when more pages exist, null when last page
- `getPullRequest` with all lifecycle timestamps set — assert computed `totalSeconds` equals expected value
- `getPullRequest` with `firstReviewAt` null — assert `pickupTimeSeconds` and `reviewTimeSeconds` are null
- `getPullRequest` with unknown id — assert throws `NotFoundException`

**`pull-requests.repository.spec.ts`** — against test DB:
- Seed 15 PRs, request page size 5 → assert 5 returned, `nextCursor` present
- Request second page using returned cursor → assert next 5 returned, no overlap
- Filter by `from`/`to` → assert only PRs with `githubCreatedAt` in range returned
- Filter by `state=merged` → assert only merged PRs returned

**Integration test file:** `apps/api/test/pull-requests.e2e-spec.ts`

Scenarios:
- `GET /api/v1/repositories/:repoId/pull-requests` with valid JWT → 200, `{ data: [...], nextCursor }`
- `GET /api/v1/pull-requests/:prId` → 200, includes `cycleTime` object
- `GET /api/v1/pull-requests/nonexistent-id` → 404

**Test fixtures** (`apps/api/test/fixtures/pull-requests.fixture.ts`):
- 20 PRs across 3 repositories with varied states and lifecycle timestamps (some null, some complete)

### Definition of Done

- [ ] `GET /api/v1/repositories/:repoId/pull-requests` — paginated list with cursor-based pagination
- [ ] `GET /api/v1/pull-requests/:prId` — single PR with lifecycle timestamps and computed cycle time fields
- [ ] Supports query params: `?from=`, `?to=`, `?state=` (filter by date range and state)
- [ ] Cycle time fields calculated at query time from lifecycle timestamps (not stored)
- [ ] Response includes `nextCursor` for pagination
- [ ] Test: pagination returns correct pages
- [ ] Test: date range filter returns only PRs within range

---

## US-016: REST API — PRs Merged Metric

Create the metrics endpoint that returns PRs merged count over time, grouped by day/week/month.

**Parallel:** After US-003. Can run in parallel with US-014, US-015.

**Recommended Agents:** `api-designer`, `sql-pro`, `backend-developer`

### Implementation Details

**NestJS module:**

```
apps/api/src/modules/metrics/
  metrics.module.ts
  metrics.controller.ts
  metrics.service.ts
  metrics.repository.ts
  models/
    merge-frequency-query.dto.ts
    merge-frequency-response.dto.ts
```

**`models/merge-frequency-query.dto.ts`** — validated with `class-validator`:
```typescript
export class MergeFrequencyQueryDto {
  @IsISO8601() from: string;
  @IsISO8601() to: string;
  @IsIn(['day', 'week', 'month']) groupBy: 'day' | 'week' | 'month';
  @IsOptional() @IsString() repositories?: string; // comma-separated UUIDs
}
```

**`models/merge-frequency-response.dto.ts`**:
```typescript
export interface MergeFrequencyPeriodDto {
  period: string;  // ISO date string: "2026-02-01"
  count: number;
}

export interface MergeFrequencyResponseDto {
  data: MergeFrequencyPeriodDto[];
}
```

**`metrics.repository.ts`** — uses `prisma.$queryRaw` for the date_trunc aggregation:
```typescript
async getMergeFrequency(
  orgId: string,
  from: Date,
  to: Date,
  groupBy: 'day' | 'week' | 'month',
  repositoryIds?: string[],
): Promise<MergeFrequencyPeriodDto[]> {
  const repoFilter = repositoryIds?.length
    ? Prisma.sql`AND pr.repository_id = ANY(${repositoryIds}::uuid[])`
    : Prisma.empty;

  const rows = await this.prisma.$queryRaw<Array<{ period: Date; count: bigint }>>`
    SELECT
      date_trunc(${groupBy}, pr.merged_at) AS period,
      COUNT(*) AS count
    FROM pull_requests pr
    JOIN repositories r ON r.id = pr.repository_id
    WHERE r.organization_id = ${orgId}::uuid
      AND pr.state = 'merged'
      AND pr.merged_at >= ${from}
      AND pr.merged_at < ${to}
      ${repoFilter}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  return rows.map(row => ({
    period: row.period.toISOString().split('T')[0],
    count: Number(row.count),
  }));
}
```

**`metrics.service.ts`**:
- `getMergeFrequency(orgId, query): Promise<MergeFrequencyResponseDto>` — parses query params, resolves repo ID list from comma-separated string, delegates to repository, returns `{ data: [...] }`. Returns `{ data: [] }` when repository returns empty array (no throw).

**`metrics.controller.ts`**:
- `GET /api/v1/organizations/:orgId/metrics/merge-frequency` — bound to `MergeFrequencyQueryDto`, protected by `JwtAuthGuard`

### Testing Details

**Unit test files:**

```
apps/api/src/modules/metrics/
  metrics.service.spec.ts
  metrics.repository.spec.ts
```

**`metrics.service.spec.ts`** — mock `MetricsRepository`:
- Parses `repositories` comma-separated string into array before passing to repository
- Returns `{ data: [] }` when repository returns empty array
- Passes correct `from`/`to` as `Date` objects to repository

**`metrics.repository.spec.ts`** — against test DB with seeded data:
- Seed 10 merged PRs spread across 5 days in January 2026 (2 per day)
- `getMergeFrequency` with `groupBy=day` → assert 5 period entries, each with `count: 2`
- `getMergeFrequency` with `groupBy=week` → assert counts are summed into the correct ISO week
- `getMergeFrequency` with `groupBy=month` → assert 1 entry for January with `count: 10`
- `getMergeFrequency` with `repositories` filter → assert only PRs in those repos counted
- `getMergeFrequency` for a date range with no merged PRs → assert returns `[]`
- PRs with `state != 'merged'` (open/closed) → assert excluded from counts

**Integration test file:** `apps/api/test/metrics.e2e-spec.ts`

Scenarios:
- `GET /api/v1/organizations/:orgId/metrics/merge-frequency?from=2026-01-01&to=2026-02-01&groupBy=day` with seeded data → 200, correct period counts
- Same endpoint with `?repositories=<id1>,<id2>` → 200, narrowed counts
- Date range with no data → 200, `{ data: [] }` (not 404)
- Missing required `from`/`to` params → 400

**Test seed file:** `apps/api/test/fixtures/metrics.fixture.ts` — creates merged PRs with known `merged_at` timestamps across specific periods.

### Definition of Done

- [ ] `GET /api/v1/organizations/:orgId/metrics/merge-frequency` — returns PRs merged count grouped by time period
- [ ] Supports: `?from=`, `?to=`, `?groupBy=day|week|month`, `?repositories=` (comma-separated IDs)
- [ ] Response format: `{ data: [{ period: "2026-02-01", count: 15 }, ...] }`
- [ ] Query uses `merged_at` timestamp with `state = 'merged'` filter
- [ ] Returns empty array (not error) when no data exists for the range
- [ ] Test: with seeded data, returns correct counts per period
- [ ] Test: repository filter narrows results correctly

---

## US-017: Dashboard — App Shell

Build the persistent app shell: sidebar navigation, top bar, and filter bar.

**Parallel:** After US-005. Can start before API stories are done (uses mock data initially).

**Recommended Agents:** `react-specialist`, `ui-designer`

### Implementation Details

**Files to create:**

```
apps/web/src/components/layout/
  AppShell.tsx
  Sidebar.tsx
  TopBar.tsx
  FilterBar.tsx
  models/
    nav-item.types.ts

apps/web/src/store/
  ui.store.ts
  filter.store.ts

apps/web/src/hooks/
  useFilterParams.ts
```

**`models/nav-item.types.ts`**:
```typescript
export interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}
```

**`ui.store.ts`** (Zustand):
```typescript
interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}
```

**`filter.store.ts`** (Zustand) — source of truth for active filters synced from URL:
```typescript
interface FilterState {
  from: string;
  to: string;
  repositories: string[];
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  setRepositories: (ids: string[]) => void;
}
```

**`useFilterParams.ts`** — reads/writes filter state to URL query params using React Router `useSearchParams`. Initializes Zustand filter store from URL on mount. Every filter change calls `setSearchParams` to keep URL in sync:
```typescript
export function useFilterParams(): FilterState & { syncFromUrl: () => void }
```

**`Sidebar.tsx`**:
- Renders `NavItem[]` (defined inline, not from API): Overview `/`, Pull Requests `/pull-requests`, Commits `/commits`, Contributors `/contributors`, Repositories `/repositories`, Teams `/teams`
- Uses MUI `Drawer` (permanent variant)
- Width controlled by `uiStore.sidebarCollapsed`: 240px expanded, 64px collapsed
- Active route highlighted using `useMatch` from React Router
- Collapse toggle button at the bottom
- At `md` breakpoint and below, collapses automatically via MUI `useMediaQuery`

**`TopBar.tsx`**:
- MUI `AppBar` + `Toolbar`
- Left: logo (text or SVG placeholder)
- Right: user avatar (`MUI Avatar`) + name — reads from `AuthContext` (stub for now: hardcoded "Demo User")
- Logout button calls `AuthContext.logout()`

**`FilterBar.tsx`**:
- MUI `Paper` with `position: sticky`, `top: 56px` (below `TopBar`), `zIndex: 1`
- Date range: two MUI `DatePicker` components (`from` / `to`), reads/writes via `useFilterParams`
- Repository multi-select: MUI `Autocomplete` with `multiple`, options fetched via `useRepositories` hook (stub initially returns empty array)
- On any filter change: `useFilterParams` writes to URL immediately

**`AppShell.tsx`**:
- Composes `Sidebar`, `TopBar`, `FilterBar`, and `<Outlet />` from React Router
- Uses MUI `Box` for layout: flex row for sidebar + main area, flex column for main area
- Content area: `maxWidth: 1400px`, centered with `mx: 'auto'`, `px: 3`

Register `AppShell` as the layout route in `apps/web/src/main.tsx` (or router config), wrapping all authenticated routes.

**`apps/web/src/api/repositories/`** (create stub):
```
apps/web/src/api/repositories/
  repositories.api.ts
  repositories.types.ts
```

`repositories.types.ts` defines `RepositoryDto` matching the backend DTO.
`repositories.api.ts` exports `fetchRepositories(orgId: string)` using the shared HTTP client.

**`apps/web/src/hooks/useRepositories.ts`** — TanStack Query hook:
```typescript
export function useRepositories(orgId: string | null) {
  return useQuery({
    queryKey: ['repositories', orgId],
    queryFn: () => fetchRepositories(orgId!),
    enabled: !!orgId,
  });
}
```

### Testing Details

**Test files:**

```
apps/web/src/components/layout/
  Sidebar.test.tsx
  FilterBar.test.tsx
  AppShell.test.tsx

apps/web/src/store/
  filter.store.test.ts
  ui.store.test.ts

apps/web/src/hooks/
  useFilterParams.test.ts
```

**`Sidebar.test.tsx`** (React Testing Library):
- Renders all 6 nav links
- Clicking the collapse toggle sets `sidebarCollapsed: true` in `uiStore` and narrows sidebar width
- Active route link has `aria-current="page"` (or MUI `selected` prop)
- At mobile viewport (`width: 600px`), sidebar is collapsed by default

**`FilterBar.test.tsx`**:
- Renders date pickers and repository multi-select
- Changing the `from` date picker updates the URL search param `from`
- URL params `?from=2026-01-01&to=2026-02-01` pre-populate the pickers on render

**`filter.store.test.ts`**:
- Initial state matches defaults
- `setRepositories(['id-1', 'id-2'])` updates `repositories` array

**`useFilterParams.test.ts`** — wrap in `MemoryRouter`:
- Calling `setFrom('2026-01-01')` appends `from=2026-01-01` to the URL
- Mounting with `?repositories=id-1,id-2` populates the Zustand store

**MSW handlers** (`apps/web/src/mocks/handlers.ts`) — add stub handler for repositories endpoint returning empty array for tests that do not need real data.

### Definition of Done

- [ ] Sidebar with navigation links: Overview, Pull Requests, Commits, Contributors, Repositories, Teams
- [ ] Sidebar collapses to icon-only mode (64px) and expands to full (240px)
- [ ] Top bar shows: logo, user avatar + name (from auth session), logout button
- [ ] Filter bar (sticky below top bar) with: date range picker, repository multi-select
- [ ] Active route highlighted in sidebar
- [ ] Filters persist in URL query parameters (shareable URLs)
- [ ] Layout is responsive (sidebar collapses on small screens)

---

## US-018: Dashboard — PRs Merged KPI Card + Chart

Build the overview dashboard page with the first metric: PRs Merged as a KPI card and bar chart.

**Parallel:** After US-016 (API) and US-017 (shell) are done.

**Recommended Agents:** `react-specialist`, `ui-designer`

### Implementation Details

**Files to create:**

```
apps/web/src/api/metrics/
  metrics.api.ts
  metrics.types.ts

apps/web/src/hooks/
  useMergeFrequency.ts

apps/web/src/components/metrics/
  KpiCard.tsx
  MergedPrsChart.tsx
  models/
    kpi-card.types.ts

apps/web/src/pages/dashboard/
  DashboardPage.tsx
```

**`metrics.types.ts`**:
```typescript
export interface MergeFrequencyPeriod {
  period: string;
  count: number;
}

export interface MergeFrequencyResponse {
  data: MergeFrequencyPeriod[];
}

export interface MergeFrequencyParams {
  orgId: string;
  from: string;
  to: string;
  groupBy: 'day' | 'week' | 'month';
  repositories?: string[];
}
```

**`metrics.api.ts`**:
```typescript
export async function fetchMergeFrequency(
  params: MergeFrequencyParams,
): Promise<MergeFrequencyResponse>
```

Uses the shared HTTP client from `apps/web/src/api/github-client.ts`. Serializes `repositories` array as comma-separated string.

**`useMergeFrequency.ts`** (TanStack Query):
```typescript
export function useMergeFrequency(params: MergeFrequencyParams) {
  return useQuery({
    queryKey: ['mergeFrequency', params],
    queryFn: () => fetchMergeFrequency(params),
    enabled: !!params.orgId && !!params.from && !!params.to,
    placeholderData: keepPreviousData,
  });
}
```

`keepPreviousData` prevents the chart from blanking out during filter transitions.

**`models/kpi-card.types.ts`**:
```typescript
export interface KpiCardProps {
  title: string;
  value: number | null;
  delta?: number | null;   // percentage change vs previous period
  isLoading: boolean;
  unit?: string;
}
```

**`KpiCard.tsx`**:
- MUI `Card` with `CardContent`
- Title in `Typography variant="overline"`
- Value in `Typography variant="h3"` — shows MUI `Skeleton` when `isLoading`
- Delta badge: green arrow-up for positive, red arrow-down for negative, grey dash for zero/null
- Delta formatted as "+12% vs prev period" using MUI `Chip` with color

**`MergedPrsChart.tsx`**:
- Nivo `ResponsiveBar` chart
- Props: `data: MergeFrequencyPeriod[]`, `isLoading: boolean`, `isEmpty: boolean`
- Loading state: MUI `Skeleton` sized to chart container height (300px)
- Empty state: MUI `Box` centered with `Typography`: "Install the GitHub App to start tracking" + a secondary hint
- `indexBy="period"`, `keys={['count']}`, bottom axis shows period labels, left axis shows count
- Tooltip: shows exact count on hover

**`DashboardPage.tsx`**:
- Reads `from`, `to`, `repositories`, `groupBy` from `useFilterParams()`
- Reads `orgId` from auth context / org store (stub: first org from `useOrganizations`)
- Calls `useMergeFrequency({ orgId, from, to, groupBy, repositories })`
- Computes delta: re-calls `useMergeFrequency` for the equivalent previous period (same duration, shifted back) — sums `count` of both periods, computes percentage change
- Renders `KpiCard` + `MergedPrsChart` in a MUI `Grid` layout
- No full page reload on filter change — TanStack Query handles refetch

**Previous period delta computation** — done in `DashboardPage.tsx`:
```typescript
function computePreviousPeriodRange(from: string, to: string) {
  const duration = differenceInMilliseconds(parseISO(to), parseISO(from));
  return {
    from: new Date(parseISO(from).getTime() - duration).toISOString(),
    to: from,
  };
}
```

**`apps/web/src/api/github-client.ts`** (create if not yet in US-005 scaffold):
- Configured `fetch` wrapper with base URL from `import.meta.env.VITE_API_BASE_URL`
- Throws `ApiError` with `status` for non-2xx responses

### Testing Details

**Test files:**

```
apps/web/src/components/metrics/
  KpiCard.test.tsx
  MergedPrsChart.test.tsx

apps/web/src/pages/dashboard/
  DashboardPage.test.tsx

apps/web/src/hooks/
  useMergeFrequency.test.ts
```

**MSW handlers to add** (`apps/web/src/mocks/handlers.ts`):
```typescript
http.get('/api/v1/organizations/:orgId/metrics/merge-frequency', () =>
  HttpResponse.json({
    data: [
      { period: '2026-01-01', count: 5 },
      { period: '2026-01-08', count: 8 },
    ],
  })
)
```

**`KpiCard.test.tsx`** (React Testing Library):
- `isLoading=true` → renders `Skeleton`, not the value
- `value=42, delta=12` → renders "42" and "+12% vs prev period" with green color
- `value=42, delta=-5` → renders "-5% vs prev period" with red color
- `value=0, delta=null` → renders "0" with no delta badge

**`MergedPrsChart.test.tsx`**:
- `isEmpty=true` → renders empty state message
- `isLoading=true` → renders `Skeleton`
- `data=[{ period: '2026-01-01', count: 5 }]` → chart container renders (assert no error thrown; Nivo renders to canvas/SVG)

**`DashboardPage.test.tsx`**:
- Wrap in `MemoryRouter`, `QueryClientProvider`, MSW server
- Renders KPI card with value from mock API response (`5 + 8 = 13`)
- Changes `from` param in URL → `useMergeFrequency` refetches with new params (assert query key changes via `react-query` devtools or by checking fetch call count with MSW)
- While loading: KPI card shows skeleton

**`useMergeFrequency.test.ts`**:
- Returns data from mock API handler
- `enabled: false` when `orgId` is null — assert fetch not called

**MSW setup:** `apps/web/src/mocks/server.ts` (for Node/Vitest), `apps/web/src/mocks/browser.ts` (for dev mode).

### Definition of Done

- [ ] KPI card showing: total PRs merged in selected date range, with delta vs previous period (e.g., "+12% vs last week")
- [ ] Bar chart (Nivo) showing PRs merged per day/week/month (matches `groupBy` from filter)
- [ ] Data fetched via TanStack Query hook calling `GET /organizations/:orgId/metrics/merge-frequency`
- [ ] Loading state: skeleton placeholder while data loads
- [ ] Empty state: meaningful message when no PRs exist yet ("Install the GitHub App to start tracking")
- [ ] Chart responds to filter changes (date range, repositories) without full page reload
- [ ] Test: with mock API data, card and chart render correctly

---

## US-019: Pull Requests List Page

Build the pull requests list page with MUI X DataGrid.

**Parallel:** After US-015 (API) and US-017 (shell) are done.

**Recommended Agents:** `react-specialist`, `frontend-developer`

### Implementation Details

**Files to create:**

```
apps/web/src/api/pull-requests/
  pull-requests.api.ts
  pull-requests.types.ts

apps/web/src/hooks/
  usePullRequests.ts

apps/web/src/components/tables/
  PullRequestsGrid.tsx
  PullRequestStatusIcon.tsx
  CycleTimeCell.tsx
  LinesChangedCell.tsx
  models/
    pull-request-grid.types.ts

apps/web/src/pages/pull-requests/
  PullRequestsPage.tsx
```

**`pull-requests.types.ts`**:
```typescript
export interface PullRequestDto {
  id: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  additions: number;
  deletions: number;
  changedFiles: number;
  repositoryId: string;
  authorId: string | null;
  githubCreatedAt: string;
  mergedAt: string | null;
  cycleTime?: {
    totalSeconds: number | null;
  };
}

export interface PullRequestsPage {
  data: PullRequestDto[];
  nextCursor: string | null;
}

export interface PullRequestsQueryParams {
  repoId: string;
  from?: string;
  to?: string;
  state?: string;
  cursor?: string;
  limit?: number;
}
```

**`pull-requests.api.ts`**:
```typescript
export async function fetchPullRequests(
  params: PullRequestsQueryParams,
): Promise<PullRequestsPage>
```

**`usePullRequests.ts`** (TanStack Query with cursor pagination):
```typescript
export function usePullRequests(params: Omit<PullRequestsQueryParams, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: ['pullRequests', params],
    queryFn: ({ pageParam }) =>
      fetchPullRequests({ ...params, cursor: pageParam ?? undefined }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    enabled: !!params.repoId,
  });
}
```

**`models/pull-request-grid.types.ts`**:
```typescript
export type PullRequestRow = PullRequestDto & {
  repoName: string;
  authorLogin: string | null;
  cycleTimeDisplay: string;
};
```

**`PullRequestStatusIcon.tsx`** — maps `state` to a MUI icon:
- `merged` → `MergeIcon` (purple)
- `open` → `RadioButtonUncheckedIcon` (green)
- `closed` → `CancelIcon` (red)

**`CycleTimeCell.tsx`** — formats `totalSeconds` to human-readable: "2d 4h", "45m", or "—" if null.

**`LinesChangedCell.tsx`** — renders `+{additions}` in green and `-{deletions}` in red side by side.

**`PullRequestsGrid.tsx`**:
- MUI X `DataGrid` (Community edition)
- `columns` definition:
  - `status`: renders `PullRequestStatusIcon`, width 60, sortable
  - `title`: renders `Link` to `row.url` (`target="_blank" rel="noopener"`), flex 1, sortable
  - `repo`: `row.repoName`, width 160, sortable
  - `author`: `row.authorLogin`, width 120, sortable
  - `cycleTime`: renders `CycleTimeCell`, width 120, sortable by `cycleTime.totalSeconds`
  - `linesChanged`: renders `LinesChangedCell`, width 130, not sortable
  - `mergedAt`: `valueFormatter` formats ISO string to locale date, width 120, sortable
- `loading` prop: when `isFetchingNextPage` or `isLoading` — shows DataGrid built-in `LinearProgress` slot overlay
- Empty state: `slots.noRowsOverlay` renders a custom component with "No pull requests match your filters"
- Pagination: custom footer with "Load more" button that calls `fetchNextPage()` from `useInfiniteQuery`; button hidden when `!hasNextPage`
- `rows` flattened from `data.pages`: `pages.flatMap(p => p.data)`
- `sortingMode="client"` (client-side sort across loaded pages)

**`PullRequestsPage.tsx`**:
- Reads `from`, `to`, `repositories` from `useFilterParams()`
- Passes first repository ID from `repositories` filter to `usePullRequests` (or iterates if multi-repo needed in future)
- Renders `PullRequestsGrid`
- Page title "Pull Requests" in the content area header

**Note on multi-repo:** For this epic, `PullRequestsPage` fetches PRs per repository. If no repository filter is selected, shows an instructional empty state ("Select a repository from the filter bar"). This is the YAGNI-safe scope; cross-repo pagination is deferred.

### Testing Details

**Test files:**

```
apps/web/src/components/tables/
  PullRequestsGrid.test.tsx
  PullRequestStatusIcon.test.tsx
  CycleTimeCell.test.tsx
  LinesChangedCell.test.tsx

apps/web/src/pages/pull-requests/
  PullRequestsPage.test.tsx

apps/web/src/hooks/
  usePullRequests.test.ts
```

**MSW handlers to add**:
```typescript
http.get('/api/v1/repositories/:repoId/pull-requests', ({ request }) => {
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  if (!cursor) {
    return HttpResponse.json({
      data: pullRequestFixtures.slice(0, 10),
      nextCursor: 'cursor-page-2',
    });
  }
  return HttpResponse.json({
    data: pullRequestFixtures.slice(10, 15),
    nextCursor: null,
  });
})
```

**`PullRequestsGrid.test.tsx`** (React Testing Library):
- Renders 10 rows from fixture data
- PR title cell contains an `<a>` with `href` equal to the PR's GitHub URL and `target="_blank"`
- "Load more" button present when `hasNextPage=true`, absent when `hasNextPage=false`
- Clicking "Load more" calls `fetchNextPage` (spy via mock)
- `isLoading=true` → LinearProgress overlay visible
- Empty `rows=[]` → custom no-rows overlay with expected message

**`PullRequestStatusIcon.test.tsx`**:
- `state="merged"` → renders `MergeIcon`
- `state="open"` → renders `RadioButtonUncheckedIcon`
- `state="closed"` → renders `CancelIcon`

**`CycleTimeCell.test.tsx`**:
- `totalSeconds=86400` → renders "1d 0h"
- `totalSeconds=3600` → renders "1h 0m"
- `totalSeconds=null` → renders "—"

**`LinesChangedCell.test.tsx`**:
- `additions=50, deletions=20` → renders "+50" and "-20"

**`PullRequestsPage.test.tsx`**:
- No repository in filter → renders instructional empty state
- With repository in filter → renders `PullRequestsGrid` with data from MSW handler
- Filter change → query key changes, new fetch triggered

**Fixture file:** `apps/web/src/mocks/fixtures/pull-requests.fixtures.ts` — 15 `PullRequestDto` objects with varied states, cycle times, and line counts.

### Definition of Done

- [ ] MUI X DataGrid displays PRs with columns: Status (icon), Title (links to GitHub), Repo, Author, Cycle Time, Lines Changed (+/-), Merged At
- [ ] Sorting by any column
- [ ] Cursor-based pagination integrated (next/previous page buttons)
- [ ] Clicking a PR title opens the GitHub URL in a new tab
- [ ] Respects global filters (date range, repositories)
- [ ] Loading state: DataGrid skeleton
- [ ] Empty state: message when no PRs match filters
