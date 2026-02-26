# Epic 9: Commit Analytics (Weeks 9-10)

---

## US-032: Commit List Page + API

Expose a paginated commit list API for a given repository and render it in a dedicated commits page using MUI X DataGrid.

**Parallel:** After Epic 8 (commits table and join table already exist from US-003 schema).

**Recommended Agents:** `backend-developer`, `react-specialist`

---

### Implementation Details

**Backend — commits module**

Create a `commits` NestJS module following the established `module → controller → service → repository → /models/` pattern.

```
apps/api/src/commits/
  commits.module.ts
  commits.controller.ts
  commits.service.ts
  commits.repository.ts
  models/
    commit.model.ts               # Prisma → API response shape
    commit-query.model.ts         # validated query params (cursor, limit, fromDate, toDate)
```

**`commits/models/commit.model.ts`**

Defines the response shape independently from the Prisma-generated type. This keeps the API contract stable even if the DB schema evolves.

```typescript
// apps/api/src/commits/models/commit.model.ts
export interface CommitResponse {
  id: string;
  sha: string;
  shortSha: string;         // first 7 characters of sha
  message: string;
  committedAt: string;      // ISO 8601
  repositoryId: string;
  repositoryFullName: string;
  author: {
    id: string;
    login: string;
    avatarUrl: string | null;
  } | null;
  additions: number;
  deletions: number;
}
```

**`commits/models/commit-query.model.ts`**

```typescript
// apps/api/src/commits/models/commit-query.model.ts
import { IsOptional, IsISO8601, IsInt, Max, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CommitQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;            // opaque cursor — base64-encoded committed_at + id

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  @IsOptional()
  @IsISO8601()
  toDate?: string;
}
```

**`commits/commits.repository.ts`**

Handles all DB access for the `commits` table. One class, one model.

Cursor pagination strategy: the cursor encodes `{ committedAt, id }` as a base64 JSON string. The query uses a compound `WHERE` clause — `committedAt < cursorDate OR (committedAt = cursorDate AND id < cursorId)` — so rows are ordered consistently even when multiple commits share the same timestamp.

```typescript
// apps/api/src/commits/commits.repository.ts
@Injectable()
export class CommitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByRepository(
    repositoryId: string,
    params: { cursor?: string; limit: number; fromDate?: Date; toDate?: Date },
  ): Promise<{ commits: CommitWithRelations[]; nextCursor: string | null }> {
    const { cursor, limit, fromDate, toDate } = params;

    const decoded = cursor ? decodeCursor(cursor) : null;

    const where: Prisma.CommitWhereInput = {
      repositoryId,
      ...(fromDate || toDate
        ? { committedAt: { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) } }
        : {}),
      ...(decoded
        ? {
            OR: [
              { committedAt: { lt: decoded.committedAt } },
              { committedAt: decoded.committedAt, id: { lt: decoded.id } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.commit.findMany({
      where,
      orderBy: [{ committedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { author: true, repository: true },
    });

    const hasNextPage = rows.length > limit;
    const data = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasNextPage ? encodeCursor({ committedAt: data[data.length - 1].committedAt, id: data[data.length - 1].id }) : null;

    return { commits: data, nextCursor };
  }
}

function encodeCursor(payload: { committedAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ committedAt: payload.committedAt.toISOString(), id: payload.id })).toString('base64url');
}

function decodeCursor(cursor: string): { committedAt: Date; id: string } {
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  return { committedAt: new Date(parsed.committedAt), id: parsed.id };
}
```

**`commits/commits.service.ts`**

Orchestrates the repository call and maps DB rows to `CommitResponse`. No business logic leaks into the controller; no DB access leaks into the service.

```typescript
// apps/api/src/commits/commits.service.ts
@Injectable()
export class CommitsService {
  constructor(private readonly commitsRepository: CommitsRepository) {}

  async listByRepository(
    repositoryId: string,
    query: CommitQueryDto,
  ): Promise<PaginatedResponse<CommitResponse>> {
    const limit = query.limit ?? 50;
    const { commits, nextCursor } = await this.commitsRepository.findByRepository(repositoryId, {
      cursor: query.cursor,
      limit,
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
    });

    return {
      data: commits.map(toCommitResponse),
      pagination: { nextCursor, hasNextPage: nextCursor !== null },
    };
  }
}

function toCommitResponse(commit: CommitWithRelations): CommitResponse {
  return {
    id: commit.id,
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    message: commit.message,
    committedAt: commit.committedAt.toISOString(),
    repositoryId: commit.repositoryId,
    repositoryFullName: commit.repository.fullName,
    author: commit.author
      ? { id: commit.author.id, login: commit.author.login, avatarUrl: commit.author.avatarUrl }
      : null,
    additions: commit.additions,
    deletions: commit.deletions,
  };
}
```

**`commits/commits.controller.ts`**

```typescript
// apps/api/src/commits/commits.controller.ts
@Controller('repositories/:repoId/commits')
export class CommitsController {
  constructor(private readonly commitsService: CommitsService) {}

  @Get()
  listCommits(
    @Param('repoId') repoId: string,
    @Query() query: CommitQueryDto,
  ): Promise<PaginatedResponse<CommitResponse>> {
    return this.commitsService.listByRepository(repoId, query);
  }
}
```

Full endpoint: `GET /api/v1/repositories/:repoId/commits?cursor=&limit=&fromDate=&toDate=`

**Frontend — commit list page**

Reuse the existing MUI X DataGrid pattern established for the PR list. The commits page lives at `/commits` and uses a global filter bar (date range + repo selector from Zustand `useFilterStore`).

```
apps/web/src/
  api/
    commits.api.ts              # fetch functions — listCommits, listCommitFrequency
  hooks/
    useCommits.ts               # TanStack Query hook wrapping commits.api.ts
  pages/
    CommitsPage.tsx             # page shell — filter bar + CommitDataGrid
  components/
    commits/
      CommitDataGrid.tsx        # MUI X DataGrid for commits
      CommitShaCell.tsx         # renders short SHA as a GitHub link
```

**`api/commits.api.ts`**

```typescript
// apps/web/src/api/commits.api.ts
import type { CommitResponse, PaginatedResponse } from '@repo/shared';
import { apiClient } from './api-client';

export interface ListCommitsParams {
  repoId: string;
  cursor?: string;
  limit?: number;
  fromDate?: string;
  toDate?: string;
}

export async function listCommits(params: ListCommitsParams): Promise<PaginatedResponse<CommitResponse>> {
  const { repoId, ...query } = params;
  const { data } = await apiClient.get(`/repositories/${repoId}/commits`, { params: query });
  return data;
}
```

**`hooks/useCommits.ts`**

Uses TanStack Query `useInfiniteQuery` so the DataGrid can load subsequent pages without replacing the current page.

```typescript
// apps/web/src/hooks/useCommits.ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { listCommits } from '@/api/commits.api';
import { useFilterStore } from '@/store/filter.store';

export function useCommits(repoId: string) {
  const { fromDate, toDate } = useFilterStore();

  return useInfiniteQuery({
    queryKey: ['commits', repoId, fromDate, toDate],
    queryFn: ({ pageParam }) =>
      listCommits({ repoId, cursor: pageParam as string | undefined, fromDate: fromDate ?? undefined, toDate: toDate ?? undefined }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
  });
}
```

**`components/commits/CommitDataGrid.tsx`**

Column definitions follow the same shape as the PR DataGrid. The SHA column renders `CommitShaCell` which wraps the short SHA in an `<a>` tag pointing to `https://github.com/<repoFullName>/commit/<sha>`.

```typescript
const columns: GridColDef<CommitResponse>[] = [
  {
    field: 'sha',
    headerName: 'SHA',
    width: 100,
    renderCell: ({ row }) => <CommitShaCell sha={row.sha} repoFullName={row.repositoryFullName} />,
    sortable: false,
  },
  { field: 'message', headerName: 'Message', flex: 1, sortable: false },
  {
    field: 'author',
    headerName: 'Author',
    width: 150,
    valueGetter: (_, row) => row.author?.login ?? '—',
    sortable: false,
  },
  {
    field: 'committedAt',
    headerName: 'Date',
    width: 180,
    valueFormatter: (value: string) => new Date(value).toLocaleString(),
  },
  { field: 'additions', headerName: '+', width: 70, type: 'number' },
  { field: 'deletions', headerName: '-', width: 70, type: 'number' },
];
```

All pages from `useInfiniteQuery` are flattened into a single `rows` array so the DataGrid renders them all at once. A "Load more" button at the bottom of the grid triggers `fetchNextPage` when the cursor exists.

---

### Testing Details

**Backend test files:**

```
apps/api/src/commits/commits.repository.spec.ts     # unit test
apps/api/src/commits/commits.service.spec.ts        # unit test
apps/api/src/commits/commits.controller.spec.ts     # unit test
apps/api/test/commits.e2e-spec.ts                   # integration test
```

**Seed data for tests**

Add to `apps/api/prisma/seed.ts` (idempotent upserts):

```typescript
// 10 commits on seed-repo, spread across 30 days
// commits[0]: committed_at = 2026-01-30, sha = 'abc0001...'
// commits[9]: committed_at = 2026-01-01, sha = 'abc0010...'
// All authored by seed-user
// commits[0..4]: linked to seed PR via pull_request_commits join
```

**`commits.repository.spec.ts` — unit test**

Mock `PrismaService` with `jest.fn()` per method. Do not touch a real database.

Scenarios:
- `findByRepository` with no cursor calls `prisma.commit.findMany` with the correct `orderBy` and `take: limit + 1`
- With a valid base64url cursor, the `OR` compound filter is included in `where`
- When `rows.length === limit + 1`, `nextCursor` is non-null and the returned data has exactly `limit` items
- When `rows.length <= limit`, `nextCursor` is `null`
- `fromDate` and `toDate` are translated to `committedAt: { gte, lte }` predicates

**`commits.service.spec.ts` — unit test**

Mock `CommitsRepository`. Verify the mapping from DB rows to `CommitResponse`:
- `shortSha` is the first 7 characters of `sha`
- `author` is `null` when the commit has no linked contributor
- `committedAt` is serialized as a valid ISO 8601 string
- `PaginatedResponse` shape has `data` and `pagination` keys

**`commits.controller.spec.ts` — unit test**

Mock `CommitsService`. Use `NestJS Test.createTestingModule`.

Scenarios:
- `GET /repositories/:repoId/commits` delegates to `commitsService.listByRepository` with the correct `repoId` and query params
- Invalid `limit` value (e.g., `limit=0`) returns `400` — validation pipe is active

**`commits.e2e-spec.ts` — integration test**

Runs against a real test database seeded with the commits seed data.

Scenarios:
- `GET /api/v1/repositories/:repoId/commits` returns `200` with a `data` array and `pagination` object
- Response contains exactly `limit` items when more rows exist; `pagination.hasNextPage` is `true`
- Passing the returned `nextCursor` as `cursor` in the next request returns the subsequent page without duplicates
- `fromDate=2026-01-15&toDate=2026-01-30` filters correctly — only commits in that window are returned
- A non-existent `repoId` returns an empty `data` array with `hasNextPage: false`

**Frontend test files:**

```
apps/web/src/hooks/useCommits.spec.ts               # unit test
apps/web/src/components/commits/CommitDataGrid.spec.tsx   # unit test
apps/web/src/components/commits/CommitShaCell.spec.tsx    # unit test
```

**`useCommits.spec.ts`**

Use `renderHook` with a `QueryClientProvider` wrapper. Mock `listCommits` via `vi.mock('@/api/commits.api')`.

Scenarios:
- On mount, `listCommits` is called with the active `repoId`, `fromDate`, and `toDate` from the filter store
- When the filter store date range changes, the query key updates and a new fetch is triggered
- `fetchNextPage` passes the `nextCursor` from the previous page as the `cursor` param

**`CommitDataGrid.spec.tsx`**

Render with a fixed array of `CommitResponse` fixtures.

Scenarios:
- 5 commit rows render with correct SHA, message, author, and date values
- SHA cell renders an `<a>` element with `href` containing the sha and repository full name
- When `hasNextPage` is `true`, "Load more" button is visible
- When `hasNextPage` is `false`, "Load more" button is absent

---

### Definition of Done

- [ ] `GET /api/v1/repositories/:repoId/commits` — paginated commit list with cursor pagination
- [ ] Commit list page with columns: SHA (links to GitHub), Message, Author, Date, Repo
- [ ] Sorting and date range filtering

---

## US-033: Commit Frequency Heatmap

Render a calendar-style heatmap showing daily commit frequency using Apache ECharts. Embed the heatmap on both the contributor detail page and the repository detail page.

**Parallel:** After US-032.

**Recommended Agents:** `react-specialist`, `ui-designer`

---

### Implementation Details

**Backend — commit frequency endpoint**

Add a dedicated aggregate endpoint rather than computing frequency on the frontend. This keeps the data transfer small (365 numbers vs. thousands of commit records) and allows the DB to do the grouping efficiently.

New endpoint on the commits controller:

```
GET /api/v1/repositories/:repoId/commits/frequency?fromDate=&toDate=
GET /api/v1/contributors/:contributorId/commits/frequency?fromDate=&toDate=
```

Add a `CommitFrequencyQueryDto` model:

```typescript
// apps/api/src/commits/models/commit-frequency-query.model.ts
export class CommitFrequencyQueryDto {
  @IsISO8601()
  fromDate: string;

  @IsISO8601()
  toDate: string;
}
```

Add a `CommitFrequencyResponse` model:

```typescript
// apps/api/src/commits/models/commit-frequency.model.ts
export interface CommitFrequencyEntry {
  date: string;   // 'YYYY-MM-DD'
  count: number;
}

export interface CommitFrequencyResponse {
  entries: CommitFrequencyEntry[];
  maxCount: number;   // pre-computed max — used by ECharts to set heatmap range
}
```

**`commits.repository.ts` — new method**

Uses a raw SQL aggregate via Prisma's `$queryRaw` to group by day in the repository's timezone (UTC for now):

```typescript
async getFrequencyByRepository(
  repositoryId: string,
  fromDate: Date,
  toDate: Date,
): Promise<CommitFrequencyEntry[]> {
  const rows = await this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT
      DATE(committed_at AT TIME ZONE 'UTC') AS date,
      COUNT(*)::bigint                       AS count
    FROM commits
    WHERE repository_id = ${repositoryId}
      AND committed_at >= ${fromDate}
      AND committed_at <= ${toDate}
    GROUP BY DATE(committed_at AT TIME ZONE 'UTC')
    ORDER BY date ASC
  `;
  return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
}

async getFrequencyByContributor(
  contributorId: string,
  fromDate: Date,
  toDate: Date,
): Promise<CommitFrequencyEntry[]> {
  const rows = await this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT
      DATE(committed_at AT TIME ZONE 'UTC') AS date,
      COUNT(*)::bigint                       AS count
    FROM commits
    WHERE author_id = ${contributorId}
      AND committed_at >= ${fromDate}
      AND committed_at <= ${toDate}
    GROUP BY DATE(committed_at AT TIME ZONE 'UTC')
    ORDER BY date ASC
  `;
  return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
}
```

**`commits.service.ts` — new method**

```typescript
async getCommitFrequency(
  params: { repositoryId?: string; contributorId?: string },
  query: CommitFrequencyQueryDto,
): Promise<CommitFrequencyResponse> {
  const fromDate = new Date(query.fromDate);
  const toDate = new Date(query.toDate);

  const entries = params.repositoryId
    ? await this.commitsRepository.getFrequencyByRepository(params.repositoryId, fromDate, toDate)
    : await this.commitsRepository.getFrequencyByContributor(params.contributorId!, fromDate, toDate);

  const maxCount = entries.reduce((max, e) => Math.max(max, e.count), 0);
  return { entries, maxCount };
}
```

**`commits.controller.ts` — new routes**

```typescript
@Get('frequency')
getRepoFrequency(
  @Param('repoId') repoId: string,
  @Query() query: CommitFrequencyQueryDto,
): Promise<CommitFrequencyResponse> {
  return this.commitsService.getCommitFrequency({ repositoryId: repoId }, query);
}
```

A second controller handles the contributor-scoped route inside the future `contributors` module. For now, the repository-scoped route is sufficient and the contributor-scoped route is wired up as part of US-034/US-035 (Epic 10). Use a shared `CommitsService` injection — do not duplicate the service.

**Frontend — ECharts calendar heatmap component**

```
apps/web/src/
  api/
    commits.api.ts              # add listCommitFrequency function (extend existing file)
  hooks/
    useCommitFrequency.ts       # TanStack Query hook
  components/
    commits/
      CommitHeatmap.tsx         # ECharts calendar heatmap — reusable, accepts entries + maxCount
```

**`api/commits.api.ts` — extended**

```typescript
export interface ListCommitFrequencyParams {
  repoId?: string;
  contributorId?: string;
  fromDate: string;
  toDate: string;
}

export async function listCommitFrequency(
  params: ListCommitFrequencyParams,
): Promise<CommitFrequencyResponse> {
  const { repoId, contributorId, ...query } = params;
  const basePath = repoId
    ? `/repositories/${repoId}/commits/frequency`
    : `/contributors/${contributorId}/commits/frequency`;
  const { data } = await apiClient.get(basePath, { params: query });
  return data;
}
```

**`hooks/useCommitFrequency.ts`**

```typescript
// apps/web/src/hooks/useCommitFrequency.ts
import { useQuery } from '@tanstack/react-query';
import { listCommitFrequency } from '@/api/commits.api';

export function useCommitFrequency(params: ListCommitFrequencyParams) {
  return useQuery({
    queryKey: ['commitFrequency', params],
    queryFn: () => listCommitFrequency(params),
    enabled: Boolean(params.repoId || params.contributorId),
  });
}
```

**`components/commits/CommitHeatmap.tsx`**

Wraps Apache ECharts' built-in calendar heatmap. The component takes `entries`, `maxCount`, and `year` as props — it has no data-fetching responsibility. The parent page calls `useCommitFrequency` and passes results down.

```typescript
// apps/web/src/components/commits/CommitHeatmap.tsx
import ReactECharts from 'echarts-for-react';
import type { CommitFrequencyEntry } from '@repo/shared';

interface CommitHeatmapProps {
  entries: CommitFrequencyEntry[];
  maxCount: number;
  year: number;
}

export function CommitHeatmap({ entries, maxCount, year }: CommitHeatmapProps) {
  const option = {
    tooltip: {
      formatter: (params: { data: [string, number] }) =>
        `${params.data[0]}: ${params.data[1]} commit${params.data[1] !== 1 ? 's' : ''}`,
    },
    visualMap: {
      min: 0,
      max: maxCount || 1,
      inRange: { color: ['#ebedf0', '#216e39'] },  // GitHub-style green gradient
      show: false,
    },
    calendar: {
      range: String(year),
      cellSize: ['auto', 14],
      itemStyle: { borderWidth: 2, borderColor: '#fff' },
      yearLabel: { show: true },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: entries.map((e) => [e.date, e.count]),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 160, width: '100%' }} />;
}
```

**Integration into existing pages**

On `RepositoryDetailPage`: place `CommitHeatmap` below the summary KPI cards, defaulting to the current year. On `ContributorDetailPage` (added in Epic 10): same placement. Both pages pass `fromDate` and `toDate` derived from `new Date(year, 0, 1)` and `new Date(year, 11, 31)` unless overridden by the global filter store.

---

### Testing Details

**Backend test files:**

```
apps/api/src/commits/commits.repository.spec.ts     # extend existing file
apps/api/src/commits/commits.service.spec.ts        # extend existing file
apps/api/test/commits.e2e-spec.ts                   # extend existing file
```

**Seed data additions**

The existing seed data from US-032 (10 commits spread over 30 days) is sufficient. For targeted heatmap testing, add a helper in the integration test that inserts a known daily distribution — e.g., 3 commits on `2026-01-10`, 1 on `2026-01-11`, 0 on all other days — using `prisma.commit.createMany` inside a `beforeAll` block, cleaned up in `afterAll`.

**`commits.repository.spec.ts` — unit tests for frequency methods**

Mock `PrismaService.$queryRaw` to return a controlled array of `{ date, count }` rows.

Scenarios:
- `getFrequencyByRepository` calls `$queryRaw` with the correct `repositoryId`, `fromDate`, and `toDate` bound parameters
- Returned `count` values are converted from `bigint` to `number`
- An empty result set returns an empty array (no null reference errors)
- `getFrequencyByContributor` follows the same assertions for `author_id` filtering

**`commits.service.spec.ts` — unit tests for frequency method**

Mock `CommitsRepository.getFrequencyByRepository` and `getFrequencyByContributor`.

Scenarios:
- When `repositoryId` is provided, `getFrequencyByRepository` is called; `getFrequencyByContributor` is not
- `maxCount` is the highest `count` value in the entries — verified with a fixture of `[{ date: '2026-01-10', count: 3 }, { date: '2026-01-11', count: 1 }]` expecting `maxCount: 3`
- When entries array is empty, `maxCount` is `0`

**`commits.e2e-spec.ts` — integration tests for frequency endpoint**

Scenarios:
- `GET /api/v1/repositories/:repoId/commits/frequency?fromDate=2026-01-01&toDate=2026-01-31` returns `200` with `entries` array and `maxCount`
- Each entry has `date` in `YYYY-MM-DD` format and `count` as a non-negative integer
- Days with no commits are absent from the entries array (sparse representation — the frontend treats missing dates as zero)
- Missing `fromDate` or `toDate` returns `400`

**Frontend test files:**

```
apps/web/src/hooks/useCommitFrequency.spec.ts                 # unit test
apps/web/src/components/commits/CommitHeatmap.spec.tsx        # unit test
```

**`useCommitFrequency.spec.ts`**

Mock `listCommitFrequency` via `vi.mock('@/api/commits.api')`. Use `renderHook` with `QueryClientProvider`.

Scenarios:
- Query is enabled when `repoId` is provided
- Query is enabled when `contributorId` is provided
- Query is disabled when neither `repoId` nor `contributorId` is set
- Query key includes `params` so changing `year` triggers a new fetch

**`CommitHeatmap.spec.tsx`**

Use `vi.mock('echarts-for-react')` to replace `ReactECharts` with a simple `div` that records the `option` prop — avoids canvas rendering in jsdom.

Scenarios:
- Component renders without throwing given a valid `entries` array and `maxCount`
- When `entries` is empty, `visualMap.max` is `1` (guards against `max: 0` which breaks ECharts scale)
- ECharts `option.calendar.range` matches the `year` prop
- `option.series[0].data` maps entries correctly to `[date, count]` tuples
- Tooltip formatter returns the correct singular/plural string ("1 commit" vs. "3 commits")

---

### Definition of Done

- [ ] Calendar-style heatmap (Apache ECharts) showing commit frequency per day
- [ ] Available on contributor detail and repository detail pages
- [ ] Color intensity scales with commit count
- [ ] Tooltip shows exact count on hover
