# GitHub-Based Engineering Management Platform - Architecture Document

## Executive Summary

This document presents the complete architecture for a GitHub-based engineering management platform (similar to LinearB / Jellyfish). It covers frontend, backend, database, deployment, UI/UX, and a phased implementation roadmap. All recommendations are based on the specific requirements of this project: PR tracking, commit analytics, code change metrics, and team-level filtering.

---

## Recommended Tech Stack (At a Glance)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend Framework** | React 18 + Vite + TypeScript | Best dashboard ecosystem, zero SSR overhead for auth-gated tool |
| **UI Components** | Material UI (MUI) + MUI X DataGrid | Production-ready data grid is decisive for PR/commit tables |
| **Charts (primary)** | Nivo | Modular, idiomatic React API, canvas support |
| **Charts (heatmap)** | Apache ECharts | Best calendar/contribution heatmap in ecosystem |
| **State Management** | TanStack Query v5 + Zustand | Server state caching + lightweight UI state |
| **Backend Runtime** | Node.js 22 LTS + TypeScript | Octokit (GitHub's SDK) is first-class TypeScript |
| **Backend Framework** | NestJS 10 (Fastify adapter) | Module system enforces clean service/repo separation |
| **Database** | PostgreSQL 16 | Relational integrity, window functions, JSONB flexibility |
| **ORM** | Prisma | Type-safe queries, migration management |
| **Background Jobs** | pg-boss | PostgreSQL-native job queue, no Redis dependency, retry/scheduling built-in |
| **Cache** | node-cache (in-process) | Zero-dependency in-memory caching, no external vendor for MVP |
| **GitHub Auth** | GitHub App | 15,000 req/hr rate limit, granular permissions, webhooks |
| **Deployment** | Vercel (frontend) + Railway (backend + DB) | Fastest time-to-production for MVP |
| **Monorepo** | Turborepo | Shared TypeScript types, single PR for full-stack features |
| **CI/CD** | GitHub Actions | Lint, typecheck, test, build, deploy |
| **Logging** | Winston | Structured JSON logging, transport-based (console, file, rotate), correlation IDs |

---

## 1. Frontend Architecture

### Why React + Vite (Not Next.js)

This is an **authentication-gated internal tool** with zero SEO requirements. The primary workload is rendering large tabular datasets, time-series charts, and filtered aggregate metrics. SSR adds complexity without benefit here.

- **Next.js/Remix/Gatsby eliminated**: SSR solves problems this project doesn't have. The `"use client"` boundary proliferates in a highly interactive app, fighting against framework conventions.
- **Angular eliminated**: React's advantage in data-grid and charting ecosystem is meaningful for this domain.
- **React + Vite wins**: Near-instant HMR, aggressive tree-shaking, the most mature dashboard component ecosystem.

### UI Component Library: MUI

MUI uniquely provides a **production-ready, virtualized data grid** (MUI X DataGrid) critical for PR lists and commit tables. No other library ships an equivalent without significant external integration.

- MUI X DataGrid Community: sorting, filtering, pagination, column customization
- Date pickers for filter ranges
- Autocomplete for contributor/repository selectors
- Strong theming system with dark mode support

**Alternative**: Shadcn/ui + TanStack Table for teams wanting maximum control and zero vendor lock-in.

### Charting: Nivo + ECharts

- **Nivo** (primary): Line, bar, pie/donut charts with idiomatic React API and canvas rendering variants
- **ECharts** (heatmaps only): Calendar-style contribution heatmaps are built-in natively

### State Management: TanStack Query + Zustand

- **TanStack Query**: All GitHub API interactions, caching, pagination, background refetching
- **Zustand**: Shared UI state (selected filters, sidebar state, user preferences)

### Frontend Folder Structure

```
/src
  /api                        # Data access layer
    github-client.ts          # Configured HTTP client
    /pull-requests
      pull-requests.api.ts
      pull-requests.types.ts
    /commits/  /contributors/  /repositories/

  /hooks                      # TanStack Query hooks
    usePullRequests.ts
    usePullRequestMetrics.ts
    useCommits.ts  useContributors.ts  useRepositories.ts

  /store                      # Zustand stores
    filter.store.ts           # Selected repos, date range, contributors, teams
    ui.store.ts               # Sidebar state, active view, preferences

  /components
    /charts/  /tables/  /filters/  /metrics/  /layout/

  /pages
    /dashboard/  /pull-requests/  /commits/  /contributors/
    /repositories/  /teams/

  /lib                        # Pure utilities
  /types                      # Shared TypeScript types
```

### Key Routes

```
/                             -> Dashboard (KPI overview)
/pull-requests                -> PR table + charts
/pull-requests/:id            -> PR detail
/commits                      -> Commit analytics
/contributors                 -> Contributor metrics
/contributors/:login          -> Contributor detail
/repositories                 -> Repository analytics
/teams                        -> Team metrics
```

---

## 2. Backend Architecture

### Why Node.js + NestJS

**Node.js** wins because Octokit (GitHub's official SDK) is a first-class TypeScript library with automatic pagination, rate limit handling, and both REST/GraphQL support. The platform's core dependency is GitHub integration -- using GitHub's own SDK eliminates an entire class of problems.

**NestJS** provides the module system that maps directly to this platform's domains: `GithubSyncModule`, `MetricsModule`, `AuthModule`, `TeamsModule`, `ReposModule`. Each module owns its controllers, services, and repository classes -- aligned with SOLID principles and clean service/repository separation.

### GitHub Authentication: GitHub App (From Day 1)

| Approach | Rate Limit | Multi-User | Webhooks | Recommendation |
|----------|-----------|------------|----------|----------------|
| PAT | 5,000/hr (shared) | No | No | Never for production |
| OAuth App | 5,000/hr per user | Yes | No | Fallback option |
| **GitHub App** | **15,000/hr per install** | **Yes** | **Yes** | **Recommended** |

Starting with PAT and migrating later costs weeks. Starting with GitHub App costs 2-3 extra days at MVP.

### GitHub Data Sync Strategy

#### MVP (Phase 1): Webhooks First

Start with real-time data via GitHub App webhooks. Data flows in as events happen — validates the data model against real GitHub payloads from day 1.

**GitHub App webhook events to subscribe to:**

- `pull_request` (opened, closed, merged, edited, review_requested)
- `pull_request_review` (submitted, edited, dismissed)
- `pull_request_review_comment` (created)
- `push` (commits pushed to any branch)

**Webhook handler flow (no API enrichment — store only what the webhook gives us):**

```
POST /api/v1/webhooks/github  (receives all events)
  -> Verify webhook signature (X-Hub-Signature-256)
  -> Route by X-GitHub-Event header:

  installation event:
    -> Upsert organization
    -> Upsert repositories (from event.repositories)

  pull_request event:
    -> Upsert repository (from event.repository)
    -> Upsert contributor (from event.pull_request.user)
    -> Upsert pull_request (state, additions, deletions, changed_files, timestamps)
    -> Update lifecycle timestamps (github_created_at, merged_at, etc.)

  pull_request_review event:
    -> Upsert contributor (from event.review.user)
    -> Upsert pr_review (state, submitted_at)
    -> Update pull_request.first_review_at / approved_at if applicable
    -> Update lifecycle timestamps (first_review_at, approved_at)

  push event:
    -> Upsert repository (from event.repository)
    -> For each commit in event.commits:
       -> Upsert contributor (from commit.author)
       -> Upsert commit (sha, message, timestamp)
```

**No API calls at MVP.** The webhook payloads provide: PR metadata, line stats (additions/deletions/changed_files), author, timestamps, review states, and commit info. The only data deferred is per-file breakdowns (`file_changes` table) — added via enrichment in Phase 2.

**Repository discovery:** On GitHub App installation, the `installation` webhook event provides the repo list.

**What you get at MVP:** PR tracking with cycle times, review data, commit history, and aggregate line stats — all from webhook payloads alone. Zero Octokit API calls during normal operation.

#### Phase 2+: Historical Backfill

Pull in data from before the GitHub App was installed. Unlike webhooks, backfill requires direct API calls because there are no payloads — we fetch everything ourselves.

**Important:** The PR list endpoint (`GET /repos/{owner}/{repo}/pulls`) returns PR metadata but does NOT include `additions`, `deletions`, or `changed_files`. Reviews and commits are also separate endpoints. So each PR requires multiple API calls to fully hydrate.

**Tracking model:**

Two-level tracking so we can report progress to the user at both org and repo granularity:

```
backfill_runs (org-level)
  id                UUID PRIMARY KEY
  organization_id   UUID NOT NULL REFERENCES organizations(id)
  status            BackfillRunStatus NOT NULL  -- enum: pending, discovering, in_progress, completed, failed, cancelled
  total_repos       INT           -- set after discovery
  completed_repos   INT DEFAULT 0
  failed_repos      INT DEFAULT 0
  started_at        TIMESTAMPTZ
  completed_at      TIMESTAMPTZ
  error_message     TEXT
  created_at        TIMESTAMPTZ DEFAULT now()

backfill_tasks (repo-level)
  id                UUID PRIMARY KEY
  backfill_run_id   UUID NOT NULL REFERENCES backfill_runs(id)
  repository_id     UUID NOT NULL REFERENCES repositories(id)
  status            BackfillTaskStatus NOT NULL  -- enum: pending, fetching_prs, enriching, completed, failed
  total_prs         INT           -- set after PR list fetch
  processed_prs     INT DEFAULT 0
  failed_prs        INT DEFAULT 0
  cursor            TEXT          -- GitHub API pagination cursor for resume
  started_at        TIMESTAMPTZ
  completed_at      TIMESTAMPTZ
  error_message     TEXT
  created_at        TIMESTAMPTZ DEFAULT now()
```

**Job chain (each step is a separate pg-boss job):**

```
Step 1: Discover Repos
  POST /api/v1/organizations/:orgId/backfill
  -> Create backfill_run (status: 'discovering')
  -> octokit.paginate(GET /orgs/{org}/repos)
  -> Create one backfill_task per repo (status: 'pending')
  -> Update backfill_run.total_repos
  -> Set backfill_run.status = 'in_progress'
  -> Enqueue Step 2 for each repo

Step 2: Fetch PRs (per repo) — 1 API call per page
  -> Set backfill_task.status = 'fetching_prs'
  -> octokit.paginate(GET /repos/{owner}/{repo}/pulls?state=all&sort=created&direction=desc)
  -> Upsert PR metadata into `pull_requests` (skip if already exists from webhook)
  -> Set backfill_task.total_prs = count of PRs found
  -> Save pagination cursor to backfill_task.cursor (for resume on failure)
  -> Enqueue Step 3 for each PR not already enriched

Step 3: Enrich PR (per PR) — 3 API calls per PR
  -> GET /repos/{owner}/{repo}/pulls/{number}
     → additions, deletions, changed_files, full timestamps
  -> GET /repos/{owner}/{repo}/pulls/{number}/reviews
     → review state, reviewer, submitted_at
  -> GET /repos/{owner}/{repo}/pulls/{number}/commits
     → commit SHAs, messages, authors, timestamps
  -> Upsert all into respective tables
  -> Increment backfill_task.processed_prs

Step 4: Complete repo + rebuild rollups
  -> When all PRs for a repo are done:
     Recompute daily metric rollups for that repo's full date range (single SQL aggregation)
     Weekly/monthly rollups derive from daily as usual
     Set backfill_task.status = 'completed', completed_at = now()
     Increment backfill_run.completed_repos
  -> When all repos are done:
     Set backfill_run.status = 'completed', completed_at = now()
```

**API cost estimate:** ~3 API calls per PR + 1 per page of PR list. For a repo with 500 PRs: ~1,510 calls. With 15,000/hr rate limit, one repo takes ~6 minutes. Large orgs may take hours.

**Runs fully in the background.** Trigger via `POST /api/v1/organizations/:orgId/backfill`, then data appears incrementally in the dashboard as repos complete. No dedicated progress UI needed — the tracking tables (`backfill_runs` / `backfill_tasks`) are for internal job coordination and logging only.

**Rate limit handling:**

- Use `@octokit/plugin-throttling` for automatic retry on 403/429
- When remaining < 500: pg-boss delays the next job until `X-RateLimit-Reset`

**Error handling:**

- Failed jobs retry 3x with exponential backoff (pg-boss built-in)
- One repo failing doesn't block the rest
- Failed tasks log error to `backfill_tasks.error_message` for debugging via DB

### API Design: REST

REST is the correct choice at MVP stage. The query patterns are well-defined and stable. GraphQL adds schema management complexity not justified yet.

**Key Endpoints (prefixed `/api/v1`):**

```
# Organizations & Setup
GET    /organizations
POST   /organizations/:orgId/backfill          # Trigger historical backfill (background)

# Repositories
GET    /organizations/:orgId/repositories
GET    /repositories/:repoId

# Pull Requests
GET    /repositories/:repoId/pull-requests
GET    /pull-requests/:prId
GET    /pull-requests/:prId/metrics

# Metrics & Analytics
GET    /organizations/:orgId/metrics/cycle-time
GET    /organizations/:orgId/metrics/review-time
GET    /organizations/:orgId/metrics/merge-frequency
GET    /organizations/:orgId/metrics/code-changes
GET    /organizations/:orgId/contributors
```

All list/metrics endpoints accept: `?from=`, `?to=`, `?repositories=`, `?contributors=`, `?teams=`, `?groupBy=day|week|month`

**Pagination:** Cursor-based (not offset) to handle records inserted during iteration.

### Metrics Computation

**Cycle Time Breakdown:**
- **Coding Time**: first commit -> PR created
- **Pickup Time**: PR created -> first review
- **Review Time**: first review -> approved
- **Deploy Time**: approved -> merged

These are **calculated at query time** from the lifecycle timestamps on the PR row. No pre-computed columns — the timestamps are the source of truth, and PostgreSQL handles the subtraction trivially even at scale. The daily/weekly/monthly rollups in `metric_rollups` cache the aggregated results for dashboard queries.

**Aggregation Strategy:** Raw events -> daily rollups -> weekly/monthly rollups derived from daily. For webhooks (real-time): upsert into today's daily rollup on each event. For backfill (historical): recompute daily rollups per repo in batch after all PRs are imported (avoids concurrency issues across pg-boss jobs).

### Backend Folder Structure

```
/src
  /modules
    /auth/          # JWT, sessions, guards
    /github/        # Octokit wrapper, token management, rate limit tracking
    /sync/          # Sync orchestration + pg-boss workers
    /organizations/ /repositories/ /pull-requests/ /metrics/ /teams/ /webhooks/
  /common
    /middleware/  /interceptors/  /filters/  /decorators/  /pagination/
  /config/
  /prisma/          # Schema + migrations
```

Each module follows: `module.ts` -> `controller.ts` -> `service.ts` -> `repository.ts` -> `/models/`

---

## 3. Database Architecture

### Why PostgreSQL

The data model is inherently relational: PRs have reviews, reviews have comments, commits belong to PRs, PRs belong to repositories, repositories belong to organizations.

- **Foreign key integrity** catches data consistency bugs during sync
- **Window functions** (LAG, LEAD, RANK, PERCENTILE_CONT) are essential for cycle time calculations
- **JSONB columns** store raw GitHub API responses alongside structured columns
- **Partial indexes** directly support the dominant query patterns

### Schema Overview

**Core Tables:**

| Table | Description | Key Indexes |
|-------|-------------|-------------|
| `organizations` | GitHub orgs | `github_id` UNIQUE |
| `repositories` | Connected repos | `(organization_id)`, `github_id` UNIQUE |
| `contributors` | GitHub users | `github_id` UNIQUE, `login` UNIQUE |
| `teams` | Platform-defined teams | `(organization_id, slug)` UNIQUE |
| `team_memberships` | Team <-> contributor | `(team_id, contributor_id)` UNIQUE |
| `pull_requests` | Central analytical entity | `(repository_id, merged_at)` partial, covering index for cycle time |
| `pr_reviewers` | Requested/participating reviewers | `(pull_request_id, contributor_id)` UNIQUE |
| `pr_reviews` | Individual review submissions | `(reviewer_id, submitted_at)` |
| `pr_review_comments` | Line comments within reviews | `(pull_request_id)` |
| `commits` | Commit data with stats | `(repository_id, committed_at)` |
| `pull_request_commits` | PR <-> commit join | `(pull_request_id, commit_id)` UNIQUE |
| `file_changes` | Per-file changes per commit (highest volume) | `(commit_id)`, `(repository_id, file_path)` |
| `backfill_runs` | Org-level backfill tracking | `(organization_id)`, `(status)` |
| `backfill_tasks` | Repo-level backfill progress | `(backfill_run_id)`, `(repository_id)` |
| `metric_rollups` | Pre-computed aggregated metrics | `(organization_id, period_type, period_start)` |

### Pull Requests Table (Central Entity)

```sql
pull_requests
  id                    UUID PRIMARY KEY
  repository_id         UUID NOT NULL REFERENCES repositories(id)
  author_id             UUID REFERENCES contributors(id)
  github_id             BIGINT NOT NULL
  number                INTEGER NOT NULL
  title                 TEXT NOT NULL
  url                   TEXT NOT NULL     -- GitHub html_url for linking back
  state                 PrState NOT NULL  -- enum: open, closed, merged
  additions             INTEGER NOT NULL DEFAULT 0
  deletions             INTEGER NOT NULL DEFAULT 0
  changed_files         INTEGER NOT NULL DEFAULT 0

  -- Lifecycle timestamps (cycle time derived from these at query time)
  github_created_at     TIMESTAMPTZ NOT NULL
  first_commit_at       TIMESTAMPTZ
  first_review_at       TIMESTAMPTZ
  approved_at           TIMESTAMPTZ
  merged_at             TIMESTAMPTZ

  UNIQUE (repository_id, number)
```

### Critical Query Patterns

All critical dashboard queries are supported by the schema:

1. **PRs by repo + date range** -> composite index on `(repository_id, merged_at)`
2. **Avg cycle time per contributor** -> derived from lifecycle timestamps, cached in `metric_rollups`
3. **Code churn over time** -> served from `metric_rollups` table
4. **Top contributors** -> served from `metric_rollups` table (single-digit ms)
5. **Team velocity trends** -> served from `metric_rollups` with team dimension

### ORM: Prisma + Raw SQL Analytics Layer

- **Prisma Client** for all CRUD operations and simple filtering
- **`prisma.$queryRaw`** wrapped in typed `AnalyticsRepository` for window functions and PERCENTILE_CONT aggregations

### Scaling Path

At 1,000 PRs/month + 10,000 commits/month per org:
- 5 years, single org: ~5-7M rows total -> single PostgreSQL, no partitioning needed
- 50 orgs at scale: ~250-350M rows -> read replica, then TimescaleDB extension
- Defer partitioning until `file_changes` exceeds 100M rows

---

## 4. System Architecture

### Architecture Diagram

```
                         GitHub API (REST v3 / GraphQL v4)
                              |              |
                    Polling (cron)      Webhooks (Phase 3)
                              |              |
    +---------------------------------------------------------+
    |                  BACKEND (Railway)                        |
    |                                                          |
    |  +------------------+     +------------------+           |
    |  | API Server       |     | Sync Workers     |           |
    |  | (NestJS/Fastify) |     | (pg-boss)        |           |
    |  |                  |     |                  |           |
    |  | Routes, Guards,  |     | Initial sync     |           |
    |  | Services, Repos  |     | Incremental sync |           |
    |  +--------+---------+     | PR enrichment    |           |
    |           |               | Metrics compute  |           |
    |           |               +--------+---------+           |
    |           |                        |                     |
    |    +------+--------+      +--------+--------+            |
    |    | PostgreSQL 16  |      | In-process      |            |
    |    | (all data)     |      | node-cache      |            |
    |    +----------------+      | (metric cache)  |            |
    |                            +-----------------+            |
    +---------------------------------------------------------+
                              |
                         REST API (JSON)
                              |
    +---------------------------------------------------------+
    |                 FRONTEND (Vercel)                         |
    |  React 18 + Vite + MUI + Nivo + TanStack Query          |
    +---------------------------------------------------------+
                              |
                         End User (Browser)
```

### Deployment: Vercel + Railway (MVP)

| Component | Platform | Cost |
|-----------|----------|------|
| Frontend | Vercel (free tier) | $0 |
| Backend API + Workers | Railway | $5-20/mo |
| PostgreSQL | Railway managed | included |
| **Total MVP** | | **$5-20/mo** |

**Growth path:** Railway scaled up -> Fly.io -> AWS ECS (enterprise phase)

### Monorepo Structure (Turborepo)

```
github-tracker/
  packages/
    shared/                   # Shared TypeScript types & utilities

  apps/
    web/                      # React + Vite frontend
      src/
        api/  hooks/  store/  components/  pages/  lib/  types/

    api/                      # NestJS backend
      src/
        modules/  common/  config/  prisma/

  turbo.json
  docker-compose.yml          # Local dev (Postgres)
  .github/workflows/          # CI/CD
```

### CI/CD Pipeline (GitHub Actions)

```
On PR:     lint -> typecheck -> test-unit -> build -> e2e (parallel where possible)
On merge:  full CI -> deploy frontend (Vercel) -> deploy backend (Railway) -> run migrations
```

### Security

- **Auth**: NextAuth.js v5 with GitHub OAuth provider
- **Authorization**: Role-based (Owner, Admin, Member, Viewer)
- **Token storage**: AES-256-GCM encryption at rest, decrypted only in-memory
- **API security**: Rate limiting, CORS whitelist, Zod validation, Helmet headers, CSRF tokens

---

## 5. UI/UX Design

### Layout Structure

```
+--------------------------------------------------+
|  [Logo]  [Org Switcher]          [Search] [User] |  <- Top bar (56px)
+--------+-----------------------------------------+
|        |  [Date Range] [Repos] [Contributors] [+]|  <- Filter bar (48px, sticky)
|  Nav   +-----------------------------------------+
| 240px  |                                         |
| sidebar|         Content Area (max 1400px)        |
| (icon  |                                         |
| collapse|                                         |
| 64px)  |                                         |
+--------+-----------------------------------------+
```

**Sidebar navigation:** Overview, Pull Requests, Contributors, Repositories, Teams, Settings

### Key Pages

**Overview Dashboard:**
- 5 KPI cards: PRs Merged, Avg Cycle Time, Active Open PRs, Code Throughput, Review Response Time
- Primary chart: PR throughput + cycle time dual-axis line chart
- Top 5 active repos ranked list
- "Needs attention" panel (PRs breaching SLA)

**Pull Requests View:**
- Full-width dense data table (MUI X DataGrid)
- Columns: Status, Title, Repo, Author, Reviewers, Age, Cycle Time, Lines Changed
- Right-side drawer (600px) for PR detail without losing list context
- PR detail shows: event timeline, cycle time breakdown, review activity

**Contributors View:**
- Table with: PRs Merged, Lines Added/Removed, Reviews Given, Avg Review Time, Avg Cycle Time
- Card grid alternative view with 12-week activity sparklines
- Radar chart for comparing 2-5 contributors on normalized dimensions
- GitHub-style contribution heatmap on detail pages

**Repository Analytics:**
- Code churn mirror chart (additions above axis, deletions below)
- PR velocity trend bars with rolling average overlay
- PR size distribution histogram with cycle time correlation line

**Team View:**
- Team-level aggregated metrics
- Cross-team comparison (grouped bar chart + sortable table)

### Filter UX

- Filters persist across page navigation in URL parameters
- Every filtered view is shareable via URL
- Saved filter presets per user
- Active filter chips with "Clear all" option

### Data Visualization Choices

| Metric | Chart Type |
|--------|-----------|
| PR throughput over time | Grouped bar + trend line |
| Cycle time distribution | Box plot + strip plot |
| Code churn trends | Mirror/diverging area chart |
| Review time breakdown | Stacked horizontal bar |
| Contributor comparison | Radar chart + data table |
| Team velocity | Slope chart (period comparison) |
| Contribution patterns | Calendar heatmap (individual), bubble timeline (team) |

### Design System

- **Typography**: Inter (primary), JetBrains Mono (code/numbers)
- **Spacing**: 8px base grid with 4px half-step
- **Colors**: 8-color categorical palette designed for colorblind accessibility
- **Dark mode**: Equal citizen from day 1, token-based adaptation
- **Accessibility**: WCAG 2.1 AA, full keyboard navigation, screen reader support

### Interaction Patterns

- **Loading**: Skeleton screens (primary), inline spinners for filter refresh
- **Empty states**: Context-specific messages with clear actions
- **Drill-down**: KPI card -> filtered list -> detail drawer -> GitHub (external)
- **Chart tooltips**: 200ms delay, positioned above cursor, contextual data

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-6) - MVP Core

**Week 1-2: Scaffolding & Auth**
- Monorepo setup (Turborepo, shared types, ESLint, Prettier)
- Database schema (Prisma) for core entities
- Backend skeleton (NestJS, routes, middleware, health check)
- GitHub OAuth (NextAuth.js)
- CI pipeline (GitHub Actions)
- Local dev environment (Docker Compose)
- Deployment (Vercel + Railway)

**Week 3-4: Webhook Ingestion**
- GitHub App setup with webhook endpoint
- Webhook signature verification
- Event handlers for `installation`, `pull_request`, `pull_request_review`, `push`
- Upsert logic for all entities (orgs, repos, contributors, PRs, reviews, commits)
- Lifecycle timestamp tracking on PR upsert

**Week 5-6: Core Dashboard**
- Layout shell (sidebar, top bar, filter bar)
- Dashboard overview (5 KPI metric cards)
- PR list page (sortable table with filters)
- Commit list page
- Basic filters (date range, repo, contributor)

**Deliverable**: Users install the GitHub App, data flows in via webhooks in real-time, dashboard shows all activity from installation forward.

### Phase 2: Enhanced Analytics + Backfill (Weeks 7-12)

- Historical data backfill worker with pg-boss job chain + progress UI
- PR metrics dashboard (cycle time distribution, time-to-first-review, PR size distribution)
- Commit analytics (frequency heatmap, code trends)
- Code change metrics (additions/deletions by repo/team/contributor)
- Trend charts (week-over-week, month-over-month)
- Team management (create teams, assign contributors)
- Team dashboard with cross-team comparisons
- Contributor profiles with activity timelines
- Repository dashboard with health indicators
- Pre-computed metric rollups (background job)
- Advanced filters + saved presets

### Phase 3: Scale & Polish (Weeks 13-20)

- Performance optimization (index audit, caching layer review)
- Multi-org support
- Dark mode
- Data export (CSV/JSON)
- Onboarding flow (guided setup)

### Phase 4: Advanced Features (Weeks 21-30)

- Custom dashboards (drag-and-drop widget builder)
- Alerting & notifications (stale PRs, threshold breaches -> email + Slack)
- DORA metrics (deployment frequency, lead time, change failure rate, MTTR)
- Public API with API key auth + OpenAPI docs
- Slack integration (weekly digest, PR reminders)
- Review analytics (turnaround time, reviewer load balancing)
- Investment allocation (categorize PRs: feature, bug fix, tech debt)

---

## 7. Risk Analysis

| Risk | Severity | Mitigation |
|------|----------|------------|
| **GitHub API rate limits** | High | GitHub App (15K/hr), conditional requests (ETags), incremental sync, smart scheduling, circuit breaker at <200 remaining |
| **Data consistency during sync** | Medium | Atomic sync per repo (transactions), idempotent upserts, "sync in progress" UI indicator |
| **Performance at scale** | Medium | Pre-computed rollups, covering indexes, in-memory caching (5-min TTL), cursor pagination, lazy-load charts |
| **Cost scaling** | Low (MVP) | Free tiers for early dev, data retention policy (archive raw data >12 months), store metadata not diffs |
| **GitHub API changes** | Low | All calls behind `GitHubClient` abstraction, pinned Octokit version, MSW mock tests |

---

## 8. Competitive Feature Matrix

| Feature | LinearB | Jellyfish | Sleuth | Swarmia | **Our Platform** |
|---------|---------|-----------|--------|---------|-----------------|
| PR Tracking | Yes | Yes | Yes | Yes | **Phase 1** |
| Cycle Time Breakdown | Yes | Partial | Yes | Yes | **Phase 2** |
| Team Metrics | Yes | Yes | Partial | Yes | **Phase 2** |
| Code Change Metrics | Yes | Partial | No | Yes | **Phase 2** |
| DORA Metrics | Yes | Partial | Yes | Partial | Phase 4 |
| Investment Allocation | Yes | Yes | No | Partial | Phase 4 |
| Working Agreements | No | No | No | Yes | Phase 4 |
| Custom Dashboards | Partial | Yes | No | No | Phase 4 |
| Slack Integration | Yes | Yes | Yes | Yes | Phase 4 |
| AI Insights | Partial | Partial | No | No | Future |
