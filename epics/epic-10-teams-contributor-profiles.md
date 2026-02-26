# Epic 10: Teams & Contributor Profiles (Weeks 10-11)

---

## US-034: Team Management CRUD

Create, list, and manage teams within an organization, including adding and removing team members.

**Parallel:** None within this epic — US-035, US-036, and US-037 all depend on this story or its data model.

**Recommended Agents:** `api-designer`, `backend-developer`

---

### Implementation Details

**Backend folder structure**

```
apps/api/src/teams/
  teams.module.ts
  teams.controller.ts
  teams.service.ts
  teams.repository.ts
  models/
    team.model.ts                  # Team, TeamWithMemberCount response shapes
    team-member.model.ts           # TeamMember, UpdateMembersBody request/response shapes
    create-team.dto.ts             # CreateTeamDto — name: string
    update-members.dto.ts          # UpdateMembersDto — add: string[], remove: string[]
```

**Prisma schema additions**

The `teams` and `team_memberships` tables must be added to `schema.prisma`:

```prisma
model Team {
  id             String           @id @default(uuid()) @db.Uuid
  organizationId String           @db.Uuid
  organization   Organization     @relation(fields: [organizationId], references: [id])
  name           String
  slug           String
  createdAt      DateTime         @default(now()) @db.Timestamptz
  memberships    TeamMembership[]

  @@unique([organizationId, slug])
  @@index([organizationId])
  @@map("teams")
}

model TeamMembership {
  id            String      @id @default(uuid()) @db.Uuid
  teamId        String      @db.Uuid
  team          Team        @relation(fields: [teamId], references: [id], onDelete: Cascade)
  contributorId String      @db.Uuid
  contributor   Contributor @relation(fields: [contributorId], references: [id], onDelete: Cascade)

  @@unique([teamId, contributorId])
  @@index([teamId])
  @@map("team_memberships")
}
```

**Slug generation**

Slug is derived from the team name at creation time. It is never modified after creation. The generation function lives in `teams.service.ts` and must not be duplicated anywhere else:

```typescript
// apps/api/src/teams/teams.service.ts
private generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

If a slug collision occurs within the same organization, the service appends a numeric suffix (`-2`, `-3`, …) by checking the existing slugs via `TeamsRepository.findSlugsByOrg` before inserting.

**`teams.repository.ts`**

The repository handles exactly one DB model: `Team` (and by extension `TeamMembership` which has no independent meaning outside of a team). It must not query `pull_requests`, `commits`, or `pr_reviews` — those belong to other repositories.

```typescript
// Method signatures:
create(organizationId: string, name: string, slug: string): Promise<Team>
findAllByOrg(organizationId: string): Promise<TeamWithMemberCount[]>
findById(teamId: string): Promise<Team | null>
findSlugsByOrg(organizationId: string): Promise<string[]>
addMembers(teamId: string, contributorIds: string[]): Promise<void>
removeMembers(teamId: string, contributorIds: string[]): Promise<void>
findMemberIds(teamId: string): Promise<string[]>
```

`findAllByOrg` uses a Prisma `_count` include to return member counts without a raw query:

```typescript
return this.prisma.team.findMany({
  where: { organizationId },
  include: { _count: { select: { memberships: true } } },
  orderBy: { name: 'asc' },
});
```

`addMembers` uses `createMany` with `skipDuplicates: true` so re-adding an existing member is idempotent.

**`teams.service.ts`**

Orchestrates slug generation and delegates all persistence to `TeamsRepository`. It validates that:
- Organization exists before creating a team (delegates to `OrganizationsRepository` — injected, not called directly from the controller)
- All contributor IDs passed to `addMembers`/`removeMembers` belong to the same organization (queries `ContributorsRepository`)
- The team referenced by `teamId` exists before any member mutation

**`teams.controller.ts`**

```
POST   /api/v1/organizations/:orgId/teams        → createTeam
GET    /api/v1/organizations/:orgId/teams        → listTeams
PUT    /api/v1/teams/:teamId/members             → updateMembers
```

`PUT /teams/:teamId/members` accepts a body with two optional arrays: `add` and `remove`. Both operations are applied in a single service call. If the same contributor ID appears in both arrays, `remove` takes precedence.

**`models/team.model.ts`**

```typescript
// apps/api/src/teams/models/team.model.ts
export interface Team {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface TeamWithMemberCount extends Team {
  memberCount: number;
}
```

**`models/update-members.dto.ts`**

```typescript
// apps/api/src/teams/models/update-members.dto.ts
import { IsArray, IsUUID, IsOptional } from 'class-validator';

export class UpdateMembersDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  add?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  remove?: string[];
}
```

**Frontend folder structure**

```
apps/web/src/
  api/
    teams.api.ts                   # createTeam, listTeams, updateMembers — typed fetch wrappers
  hooks/
    useTeams.ts                    # useQuery wrappers over teams.api.ts
    useUpdateTeamMembers.ts        # useMutation wrapper for PUT /teams/:teamId/members
  components/
    teams/
      CreateTeamDialog.tsx         # MUI Dialog with a single name TextField + submit
      TeamMemberPicker.tsx         # MUI Autocomplete over contributors list for member selection
      TeamListItem.tsx             # single row used in TeamsPage list
  pages/
    TeamsPage.tsx                  # full page: team list + create button
  models/
    team.models.ts                 # Team, TeamWithMemberCount, UpdateMembersPayload interfaces
```

**`apps/web/src/models/team.models.ts`**

Models are separated from component logic per repository guidelines:

```typescript
export interface Team {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
}

export interface CreateTeamPayload {
  name: string;
}

export interface UpdateMembersPayload {
  add?: string[];
  remove?: string[];
}
```

**`TeamsPage.tsx` layout**

The page consists of:
1. A header row with a "Teams" `Typography` heading and a "Create Team" `Button`
2. An MUI `List` of `TeamListItem` components, each showing team name, slug, member count, and an "Edit Members" `IconButton`
3. `CreateTeamDialog` — controlled by a `boolean` state toggle, not a route
4. A `TeamMemberPicker` dialog — opens when "Edit Members" is clicked, pre-populated with current members

**`TeamMemberPicker.tsx`**

Uses MUI `Autocomplete` in `multiple` mode. The options list comes from `GET /api/v1/organizations/:orgId/contributors` (fetched via `useContributors` hook from US-035). Selected contributors are compared against the team's current member IDs to compute `add` and `remove` arrays before calling the mutation.

**Global filter support**

The existing `useFilterStore` `teamIds` array is already wired into the store (from US-005 scaffold). All filter-aware API hooks (pull requests, contributors, commits) must add a `teams` query parameter when `teamIds` is non-empty. This change happens in the respective `*.api.ts` files for each feature, not in this story's API file.

---

### Testing Details

**Backend test file locations**

```
apps/api/src/teams/teams.repository.spec.ts        # unit — mock PrismaService
apps/api/src/teams/teams.service.spec.ts           # unit — mock TeamsRepository
apps/api/src/teams/teams.controller.spec.ts        # unit — mock TeamsService
apps/api/test/teams.integration-spec.ts            # integration — real DB, seeded data
```

**`teams.repository.spec.ts`**

Uses a mock `PrismaService` created with `jest.fn()` stubs. Does not require a database connection.

Scenarios:
- `create` calls `prisma.team.create` with the correct `data` shape including `organizationId`, `name`, and `slug`
- `findAllByOrg` calls `prisma.team.findMany` with `where: { organizationId }` and the `_count` include
- `addMembers` calls `prisma.teamMembership.createMany` with `skipDuplicates: true`
- `removeMembers` calls `prisma.teamMembership.deleteMany` with the correct `where` clause
- `findMemberIds` returns an array of `contributorId` strings extracted from the membership records

**`teams.service.spec.ts`**

Mock `TeamsRepository`, `OrganizationsRepository`, and `ContributorsRepository` using `jest.fn()`. All injected dependencies are provided via `Test.createTestingModule`.

Scenarios:
- `createTeam` generates a slug `'my-team'` from name `'My Team'`
- `createTeam` generates slug `'my-team-2'` when `'my-team'` already exists in `findSlugsByOrg` result
- `createTeam` throws `NotFoundException` when organization does not exist
- `updateMembers` applies both `add` and `remove` in one call
- `updateMembers` throws `NotFoundException` when team does not exist
- `updateMembers` throws `BadRequestException` when a contributor ID is not in the organization

**`teams.controller.spec.ts`**

Scenarios:
- `POST /organizations/:orgId/teams` with `{ name: 'Backend' }` calls `teamsService.createTeam` and returns 201
- `POST /organizations/:orgId/teams` with missing `name` returns 400 (ValidationPipe rejection)
- `GET /organizations/:orgId/teams` returns an array of teams with member counts
- `PUT /teams/:teamId/members` with `{ add: ['uuid-1'] }` calls `teamsService.updateMembers` and returns 200
- `PUT /teams/:teamId/members` with a non-UUID string in `add` returns 400

**`teams.integration-spec.ts`**

Runs against a real test database seeded with 1 organization and 3 contributors.

Scenarios:
- `POST /organizations/:orgId/teams` creates a team and the row exists in `teams` table
- Creating two teams with the same name results in slugs `'backend'` and `'backend-2'`
- `PUT /teams/:teamId/members` with `{ add: ['contributor-id-1', 'contributor-id-2'] }` inserts 2 rows into `team_memberships`
- Calling add with the same contributor ID twice results in exactly 1 `team_memberships` row (idempotency)
- `PUT /teams/:teamId/members` with `{ remove: ['contributor-id-1'] }` deletes only that row
- `GET /organizations/:orgId/teams` returns `memberCount: 1` after adding one member

**Frontend test file locations**

```
apps/web/src/components/teams/CreateTeamDialog.spec.tsx
apps/web/src/components/teams/TeamMemberPicker.spec.tsx
apps/web/src/pages/TeamsPage.spec.tsx
apps/web/src/hooks/useTeams.spec.ts
```

**`CreateTeamDialog.spec.tsx`**

Render the component with `open: true` and a mock `onSubmit` prop.

Scenarios:
- Dialog renders with an empty name `TextField` and a disabled submit button
- Typing a name enables the submit button
- Submitting calls `onSubmit` with the correct `{ name }` payload
- Clearing the name field after typing disables the submit button again

**`TeamMemberPicker.spec.tsx`**

Mock `useContributors` to return a fixed list of 3 contributors.

Scenarios:
- Opens with pre-selected members highlighted in the Autocomplete
- Adding a contributor and saving calls the mutation with `{ add: ['new-id'] }`
- Removing a pre-selected contributor and saving calls the mutation with `{ remove: ['removed-id'] }`
- When both adding and removing, mutation is called with correct `add` and `remove` arrays simultaneously

**`TeamsPage.spec.tsx`**

Mock `useTeams` to return 2 teams. Mock `useCreateTeam` mutation.

Scenarios:
- Page renders a list of 2 team names and their member counts
- Clicking "Create Team" opens `CreateTeamDialog`
- Submitting the dialog calls `createTeam` mutation and closes the dialog on success
- Clicking "Edit Members" for a team opens `TeamMemberPicker` with that team's ID

---

### Definition of Done

- [ ] `POST /api/v1/organizations/:orgId/teams` — create team with name
- [ ] `PUT /api/v1/teams/:teamId/members` — add/remove contributors
- [ ] `GET /api/v1/organizations/:orgId/teams` — list teams with member count
- [ ] Teams page in frontend with create/edit UI
- [ ] Filters across the app support `?teams=` parameter

---

## US-035: Contributors Page + Profiles

Expose a contributors list endpoint with aggregated metrics and build the contributors page with table and card-grid views plus a contributor detail page.

**Parallel:** Can run in parallel with US-036 and US-037 after US-034 is complete.

**Recommended Agents:** `backend-developer`, `react-specialist`, `sql-pro`

---

### Implementation Details

**Backend folder structure**

```
apps/api/src/contributors/
  contributors.module.ts
  contributors.controller.ts
  contributors.service.ts
  contributors.repository.ts
  models/
    contributor.model.ts           # Contributor, ContributorWithMetrics, ContributorDetail
    contributor-filters.model.ts   # ContributorFiltersDto — teamIds, fromDate, toDate
```

**`contributors.repository.ts`**

The repository is scoped to the `contributors` table and its aggregations. It must not contain business logic.

```typescript
// Method signatures:
findAllWithMetrics(organizationId: string, filters: ContributorFilters): Promise<ContributorWithMetrics[]>
findById(contributorId: string): Promise<Contributor | null>
findActivityTimeline(contributorId: string, organizationId: string): Promise<ActivityEvent[]>
findCommitHeatmap(contributorId: string, organizationId: string): Promise<CommitHeatmapDay[]>
findPrHistory(contributorId: string, organizationId: string, filters: PaginationParams): Promise<PaginatedResult<PrSummary>>
```

**`findAllWithMetrics` aggregation query**

This is the most complex query in the feature. It uses a Prisma `$queryRaw` with a CTE to aggregate across `pull_requests`, `pr_reviews`, and `commits` tables. The raw SQL approach is necessary because Prisma's type-safe API cannot express the conditional aggregations needed here:

```sql
-- Template for findAllWithMetrics
WITH org_contributors AS (
  SELECT DISTINCT c.id, c.login, c.name, c.avatar_url
  FROM contributors c
  JOIN pull_requests pr ON pr.author_id = c.id
  JOIN repositories r ON pr.repository_id = r.id
  WHERE r.organization_id = $1
    AND ($2::uuid[] IS NULL OR c.id = ANY($2::uuid[]))   -- team filter via subquery
    AND ($3::timestamptz IS NULL OR pr.github_created_at >= $3)
    AND ($4::timestamptz IS NULL OR pr.github_created_at <= $4)
),
pr_metrics AS (
  SELECT
    pr.author_id                             AS contributor_id,
    COUNT(*) FILTER (WHERE pr.state = 'merged')  AS prs_merged,
    SUM(pr.additions)                        AS lines_added,
    SUM(pr.deletions)                        AS lines_removed,
    AVG(
      EXTRACT(EPOCH FROM (pr.merged_at - pr.first_commit_at)) / 3600.0
    ) FILTER (WHERE pr.merged_at IS NOT NULL AND pr.first_commit_at IS NOT NULL)
                                             AS avg_cycle_time_hours
  FROM pull_requests pr
  JOIN repositories r ON pr.repository_id = r.id
  WHERE r.organization_id = $1
  GROUP BY pr.author_id
),
review_metrics AS (
  SELECT
    rv.reviewer_id                           AS contributor_id,
    COUNT(*)                                 AS reviews_given,
    AVG(
      EXTRACT(EPOCH FROM (rv.submitted_at - pr.github_created_at)) / 3600.0
    )                                        AS avg_review_time_hours
  FROM pr_reviews rv
  JOIN pull_requests pr ON rv.pull_request_id = pr.id
  JOIN repositories r ON pr.repository_id = r.id
  WHERE r.organization_id = $1
  GROUP BY rv.reviewer_id
)
SELECT
  oc.id, oc.login, oc.name, oc.avatar_url,
  COALESCE(pm.prs_merged, 0)              AS "prsMerged",
  COALESCE(pm.lines_added, 0)             AS "linesAdded",
  COALESCE(pm.lines_removed, 0)           AS "linesRemoved",
  COALESCE(rv.reviews_given, 0)           AS "reviewsGiven",
  pm.avg_cycle_time_hours                 AS "avgCycleTimeHours",
  rv.avg_review_time_hours                AS "avgReviewTimeHours"
FROM org_contributors oc
LEFT JOIN pr_metrics pm ON pm.contributor_id = oc.id
LEFT JOIN review_metrics rv ON rv.contributor_id = oc.id
ORDER BY "prsMerged" DESC;
```

When `teamIds` filter is provided, a subquery is injected into the CTE to restrict `org_contributors` to members of those teams via `team_memberships`.

**`findCommitHeatmap`**

Returns commit counts grouped by calendar day for the past 52 weeks (364 days). Uses `DATE_TRUNC('day', committed_at)` grouped result. The result is a sparse array — days with 0 commits are not returned; the frontend fills gaps.

**`models/contributor.model.ts`**

```typescript
// apps/api/src/contributors/models/contributor.model.ts
export interface Contributor {
  id: string;
  githubId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface ContributorWithMetrics extends Contributor {
  prsMerged: number;
  linesAdded: number;
  linesRemoved: number;
  reviewsGiven: number;
  avgCycleTimeHours: number | null;
  avgReviewTimeHours: number | null;
}

export interface ActivityEvent {
  type: 'pr_opened' | 'pr_merged' | 'review_given' | 'commit_pushed';
  title: string;
  url: string;
  occurredAt: string;
}

export interface CommitHeatmapDay {
  date: string;   // ISO date string: "2025-11-04"
  count: number;
}
```

**`contributors.controller.ts`**

```
GET /api/v1/organizations/:orgId/contributors          → listContributors (with filter query params)
GET /api/v1/organizations/:orgId/contributors/:contributorId         → getContributorDetail
GET /api/v1/organizations/:orgId/contributors/:contributorId/heatmap → getCommitHeatmap
GET /api/v1/organizations/:orgId/contributors/:contributorId/activity → getActivityTimeline
GET /api/v1/organizations/:orgId/contributors/:contributorId/pull-requests → getContributorPrHistory
```

All list endpoints accept `?fromDate=`, `?toDate=`, and `?teams=` (comma-separated team IDs) query parameters. The `getContributorPrHistory` endpoint also accepts `?page=` and `?limit=` for pagination.

**Frontend folder structure**

```
apps/web/src/
  api/
    contributors.api.ts            # typed fetch wrappers for all contributor endpoints
  hooks/
    useContributors.ts             # useQuery for contributors list with metrics
    useContributorDetail.ts        # useQuery for contributor detail page data
    useCommitHeatmap.ts            # useQuery for heatmap data
  components/
    contributors/
      ContributorsTable.tsx        # MUI X DataGrid — one row per contributor
      ContributorCard.tsx          # card with avatar, name, metric badges, sparkline
      ContributorCardGrid.tsx      # responsive CSS grid of ContributorCard
      ViewToggle.tsx               # table/grid icon toggle buttons (shared component)
      CommitHeatmap.tsx            # 52-week SVG heatmap (Nivo Calendar or custom SVG)
      ActivityTimeline.tsx         # MUI Timeline component showing recent events
      ContributorPrHistory.tsx     # paginated table of the contributor's PRs
  pages/
    ContributorsPage.tsx           # list page: table + card grid toggle
    ContributorDetailPage.tsx      # detail page: heatmap + timeline + PR history
  models/
    contributor.models.ts          # mirrors backend models — Contributor, ContributorWithMetrics, etc.
```

**`ContributorsPage.tsx`**

State: a single `viewMode: 'table' | 'grid'` value stored in local `useState` (not Zustand — it is UI-only and does not persist across navigation).

Layout:
1. Page header with "Contributors" heading and `ViewToggle` on the right
2. When `viewMode === 'table'`: renders `ContributorsTable`
3. When `viewMode === 'grid'`: renders `ContributorCardGrid`
4. Both views read from the same `useContributors` hook, so data is not re-fetched on toggle

**`ContributorsTable.tsx`**

MUI X DataGrid columns:
- Avatar + Login (combined `renderCell` — avatar `<img>` + link)
- PRs Merged (numeric, right-aligned)
- Lines Added (green text)
- Lines Removed (red text)
- Reviews Given (numeric)
- Avg Cycle Time (formatted as `"4.2h"` or `"—"` if null)
- Avg Review Time (formatted as `"1.8h"` or `"—"` if null)

Clicking a row navigates to `/contributors/:contributorId`.

**`ContributorCard.tsx`**

Displays: avatar, login name, PRs Merged metric chip, Lines +/- metric chip, and a Nivo `ResponsiveLine` sparkline of the contributor's weekly PR merge count over the last 12 weeks. The sparkline data comes from the `prsMerged` field in the contributor metrics but requires a separate call to a weekly breakdown endpoint — if that endpoint does not exist yet, the sparkline is omitted (YAGNI).

**`ContributorDetailPage.tsx`**

Route: `/contributors/:contributorId`. Composed of four sections, each in its own component:
1. Header row: avatar, name/login, GitHub profile link
2. `CommitHeatmap` — 52-week grid using Nivo `ResponsiveCalendar` or a lightweight SVG implementation
3. `ActivityTimeline` — chronological list of PR opens, merges, reviews, and commits, limited to the last 30 events
4. `ContributorPrHistory` — paginated DataGrid of the contributor's PRs with title, repository, state, additions, deletions, cycle time, and merged date

**`router/routes.tsx` additions**

```tsx
{ path: 'contributors', element: <ContributorsPage /> },
{ path: 'contributors/:contributorId', element: <ContributorDetailPage /> },
```

---

### Testing Details

**Backend test file locations**

```
apps/api/src/contributors/contributors.repository.spec.ts
apps/api/src/contributors/contributors.service.spec.ts
apps/api/src/contributors/contributors.controller.spec.ts
apps/api/test/contributors.integration-spec.ts
```

**`contributors.repository.spec.ts`**

Mocks `PrismaService.$queryRaw` and the type-safe Prisma methods.

Scenarios:
- `findAllWithMetrics` calls `$queryRaw` with the organization ID parameter
- With `teamIds` filter provided, the query template includes the team membership subquery (inspect the SQL string passed to `$queryRaw`)
- `findById` calls `prisma.contributor.findUnique` with the correct `where` clause
- `findCommitHeatmap` returns an array of `{ date, count }` objects
- `findActivityTimeline` returns events ordered by `occurredAt` descending

**`contributors.integration-spec.ts`**

Seeds the test database with: 1 organization, 2 repositories, 3 contributors, 10 pull requests (varied states: open/merged), 5 pr_reviews, 15 commits, 2 teams with 2 members each.

Scenarios:
- `GET /organizations/:orgId/contributors` returns all 3 contributors
- Each contributor in the response has non-negative `prsMerged`, `linesAdded`, `linesRemoved`, `reviewsGiven`
- `GET /organizations/:orgId/contributors?teams=:teamId` returns only 2 contributors who are team members
- `GET /organizations/:orgId/contributors?fromDate=2026-01-01&toDate=2026-01-31` respects the date range and excludes PRs outside it
- `GET /organizations/:orgId/contributors/:contributorId` returns the correct contributor's detail
- `GET /organizations/:orgId/contributors/:contributorId/heatmap` returns an array where every `count` is greater than 0 (sparse array — only days with commits are present)
- Contributor with 0 activity still appears in the list (LEFT JOIN behavior validated)

**Frontend test file locations**

```
apps/web/src/components/contributors/ContributorsTable.spec.tsx
apps/web/src/components/contributors/ContributorCard.spec.tsx
apps/web/src/components/contributors/ContributorCardGrid.spec.tsx
apps/web/src/components/contributors/CommitHeatmap.spec.tsx
apps/web/src/pages/ContributorsPage.spec.tsx
apps/web/src/pages/ContributorDetailPage.spec.tsx
```

**`ContributorsTable.spec.tsx`**

Mock `useContributors` to return 3 fixed contributors.

Scenarios:
- Renders 3 rows in the DataGrid
- PRs Merged column displays the correct numeric value for each row
- Lines Added column uses green color styling
- Lines Removed column uses red color styling
- `avgCycleTimeHours: null` renders as `"—"` in the cycle time column
- Clicking a row triggers `navigate('/contributors/:id')`

**`ContributorCard.spec.tsx`**

Scenarios:
- Renders avatar image with `src` set to `avatarUrl`
- Renders `login` as the primary label
- PRs Merged chip displays the correct value
- Lines Added chip shows `+{linesAdded}` in green text
- Lines Removed chip shows `-{linesRemoved}` in red text

**`ContributorsPage.spec.tsx`**

Mock `useContributors`. Mock `useNavigate`.

Scenarios:
- Default view is `'table'`: `ContributorsTable` is rendered, `ContributorCardGrid` is not
- Clicking the grid toggle icon switches to `'grid'` view: `ContributorCardGrid` is rendered
- Clicking the table toggle icon switches back to `'table'` view
- Data from `useContributors` is passed to whichever view is active without a second API call

**`ContributorDetailPage.spec.tsx`**

Mock `useContributorDetail`, `useCommitHeatmap`, and the activity timeline hook.

Scenarios:
- Contributor's login and avatar are rendered in the header
- `CommitHeatmap` receives the correct `data` prop
- `ActivityTimeline` renders the correct number of events
- `ContributorPrHistory` renders the paginated PR table

---

### Definition of Done

- [ ] `GET /api/v1/organizations/:orgId/contributors` — list contributors with aggregated metrics
- [ ] Contributors list page: table with PRs Merged, Lines Added/Removed, Reviews Given, Avg Cycle Time
- [ ] Contributor detail page: activity timeline, commit heatmap, PR history
- [ ] Card grid alternative view with sparkline charts

---

## US-036: Team Dashboard

Display aggregated metrics for a selected team and enable cross-team comparison.

**Parallel:** After US-034.

**Recommended Agents:** `react-specialist`, `sql-pro`

---

### Implementation Details

**Backend folder structure**

```
apps/api/src/teams/
  (extends existing teams module — no new module)
  models/
    team-metrics.model.ts          # TeamMetrics, TeamComparison response shapes
```

Additional endpoints are added to the existing `teams.controller.ts` and `teams.service.ts`. The new repository methods are added to `teams.repository.ts`.

**New repository methods**

```typescript
// Added to TeamsRepository:
findTeamMetrics(teamId: string, filters: TeamMetricsFilters): Promise<TeamMetrics>
findAllTeamsMetrics(organizationId: string, filters: TeamMetricsFilters): Promise<TeamComparison[]>
```

Both methods use `$queryRaw` because the aggregations span multiple tables joined through team memberships.

**`findTeamMetrics` query structure**

```sql
-- Aggregates metrics for all contributors who are members of the given team
WITH team_members AS (
  SELECT tm.contributor_id
  FROM team_memberships tm
  WHERE tm.team_id = $1
),
pr_agg AS (
  SELECT
    COUNT(*) FILTER (WHERE pr.state = 'merged')     AS prs_merged,
    SUM(pr.additions + pr.deletions)                AS code_throughput,
    AVG(
      EXTRACT(EPOCH FROM (pr.merged_at - pr.first_commit_at)) / 3600.0
    ) FILTER (WHERE pr.merged_at IS NOT NULL AND pr.first_commit_at IS NOT NULL)
                                                    AS avg_cycle_time_hours
  FROM pull_requests pr
  WHERE pr.author_id IN (SELECT contributor_id FROM team_members)
    AND ($2::timestamptz IS NULL OR pr.github_created_at >= $2)
    AND ($3::timestamptz IS NULL OR pr.github_created_at <= $3)
),
review_agg AS (
  SELECT
    AVG(
      EXTRACT(EPOCH FROM (rv.submitted_at - pr.github_created_at)) / 3600.0
    )                                               AS avg_review_response_hours
  FROM pr_reviews rv
  JOIN pull_requests pr ON rv.pull_request_id = pr.id
  WHERE rv.reviewer_id IN (SELECT contributor_id FROM team_members)
    AND ($2::timestamptz IS NULL OR rv.submitted_at >= $2)
    AND ($3::timestamptz IS NULL OR rv.submitted_at <= $3)
)
SELECT
  pr_agg.prs_merged             AS "prsMerged",
  pr_agg.code_throughput        AS "codeThroughput",
  pr_agg.avg_cycle_time_hours   AS "avgCycleTimeHours",
  review_agg.avg_review_response_hours AS "avgReviewResponseHours"
FROM pr_agg, review_agg;
```

**`findAllTeamsMetrics`** calls `findTeamMetrics` in parallel for all teams in the organization using `Promise.all`. This is acceptable for the typical team count (<20). If performance becomes a concern, a single multi-team SQL query can replace it — but YAGNI for now.

**`models/team-metrics.model.ts`**

```typescript
// apps/api/src/teams/models/team-metrics.model.ts
export interface TeamMetrics {
  prsMerged: number;
  codeThroughput: number;
  avgCycleTimeHours: number | null;
  avgReviewResponseHours: number | null;
}

export interface TeamComparison {
  team: TeamWithMemberCount;
  metrics: TeamMetrics;
}
```

**New controller endpoints**

```
GET /api/v1/teams/:teamId/metrics          → getTeamMetrics
GET /api/v1/organizations/:orgId/teams/comparison  → getTeamsComparison
```

Both accept `?fromDate=` and `?toDate=` query parameters.

**Frontend folder structure additions**

```
apps/web/src/
  api/
    team-metrics.api.ts            # getTeamMetrics, getTeamsComparison fetch wrappers
  hooks/
    useTeamMetrics.ts              # useQuery for single team metrics
    useTeamsComparison.ts          # useQuery for cross-team comparison data
  components/
    teams/
      TeamMetricsCards.tsx         # 4 metric stat cards (PRs Merged, Cycle Time, etc.)
      TeamComparisonChart.tsx      # Nivo grouped bar chart for cross-team comparison
      TeamComparisonTable.tsx      # MUI X DataGrid for sortable cross-team metrics
  pages/
    TeamDetailPage.tsx             # team detail: member list + metrics cards + comparison link
    TeamComparisonPage.tsx         # comparison: grouped bar chart + sortable table side by side
  models/
    team-metrics.models.ts         # TeamMetrics, TeamComparison interfaces
```

**`TeamDetailPage.tsx`**

Route: `/teams/:teamId`. Sections:
1. Team name heading with member count badge
2. Date range filter picker (reuses global filter store)
3. `TeamMetricsCards` — 4 MUI `Paper` cards showing PRs Merged, Avg Cycle Time, Code Throughput (lines changed), Avg Review Response Time
4. Member list — compact avatar list with each member's login linking to their contributor detail page
5. "Compare Teams" button — navigates to `/teams/comparison`

**`TeamComparisonPage.tsx`**

Route: `/teams/comparison`. Fetches all teams' metrics via `useTeamsComparison`.

Layout — two panels side by side on desktop, stacked on mobile:
1. `TeamComparisonChart` — Nivo `ResponsiveBarCanvas` in grouped mode. X-axis: teams. Groups: PRs Merged, Avg Cycle Time (normalized to 0-100 scale for visual comparability), Code Throughput. Each metric has a consistent color across all teams.
2. `TeamComparisonTable` — DataGrid with columns for Team Name, PRs Merged, Avg Cycle Time, Code Throughput, Avg Review Response. Sortable by any metric column.

**`router/routes.tsx` additions**

```tsx
{ path: 'teams', element: <TeamsPage /> },
{ path: 'teams/comparison', element: <TeamComparisonPage /> },
{ path: 'teams/:teamId', element: <TeamDetailPage /> },
```

The `teams/comparison` route must be declared before `teams/:teamId` to prevent React Router from interpreting `"comparison"` as a `teamId` parameter.

---

### Testing Details

**Backend test file locations**

```
apps/api/src/teams/teams-metrics.repository.spec.ts    # unit
apps/api/src/teams/teams-metrics.service.spec.ts       # unit
apps/api/test/team-metrics.integration-spec.ts         # integration
```

**`teams-metrics.repository.spec.ts`**

Mocks `PrismaService.$queryRaw`.

Scenarios:
- `findTeamMetrics` passes `teamId` as the first parameter to `$queryRaw`
- `findTeamMetrics` passes `fromDate` and `toDate` as nullable timestamptz parameters
- `findTeamMetrics` returns `0` for `prsMerged` when the raw query returns `null` (COALESCE behavior simulated)
- `findAllTeamsMetrics` calls `findTeamMetrics` once per team in the organization

**`team-metrics.integration-spec.ts`**

Seeds: 1 organization, 3 teams, 6 contributors (2 per team), 20 merged PRs (distributed across teams), 15 pr_reviews.

Scenarios:
- `GET /teams/:teamId/metrics` returns correct `prsMerged` count matching the seeded data for that team's members
- `GET /teams/:teamId/metrics?fromDate=2026-01-01&toDate=2026-01-31` excludes PRs outside the date range
- `GET /organizations/:orgId/teams/comparison` returns an entry for every team including teams with 0 merged PRs
- The `codeThroughput` value for a team equals the sum of `additions + deletions` across that team's merged PRs
- Two teams with different membership compositions return different `avgCycleTimeHours` values when seeded with different cycle times

**Frontend test file locations**

```
apps/web/src/components/teams/TeamMetricsCards.spec.tsx
apps/web/src/components/teams/TeamComparisonTable.spec.tsx
apps/web/src/pages/TeamDetailPage.spec.tsx
apps/web/src/pages/TeamComparisonPage.spec.tsx
```

**`TeamMetricsCards.spec.tsx`**

Scenarios:
- Renders 4 cards with the correct labels: "PRs Merged", "Avg Cycle Time", "Code Throughput", "Avg Review Response"
- Displays `"—"` when `avgCycleTimeHours` is `null`
- Formats `avgCycleTimeHours: 26.4` as `"26.4h"`
- Formats `codeThroughput: 1500` as `"1,500 lines"`

**`TeamComparisonTable.spec.tsx`**

Mock `useTeamsComparison` to return 3 teams.

Scenarios:
- Renders 3 rows — one per team
- Clicking the "PRs Merged" column header sorts the rows by that metric descending
- Team name in each row links to the correct `/teams/:teamId` route

**`TeamDetailPage.spec.tsx`**

Mock `useTeamMetrics` and `useTeams`.

Scenarios:
- Renders the team's name in the heading
- `TeamMetricsCards` receives the metrics from `useTeamMetrics`
- Member list renders each member's login
- "Compare Teams" button navigates to `/teams/comparison`

---

### Definition of Done

- [ ] Team detail page showing aggregated metrics for team members
- [ ] Cross-team comparison: grouped bar chart + sortable table
- [ ] Metrics: PRs Merged, Avg Cycle Time, Code Throughput, Review Response Time per team

---

## US-037: Repository Dashboard

Build repository-level analytics including PR velocity, code churn, and health indicators.

**Parallel:** Can run in parallel with US-035 and US-036 after US-034 is complete.

**Recommended Agents:** `react-specialist`, `sql-pro`, `ui-designer`

---

### Implementation Details

**Backend folder structure**

```
apps/api/src/repositories/
  repositories.module.ts
  repositories.controller.ts
  repositories.service.ts
  repositories.repository.ts
  models/
    repository.model.ts            # Repository, RepositoryWithMetrics
    repository-analytics.model.ts  # PrVelocityPoint, ChurnDataPoint, OpenPrAgeSummary
    repository-filters.model.ts    # RepositoryAnalyticsFiltersDto
```

**`repositories.repository.ts`**

Scoped to the `repositories` table and its analytics queries. Does not query contributor or team data.

```typescript
// Method signatures:
findAllByOrg(organizationId: string): Promise<RepositoryWithMetrics[]>
findById(repositoryId: string): Promise<Repository | null>
findPrVelocityTrend(repositoryId: string, filters: DateRangeFilters): Promise<PrVelocityPoint[]>
findCodeChurn(repositoryId: string, filters: DateRangeFilters): Promise<ChurnDataPoint[]>
findTopContributors(repositoryId: string, limit: number): Promise<ContributorSummary[]>
findOpenPrAgeSummary(repositoryId: string): Promise<OpenPrAgeSummary>
findAvgCycleTimeTrend(repositoryId: string, filters: DateRangeFilters): Promise<CycleTimeTrendPoint[]>
```

**`findPrVelocityTrend` query**

Returns weekly PR merge count and open count for the requested date range. Grouped by `DATE_TRUNC('week', merged_at)`:

```sql
SELECT
  DATE_TRUNC('week', pr.merged_at)    AS week,
  COUNT(*) FILTER (WHERE pr.state = 'merged') AS prs_merged,
  COUNT(*) FILTER (WHERE pr.state = 'open')   AS prs_open
FROM pull_requests pr
WHERE pr.repository_id = $1
  AND pr.github_created_at >= $2
  AND pr.github_created_at <= $3
GROUP BY DATE_TRUNC('week', pr.merged_at)
ORDER BY week ASC;
```

**`findCodeChurn` query**

Returns weekly additions and deletions for the mirror chart. A mirror (diverging) chart requires both a positive series (additions) and a negative series (deletions):

```sql
SELECT
  DATE_TRUNC('week', pr.merged_at)  AS week,
  SUM(pr.additions)                 AS additions,
  SUM(pr.deletions) * -1            AS deletions   -- negated for mirror chart rendering
FROM pull_requests pr
WHERE pr.repository_id = $1
  AND pr.state = 'merged'
  AND pr.merged_at >= $2
  AND pr.merged_at <= $3
GROUP BY DATE_TRUNC('week', pr.merged_at)
ORDER BY week ASC;
```

**`findAvgCycleTimeTrend`**

Returns monthly average cycle time to support the "improving/declining" health indicator. A trend is "improving" if the most recent month's average is lower than the prior month's average. This comparison logic lives in `repositories.service.ts`, not the repository layer.

**`findAllByOrg` with sortable metrics**

Uses a Prisma `$queryRaw` that JOINs `repositories` with aggregations from `pull_requests` to return pre-computed list metrics:

- `openPrCount` — count of PRs with `state = 'open'`
- `avgCycleTimeHours` — average over the last 30 days
- `lastActivityAt` — `MAX(github_created_at)` across all PRs

These are the columns used for sorting in the repository list page.

**`models/repository-analytics.model.ts`**

```typescript
// apps/api/src/repositories/models/repository-analytics.model.ts
export interface PrVelocityPoint {
  week: string;        // ISO date string
  prsMerged: number;
  prsOpen: number;
}

export interface ChurnDataPoint {
  week: string;
  additions: number;
  deletions: number;   // negative value — ready for mirror chart
}

export interface CycleTimeTrendPoint {
  month: string;       // ISO date string (first day of month)
  avgCycleTimeHours: number | null;
}

export type CycleTimeTrend = 'improving' | 'declining' | 'stable' | 'insufficient_data';

export interface OpenPrAgeSummary {
  count: number;
  oldestOpenedAt: string | null;
  avgAgeHours: number | null;
}

export interface RepositoryHealthIndicators {
  cycleTimeTrend: CycleTimeTrend;
  openPrCount: number;
  avgOpenPrAgeHours: number | null;
}
```

**Controller endpoints**

```
GET /api/v1/organizations/:orgId/repositories                              → listRepositories
GET /api/v1/repositories/:repoId                                           → getRepository
GET /api/v1/repositories/:repoId/analytics/pr-velocity                     → getPrVelocity
GET /api/v1/repositories/:repoId/analytics/code-churn                      → getCodeChurn
GET /api/v1/repositories/:repoId/analytics/cycle-time-trend                → getCycleTimeTrend
GET /api/v1/repositories/:repoId/analytics/top-contributors                → getTopContributors
GET /api/v1/repositories/:repoId/health                                    → getHealthIndicators
```

All analytics endpoints accept `?fromDate=` and `?toDate=`. The `getTopContributors` endpoint accepts `?limit=` (default 5, max 20).

**Frontend folder structure**

```
apps/web/src/
  api/
    repositories.api.ts            # typed fetch wrappers for all repository endpoints
  hooks/
    useRepositories.ts             # useQuery for repository list
    useRepositoryAnalytics.ts      # useQuery hooks for each analytics endpoint
  components/
    repositories/
      RepositoryListTable.tsx      # MUI X DataGrid for sortable repository list
      PrVelocityChart.tsx          # Nivo ResponsiveLine — two series: merged + open
      CodeChurnChart.tsx           # Nivo ResponsiveBar mirror chart (additions / deletions)
      CycleTimeTrendChart.tsx      # Nivo ResponsiveLine — monthly avg cycle time
      HealthIndicatorBadge.tsx     # colored chip: "Improving" / "Declining" / "Stable"
      TopContributorsWidget.tsx    # ranked list of top 5 contributors by PRs merged
      OpenPrAgeWidget.tsx          # stat card: open PR count + oldest PR age
  pages/
    RepositoriesPage.tsx           # list page with sortable DataGrid
    RepositoryDetailPage.tsx       # detail page with all chart components
  models/
    repository.models.ts           # Repository, RepositoryWithMetrics, analytics interfaces
```

**`RepositoriesPage.tsx`**

MUI X DataGrid columns:
- Repository Name (link to detail page)
- Open PRs (numeric)
- Avg Cycle Time (last 30 days, formatted as hours)
- Last Activity (relative time: "3 days ago")
- Cycle Time Trend (`HealthIndicatorBadge`)

All columns are sortable client-side. Initial sort: Last Activity descending.

**`RepositoryDetailPage.tsx`**

Route: `/repositories/:repoId`. Sections stacked vertically:
1. Repository name heading with full name (`org/repo`) and GitHub link
2. Health indicators row: `HealthIndicatorBadge` for cycle time trend + `OpenPrAgeWidget`
3. "PR Velocity Trend" section: `PrVelocityChart` with date range picker
4. "Code Churn" section: `CodeChurnChart` — mirror bar chart, additions above zero line, deletions below
5. "Top Contributors" section: `TopContributorsWidget` — ranked list of top 5 contributors

**`CodeChurnChart.tsx`**

Uses Nivo `ResponsiveBar` with two data keys: `additions` (positive, green) and `deletions` (negative value stored as negative number, red). The `minValue` and `maxValue` are set to `'auto'` to allow Nivo to handle the symmetric axis. The zero line must be clearly visible.

**`CycleTimeTrendChart.tsx`**

Uses Nivo `ResponsiveLine`. Each data point is one month. The chart includes a color-coded annotation (green arrow for improving months, red for worsening) but only when the trend difference exceeds 10% to avoid noise on stable repositories.

**`router/routes.tsx` additions**

```tsx
{ path: 'repositories', element: <RepositoriesPage /> },
{ path: 'repositories/:repoId', element: <RepositoryDetailPage /> },
```

---

### Testing Details

**Backend test file locations**

```
apps/api/src/repositories/repositories.repository.spec.ts
apps/api/src/repositories/repositories.service.spec.ts
apps/api/src/repositories/repositories.controller.spec.ts
apps/api/test/repositories.integration-spec.ts
```

**`repositories.repository.spec.ts`**

Mocks `PrismaService.$queryRaw` and `prisma.repository.findMany`.

Scenarios:
- `findPrVelocityTrend` passes `repositoryId`, `fromDate`, and `toDate` to `$queryRaw` in that order
- `findCodeChurn` returns `deletions` as negative values (the SQL multiplies by `-1`)
- `findAllByOrg` calls `prisma.repository.findMany` with `where: { organizationId }`
- `findTopContributors` respects the `limit` parameter — passes it as a query parameter to `$queryRaw`

**`repositories.service.spec.ts`**

Mock `RepositoriesRepository`.

Scenarios:
- `getHealthIndicators` returns `trend: 'improving'` when the most recent month's avg cycle time is 10% lower than the previous month
- `getHealthIndicators` returns `trend: 'declining'` when the most recent month's avg cycle time is more than 10% higher
- `getHealthIndicators` returns `trend: 'stable'` when the difference is within 10%
- `getHealthIndicators` returns `trend: 'insufficient_data'` when `findAvgCycleTimeTrend` returns fewer than 2 data points with non-null values
- `getHealthIndicators` throws `NotFoundException` when the repository does not exist

**`repositories.integration-spec.ts`**

Seeds: 1 organization, 2 repositories, 4 contributors, 30 pull requests distributed across both repos and all 4 contributors (mix of merged and open states), with `merged_at` timestamps spanning 12 weeks.

Scenarios:
- `GET /organizations/:orgId/repositories` returns 2 repositories
- Each repository in the list has a non-null `openPrCount` matching the seeded open PR count
- `GET /repositories/:repoId/analytics/pr-velocity?fromDate=...&toDate=...` returns weekly buckets covering the date range
- Every bucket in the PR velocity response has non-negative `prsMerged` and `prsOpen` values
- `GET /repositories/:repoId/analytics/code-churn` returns `deletions` as negative numbers
- `GET /repositories/:repoId/analytics/top-contributors?limit=3` returns exactly 3 contributors sorted by PR count descending
- `GET /repositories/:repoId/health` returns a `cycleTimeTrend` field with a valid enum value
- `GET /repositories/:repoId` returns 404 for a non-existent repository ID

**Frontend test file locations**

```
apps/web/src/components/repositories/RepositoryListTable.spec.tsx
apps/web/src/components/repositories/CodeChurnChart.spec.tsx
apps/web/src/components/repositories/HealthIndicatorBadge.spec.tsx
apps/web/src/pages/RepositoriesPage.spec.tsx
apps/web/src/pages/RepositoryDetailPage.spec.tsx
```

**`RepositoryListTable.spec.tsx`**

Mock `useRepositories` to return 3 repositories.

Scenarios:
- Renders 3 rows with repository names
- Open PR count column shows the correct values
- Clicking a repository name navigates to `/repositories/:repoId`
- Clicking "Avg Cycle Time" column header re-sorts rows (verify row order changes)

**`CodeChurnChart.spec.tsx`**

Pass a fixed `data` prop with both positive additions and negative deletion values.

Scenarios:
- Renders without crashing when given valid data
- Renders without crashing when `data` is an empty array (empty state)
- Does not render any bars when data is empty

**`HealthIndicatorBadge.spec.tsx`**

Scenarios:
- `trend: 'improving'` renders a green chip with the text "Improving"
- `trend: 'declining'` renders a red chip with the text "Declining"
- `trend: 'stable'` renders a neutral chip
- `trend: 'insufficient_data'` renders a grey chip with the text "Not enough data"

**`RepositoryDetailPage.spec.tsx`**

Mock all analytics hooks (`usePrVelocity`, `useCodeChurn`, `useCycleTimeTrend`, `useTopContributors`, `useRepositoryHealth`).

Scenarios:
- Repository full name (`org/repo`) is rendered in the heading
- `HealthIndicatorBadge` receives the `trend` value from `useRepositoryHealth`
- `PrVelocityChart` receives the correct data from `usePrVelocity`
- `TopContributorsWidget` renders the correct number of contributor entries
- When a hook returns `isLoading: true`, a loading skeleton is rendered in place of the chart

---

### Definition of Done

- [ ] Repository detail page with: PR velocity trend, code churn chart, top contributors
- [ ] Health indicators: avg cycle time trend (improving/declining), open PR age
- [ ] Repository list page with sortable metrics columns
