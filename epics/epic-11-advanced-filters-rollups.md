# Epic 11: Advanced Filters + Rollups (Weeks 11-12)

---

## US-038: Advanced Filters + Saved Presets

Add contributor and team multi-select filters to the filter bar, implement active filter chips with a "Clear all" action, and provide a save/load mechanism for named filter presets stored per user.

**Recommended Agents:** `react-specialist`, `frontend-developer`, `backend-developer`

---

### Implementation Details

**Zustand filter store expansion**

The existing `filter.store.ts` already declares `contributorIds` and `teamIds` as empty arrays. This story activates them by wiring up the missing setters and adding the preset actions:

```typescript
// apps/web/src/store/filter.store.ts
import { create } from 'zustand';
import type { FilterPreset } from '@/api/filter-presets/filter-presets.types';

interface FilterState {
  fromDate: string | null;
  toDate: string | null;
  repositoryIds: string[];
  contributorIds: string[];
  teamIds: string[];
  // actions
  setDateRange: (from: string | null, to: string | null) => void;
  setRepositoryIds: (ids: string[]) => void;
  setContributorIds: (ids: string[]) => void;
  setTeamIds: (ids: string[]) => void;
  applyPreset: (preset: FilterPreset) => void;
  reset: () => void;
}
```

`applyPreset` replaces all filter fields from the preset's stored JSONB blob in a single `set` call — no partial merges.

**Filter bar component changes**

The filter bar lives in `apps/web/src/components/layout/FilterBar.tsx`. Add two new MUI `Autocomplete` components alongside the existing date range picker and repository multi-select:

```
FilterBar
  DateRangePicker          (existing)
  RepositoryMultiSelect    (existing)
  ContributorMultiSelect   (new — US-038)
  TeamMultiSelect          (new — US-038)
  ActiveFilterChips        (new — US-038)
  PresetControls           (new — US-038)
```

Each multi-select is a standalone component in `apps/web/src/components/filters/` with its own types file:

```
apps/web/src/components/filters/
  ContributorMultiSelect.tsx
  ContributorMultiSelect.types.ts
  TeamMultiSelect.tsx
  TeamMultiSelect.types.ts
  ActiveFilterChips.tsx
  ActiveFilterChips.types.ts
  PresetControls.tsx
  PresetControls.types.ts
  SavePresetDialog.tsx
  SavePresetDialog.types.ts
```

**ContributorMultiSelect — component contract**

```typescript
// apps/web/src/components/filters/ContributorMultiSelect.types.ts
export interface ContributorOption {
  id: string;
  login: string;
  avatarUrl: string | null;
}

export interface ContributorMultiSelectProps {
  value: string[];           // selected contributor IDs
  onChange: (ids: string[]) => void;
  organizationId: string;
}
```

The component uses MUI `Autocomplete` with `multiple`, `filterSelectedOptions`, and `renderOption` displaying a small MUI `Avatar` alongside the login. Options are fetched via a TanStack Query hook:

```typescript
// apps/web/src/hooks/useContributorOptions.ts
export function useContributorOptions(organizationId: string) {
  return useQuery({
    queryKey: ['contributor-options', organizationId],
    queryFn: () => contributorsApi.listForOrg(organizationId),
    staleTime: 5 * 60_000,
  });
}
```

The Autocomplete receives `loading={isLoading}` and `options={data ?? []}`. Selected IDs are reconciled to option objects inside the component for the `value` prop.

**TeamMultiSelect** follows the same pattern using `useTeamOptions`.

**URL sync logic**

URL sync is centralised in a single custom hook that is mounted once in `AppLayout`:

```typescript
// apps/web/src/hooks/useFilterUrlSync.ts
import { useSearchParams } from 'react-router-dom';
import { useFilterStore } from '@/store/filter.store';
import { useEffect } from 'react';

export function useFilterUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { fromDate, toDate, repositoryIds, contributorIds, teamIds,
          setDateRange, setRepositoryIds, setContributorIds, setTeamIds } = useFilterStore();

  // On mount: read URL -> populate store (handles shared URLs / page refresh)
  useEffect(() => {
    const from = searchParams.get('from');
    const to   = searchParams.get('to');
    if (from || to) setDateRange(from, to);

    const repos = searchParams.get('repositories');
    if (repos) setRepositoryIds(repos.split(',').filter(Boolean));

    const contributors = searchParams.get('contributors');
    if (contributors) setContributorIds(contributors.split(',').filter(Boolean));

    const teams = searchParams.get('teams');
    if (teams) setTeamIds(teams.split(',').filter(Boolean));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — run once on mount

  // Store changes -> push to URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (fromDate) params['from'] = fromDate;
    if (toDate)   params['to']   = toDate;
    if (repositoryIds.length)  params['repositories']  = repositoryIds.join(',');
    if (contributorIds.length) params['contributors']  = contributorIds.join(',');
    if (teamIds.length)        params['teams']         = teamIds.join(',');
    setSearchParams(params, { replace: true });
  }, [fromDate, toDate, repositoryIds, contributorIds, teamIds, setSearchParams]);
}
```

This hook does not expose any return value — all reads happen via the Zustand store directly from child components.

**ActiveFilterChips component**

Renders one MUI `Chip` per active filter dimension with a label and delete handler. A "Clear all" button renders only when at least one filter is active.

```typescript
// apps/web/src/components/filters/ActiveFilterChips.types.ts
export interface ActiveFilterChip {
  key: string;
  label: string;
  onDelete: () => void;
}
```

The component derives the chip list from the Zustand store. Repository, contributor, and team chips resolve names from the option query caches (via `useQueryClient().getQueryData`). Unresolved IDs fall back to the raw ID string — they are never left blank.

**Filter presets — backend**

Database migration adds the `filter_presets` table:

```sql
-- apps/api/prisma/migrations/<timestamp>_add_filter_presets/migration.sql
CREATE TABLE filter_presets (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(80) NOT NULL,
  filters    JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX idx_filter_presets_user_id ON filter_presets (user_id);
```

The `filters` JSONB column stores the serialised filter state:

```typescript
// packages/shared/src/types/filter-preset.types.ts
export interface FilterPresetFilters {
  fromDate: string | null;
  toDate: string | null;
  repositoryIds: string[];
  contributorIds: string[];
  teamIds: string[];
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterPresetFilters;
  createdAt: string;
}
```

NestJS module structure:

```
apps/api/src/modules/filter-presets/
  filter-presets.module.ts
  filter-presets.controller.ts    # REST endpoints
  filter-presets.service.ts       # business logic
  filter-presets.repository.ts    # Prisma queries
  models/
    filter-preset.model.ts        # response DTO
    create-filter-preset.dto.ts   # request validation
```

Endpoints:

```
GET    /api/v1/filter-presets           -> list all presets for the authenticated user
POST   /api/v1/filter-presets           -> create a new preset
DELETE /api/v1/filter-presets/:id       -> delete a preset (must belong to calling user)
```

No update endpoint — users delete and recreate. This keeps the service layer minimal (YAGNI).

**Filter presets — frontend API layer**

```
apps/web/src/api/filter-presets/
  filter-presets.api.ts
  filter-presets.types.ts
```

TanStack Query hooks:

```typescript
// apps/web/src/hooks/useFilterPresets.ts
export function useFilterPresets() {
  return useQuery({
    queryKey: ['filter-presets'],
    queryFn: filterPresetsApi.list,
  });
}

export function useCreateFilterPreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: filterPresetsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['filter-presets'] }),
  });
}

export function useDeleteFilterPreset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: filterPresetsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['filter-presets'] }),
  });
}
```

**PresetControls component**

Contains a MUI `Select` dropdown listing saved presets and a "Save current filters" button that opens `SavePresetDialog`.

`SavePresetDialog` is a MUI `Dialog` with a single text field for the preset name and Save / Cancel actions. On submit it calls `useCreateFilterPreset` with the current Zustand filter state.

Loading a preset calls `filterStore.applyPreset(preset)` which triggers the URL sync effect and cascades to all chart queries automatically via their dependency on the store values.

---

### Testing Details

**Test file locations:**

```
apps/web/src/store/filter.store.spec.ts                          (extend existing)
apps/web/src/hooks/useFilterUrlSync.spec.ts
apps/web/src/components/filters/ContributorMultiSelect.spec.tsx
apps/web/src/components/filters/TeamMultiSelect.spec.tsx
apps/web/src/components/filters/ActiveFilterChips.spec.tsx
apps/web/src/components/filters/SavePresetDialog.spec.tsx
apps/web/src/components/filters/PresetControls.spec.tsx
apps/api/src/modules/filter-presets/filter-presets.service.spec.ts
apps/api/src/modules/filter-presets/filter-presets.controller.spec.ts
```

**`filter.store.spec.ts` — extend existing**

New scenarios added alongside the existing ones:

- `setContributorIds(['c-1', 'c-2'])` updates `contributorIds`
- `setTeamIds(['t-1'])` updates `teamIds`
- `applyPreset(preset)` replaces all five filter fields atomically — assert each field matches the preset values
- `reset()` still clears `contributorIds` and `teamIds` to empty arrays

**`useFilterUrlSync.spec.ts`**

Use `renderHook` with `MemoryRouter` providing an initial URL. MSW is not needed — the hook only reads/writes `useSearchParams` and the Zustand store.

Scenarios:

- On mount with `?contributors=c-1,c-2&teams=t-1` in URL: store's `contributorIds` becomes `['c-1', 'c-2']` and `teamIds` becomes `['t-1']`
- Calling `setContributorIds(['c-3'])` on the store: `setSearchParams` is called and the URL becomes `?contributors=c-3`
- Calling `reset()` on the store: URL query string is cleared of all filter params
- On mount with no query params: store fields remain at their initial empty values (no spurious `setSearchParams` call)

**`ContributorMultiSelect.spec.tsx`**

Mock `useContributorOptions` via MSW to return two contributor options.

Scenarios:

- Renders a MUI Autocomplete with the correct `aria-label`
- Selecting an option calls `onChange` with the option's id appended to the current value array
- Removing a chip calls `onChange` with that id removed
- While `isLoading` is true, the Autocomplete has the loading indicator visible
- With an empty options array, the no-options text is shown

`TeamMultiSelect.spec.tsx` mirrors these scenarios for team options.

**`ActiveFilterChips.spec.tsx`**

Mock the Zustand store's state directly.

Scenarios:

- When all filter arrays are empty and dates are null, no chips and no "Clear all" button render
- With `repositoryIds: ['r-1']` in store (options cache seeded with `{ id: 'r-1', name: 'my-repo' }`): a Chip labelled "my-repo" renders
- Clicking the chip's delete icon calls `setRepositoryIds([])` on the store
- With multiple filters active, "Clear all" button renders and clicking it calls `reset()`
- An ID not found in the options cache renders as the raw ID string (no crash)

**`SavePresetDialog.spec.tsx`**

Scenarios:

- Dialog is closed by default; opening it renders a text field and Save button
- Submitting with an empty name keeps the Save button disabled
- Entering a valid name and submitting calls `useCreateFilterPreset.mutate` with `{ name, filters: <current store state> }`
- On mutation success, dialog closes and success snackbar appears
- Clicking Cancel closes the dialog without calling mutate

**`PresetControls.spec.tsx`**

Scenarios:

- Renders a disabled Select when `useFilterPresets` returns an empty list
- Renders each preset name as a `MenuItem`
- Selecting a preset calls `filterStore.applyPreset` with the selected preset's data
- Clicking delete icon on a preset item calls `useDeleteFilterPreset.mutate` with the preset id

**`filter-presets.service.spec.ts`**

Mock `FilterPresetsRepository`.

Scenarios:

- `list(userId)` returns the repository's result directly
- `create(userId, dto)` passes correct args to repository; returns created preset
- `delete(userId, presetId)` throws `NotFoundException` when repository returns null (preset not found or belongs to another user)
- `delete(userId, presetId)` succeeds when the preset exists and belongs to the calling user

**`filter-presets.controller.spec.ts`**

Use `Test.createTestingModule` with a mock `FilterPresetsService`.

Scenarios:

- `GET /filter-presets` returns `200` with the service list result; user id sourced from the JWT payload on `request.user`
- `POST /filter-presets` with valid body returns `201` with the created preset
- `POST /filter-presets` with missing `name` field returns `400` (class-validator)
- `DELETE /filter-presets/:id` returns `204` on success
- `DELETE /filter-presets/:id` when service throws `NotFoundException` returns `404`

---

### Definition of Done

- [ ] Contributor multi-select filter added to filter bar
- [ ] Team filter added to filter bar
- [ ] Active filter chips with "Clear all" button
- [ ] Save current filter state as a named preset (stored per user)
- [ ] Load saved presets from a dropdown
- [ ] All filters persist in URL (every view is shareable)

---

## US-039: Trend Comparisons (WoW, MoM)

Add period-over-period comparison support across all metric charts and KPI cards. Users can toggle a "Compare to previous period" mode that overlays the prior period's data on each chart and shows a delta percentage on every KPI card.

**Recommended Agents:** `react-specialist`, `sql-pro`

---

### Implementation Details

**Comparison toggle — UI state**

A single boolean in the existing `ui.store.ts` controls whether comparison mode is active:

```typescript
// apps/web/src/store/ui.store.ts (addition)
interface UiState {
  sidebarOpen: boolean;
  comparisonEnabled: boolean;
  toggleSidebar: () => void;
  toggleComparison: () => void;
}

// addition to the create call:
comparisonEnabled: false,
toggleComparison: () => set((s) => ({ comparisonEnabled: !s.comparisonEnabled })),
```

A "Compare to previous period" toggle button renders in the filter bar, right-aligned, using MUI `ToggleButton`. It reads and writes `comparisonEnabled` from the UI store.

**Previous period date calculation**

The previous period is always the same duration as the current period, ending on the day before the current period starts. This is a pure function with no side effects:

```typescript
// apps/web/src/lib/date-utils.ts
export interface DateRange {
  from: string;  // ISO date string
  to: string;
}

export function getPreviousPeriod(current: DateRange): DateRange {
  const from = new Date(current.from);
  const to   = new Date(current.to);
  const durationMs = to.getTime() - from.getTime();
  const prevTo   = new Date(from.getTime() - 24 * 60 * 60 * 1000);  // day before current start
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to:   prevTo.toISOString().slice(0, 10),
  };
}
```

**Fetching previous period data — separate query strategy**

The previous period data is fetched by the same TanStack Query hooks as the current period, but with different date params. Each metric hook accepts an explicit `DateRange` override parameter so comparison calls are independent of the current filter store dates:

```typescript
// apps/web/src/hooks/useMergeFrequency.ts
interface UseMergeFrequencyParams {
  organizationId: string;
  from: string;
  to: string;
  groupBy: 'day' | 'week' | 'month';
  repositoryIds?: string[];
  contributorIds?: string[];
  teamIds?: string[];
}

export function useMergeFrequency(params: UseMergeFrequencyParams) {
  return useQuery({
    queryKey: ['merge-frequency', params],
    queryFn: () => metricsApi.getMergeFrequency(params),
    staleTime: 60_000,
  });
}
```

At the chart / page level, when `comparisonEnabled` is true, the component calls `useMergeFrequency` a second time with the previous period's date range. TanStack Query deduplicates and caches both calls independently:

```typescript
// usage in DashboardPage.tsx (outline)
const currentRange  = { from: fromDate!, to: toDate! };
const previousRange = getPreviousPeriod(currentRange);

const { data: current  } = useMergeFrequency({ ...params, ...currentRange });
const { data: previous } = useMergeFrequency(
  { ...params, ...previousRange },
  { enabled: comparisonEnabled },
);
```

This approach keeps the backend API surface unchanged — no `?compare=true` flag is added. The server computes nothing extra; the delta logic lives entirely on the frontend.

**KPI card delta calculation**

Delta is the percentage change from previous period total to current period total. This is a pure utility function:

```typescript
// apps/web/src/lib/metrics-utils.ts
export function calculateDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;  // undefined: can't divide by zero
  return Math.round(((current - previous) / previous) * 100);
}
```

`null` renders as "N/A" in the KPI card. A positive delta renders as "+12%" in MUI `Chip` with `color="success"` and an up arrow icon. A negative delta renders with `color="error"` and a down arrow.

The KPI card component receives `delta: number | null` as an optional prop so it degrades gracefully when comparison is disabled:

```typescript
// apps/web/src/components/metrics/KpiCard.types.ts
export interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  delta?: number | null;   // undefined = hide delta row; null = show "N/A"
  loading?: boolean;
}
```

**Chart overlay approach with Nivo**

Nivo line and bar charts support multiple data series natively. When comparison mode is enabled, the previous period series is added to the chart's `data` array with a distinct key and a muted colour from the design system's categorical palette:

```typescript
// apps/web/src/components/charts/MergeFrequencyChart.tsx (outline)
const chartData = [
  {
    id: 'current',
    color: theme.palette.primary.main,
    data: current?.map(d => ({ x: d.period, y: d.count })) ?? [],
  },
  ...(comparisonEnabled && previous
    ? [{
        id: 'previous period',
        color: theme.palette.action.disabled,
        data: previous.map(d => ({ x: d.period, y: d.count })),
      }]
    : []),
];
```

For bar charts (Nivo `ResponsiveBar`), the previous period is added as a second grouped key per period, rendered with lower opacity. The `keys` and `groupMode="grouped"` props handle the side-by-side rendering.

The chart legend always lists series names. The comparison series label reads "Previous period (DD MMM – DD MMM)" using the calculated previous period dates for clarity.

**Weekly and monthly rollups**

Weekly and monthly rollups are derived from daily rollups at query time in the backend. The `metric_rollups` table already stores `period_type: 'day' | 'week' | 'month'`. The rollup computation job (US-021) is extended to also write week and month aggregates:

```
apps/api/src/modules/metrics/
  rollup-computation.service.ts   (extend existing)
```

Rollup derivation logic (SQL, run inside `RollupComputationService`):

```sql
-- Weekly rollup from daily
INSERT INTO metric_rollups (organization_id, repository_id, period_type, period_start, metric_name, value)
SELECT
  organization_id,
  repository_id,
  'week'                                          AS period_type,
  date_trunc('week', period_start)                AS period_start,
  metric_name,
  SUM(value)                                      AS value
FROM metric_rollups
WHERE period_type = 'day'
  AND organization_id = $1
  AND period_start >= $2
  AND period_start <= $3
GROUP BY organization_id, repository_id, metric_name, date_trunc('week', period_start)
ON CONFLICT (organization_id, repository_id, period_type, period_start, metric_name)
  DO UPDATE SET value = EXCLUDED.value;
```

The monthly rollup uses `date_trunc('month', period_start)` with the same pattern.

The rollup computation is triggered:
- After backfill Step 4 completes for a repo (existing trigger in US-021)
- After each `pull_request.closed` (merged) webhook upsert for today's daily row (existing trigger in US-021)

No new job types are needed — the computation service simply writes all three period types in one pass.

**Rollup computation timing**

Weekly and monthly rollup rows are idempotent via `ON CONFLICT DO UPDATE`. Recomputing them on every daily update is acceptable at MVP data volumes. This avoids a separate scheduling job (YAGNI).

---

### Testing Details

**Test file locations:**

```
apps/web/src/lib/date-utils.spec.ts
apps/web/src/lib/metrics-utils.spec.ts
apps/web/src/store/ui.store.spec.ts                              (extend existing)
apps/web/src/components/metrics/KpiCard.spec.tsx
apps/web/src/components/charts/MergeFrequencyChart.spec.tsx
apps/api/src/modules/metrics/rollup-computation.service.spec.ts  (extend existing)
```

**`date-utils.spec.ts`**

Scenarios:

- `getPreviousPeriod({ from: '2026-02-01', to: '2026-02-28' })` returns `{ from: '2026-01-04', to: '2026-01-31' }` (same 27-day duration)
- `getPreviousPeriod({ from: '2026-02-16', to: '2026-02-22' })` returns a 6-day window ending on `2026-02-15`
- `getPreviousPeriod` is a pure function — same input always produces the same output (run 3 times, assert equal results)
- Handles single-day range: `{ from: '2026-02-26', to: '2026-02-26' }` returns `{ from: '2026-02-25', to: '2026-02-25' }`

**`metrics-utils.spec.ts`**

Scenarios:

- `calculateDelta(110, 100)` returns `10`
- `calculateDelta(90, 100)` returns `-10`
- `calculateDelta(100, 100)` returns `0`
- `calculateDelta(50, 0)` returns `null` (division by zero guard)
- `calculateDelta(0, 0)` returns `null`
- `calculateDelta(105, 100)` returns `5` (rounds correctly — no floating point artefacts)

**`ui.store.spec.ts` — extend existing**

New scenarios:

- Initial `comparisonEnabled` is `false`
- `toggleComparison()` sets it to `true`
- Calling `toggleComparison()` again sets it back to `false`
- `toggleSidebar()` does not affect `comparisonEnabled` (state slices are independent)

**`KpiCard.spec.tsx`**

Scenarios:

- With `delta={10}`, renders "+10%" text with a success colour indicator and an up arrow icon
- With `delta={-5}`, renders "-5%" with an error colour indicator and a down arrow icon
- With `delta={0}`, renders "0%" with a neutral indicator
- With `delta={null}`, renders "N/A" without an arrow icon
- With `delta={undefined}` (prop omitted), the delta row is not rendered at all
- While `loading={true}`, renders a MUI Skeleton in place of value and delta
- Renders the `title` and `value` props regardless of delta state

**`MergeFrequencyChart.spec.tsx`**

Mock `useMergeFrequency` via Vitest `vi.mock`. Provide current period data (3 data points) and previous period data (3 data points).

Scenarios:

- With `comparisonEnabled={false}`: chart receives only one series (`id: 'current'`); previous period series is absent
- With `comparisonEnabled={true}` and previous data loaded: chart receives two series; the second series has id containing "previous"
- With `comparisonEnabled={true}` and previous data still loading: chart renders with only the current series and a loading indicator; no crash from undefined previous data
- Chart legend labels are visible in the rendered output

**`rollup-computation.service.spec.ts` — extend existing**

Mock `PrismaService.$executeRaw` (or `$queryRaw` depending on the implementation approach).

New scenarios:

- `computeRollups(orgId, repoId, from, to)` calls the weekly aggregation SQL with `period_type = 'week'`
- `computeRollups` calls the monthly aggregation SQL with `period_type = 'month'`
- `computeRollups` calls daily, weekly, and monthly computations in a single invocation — verify that all three SQL variants are executed, not just daily
- When the daily rollup table has no rows for the given range, the weekly and monthly upserts execute without error (empty result set is handled gracefully)

---

### Definition of Done

- [ ] All metric charts support period-over-period comparison toggle
- [ ] Shows current period vs previous period as overlay or delta
- [ ] KPI cards show delta percentage with up/down indicator
- [ ] Weekly and monthly rollups computed from daily rollups
