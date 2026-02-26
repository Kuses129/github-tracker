# Implementation Plan — GitHub Engineering Management Platform

## What We're Building

A GitHub-based engineering management platform that tracks pull requests, commits, code changes, and team productivity metrics. Data flows in via GitHub App webhooks (real-time) and historical backfill (background API calls). See [ARCHITECTURE.md](ARCHITECTURE.md) for full technical decisions.

### Approach: POC First, Then Production

We build a **local POC first** — monorepo, database, backend, frontend, webhook pipeline, backfill pipeline — wired up for **one metric** end-to-end: **PRs Merged** (the simplest). Everything runs locally with Docker Compose. No deployment, no CI/CD, no auth until the core data flow is proven.

Once the POC works end-to-end (webhook → DB → API → dashboard), we harden for production: add CI/CD, deployment, and authentication. Then we add more metrics incrementally.

```
                      Vertical Slice #1: "PRs Merged"
                      ================================

  GitHub ──webhook──> Backend ──upsert──> PostgreSQL
                                              |
  GitHub <──backfill API──── pg-boss jobs ────┘
                                              |
  Browser <──REST API──── NestJS ─────────────┘
     |
     └── Dashboard: KPI card + bar chart showing PRs merged over time
```

After this works end-to-end, each additional metric is a thin layer on top of proven infrastructure.

---

## Epic Files

Each epic is a standalone file with enriched user stories (implementation details, testing details, definition of done). See [epics/README.md](epics/README.md) for the full index.

### Phase 1: Foundation + First Metric (Weeks 1-6)

| Epic | Timeline | Stories | Description |
| ---- | -------- | ------- | ----------- |
| [Epic 1: Project Scaffolding](epics/epic-01-project-scaffolding.md) | Week 1 | US-001 – US-005 | Monorepo, backend, DB, Docker, frontend |
| [Epic 2: Webhook Pipeline](epics/epic-02-webhook-pipeline.md) | Week 2-3 | US-009 – US-013 | GitHub App + event handlers |
| [Epic 3: First Metric — PRs Merged](epics/epic-03-first-metric-prs-merged.md) | Week 3-4 | US-014 – US-019 | REST APIs + dashboard |
| [Epic 4: Historical Backfill](epics/epic-04-historical-backfill.md) | Week 4-5 | US-020 – US-021 | pg-boss job chain + rollups |
| [Epic 5: Production Readiness](epics/epic-05-production-readiness.md) | Week 5 | US-022 – US-024 | CI/CD, deployment, auth |
| [Epic 6: End-to-End Smoke Test](epics/epic-06-e2e-smoke-test.md) | Week 6 | US-025 | Full pipeline validation |

### Phase 2: Adding Metrics + Teams (Weeks 7-12)

| Epic | Timeline | Stories | Description |
| ---- | -------- | ------- | ----------- |
| [Epic 7: Cycle Time Metrics](epics/epic-07-cycle-time-metrics.md) | Weeks 7-8 | US-026 – US-028 | Cycle time API + dashboard |
| [Epic 8: Code Change & Review Metrics](epics/epic-08-code-change-review-metrics.md) | Weeks 8-9 | US-029 – US-031 | Code churn + review time |
| [Epic 9: Commit Analytics](epics/epic-09-commit-analytics.md) | Weeks 9-10 | US-032 – US-033 | Commit list + heatmap |
| [Epic 10: Teams & Contributor Profiles](epics/epic-10-teams-contributor-profiles.md) | Weeks 10-11 | US-034 – US-037 | Team CRUD + contributor pages |
| [Epic 11: Advanced Filters + Rollups](epics/epic-11-advanced-filters-rollups.md) | Weeks 11-12 | US-038 – US-039 | Filter presets + trend comparisons |

### Phase 3: Scale & Polish (Epics Only)

_Broken down into stories when we get here._

- **Multi-org support** — Org switcher in top bar, data isolation per org
- **Performance optimization** — Index audit, query analysis, caching layer review, lazy-load charts
- **Dark mode** — Token-based theme switching, equal citizen with light mode
- **Data export** — CSV/JSON export for any table or chart view
- **Onboarding flow** — Guided setup wizard for first-time users (install GitHub App, select repos)

### Phase 4: Advanced Features (Epics Only)

_Broken down into stories when we get here._

- **Custom dashboards** — Drag-and-drop widget builder with saved layouts
- **Alerting & notifications** — Stale PR alerts, cycle time threshold breaches → email + Slack
- **DORA metrics** — Deployment frequency, lead time, change failure rate, MTTR
- **Public API** — API key auth + OpenAPI/Swagger docs
- **Slack integration** — Weekly digest, PR reminders, team summaries
- **Review analytics** — Reviewer load balancing, turnaround time distribution
- **Investment allocation** — Categorize PRs: feature, bug fix, tech debt, maintenance
