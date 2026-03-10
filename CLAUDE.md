# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GitHub-based engineering management platform (similar to LinearB/Jellyfish) that tracks PRs, commits, code changes, and team productivity metrics. Full-stack monorepo with React/Vite frontend, NestJS backend, and PostgreSQL database. Data flows via GitHub App webhooks (real-time) and historical backfill (background API calls).

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed tech stack rationale and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the phased roadmap. Epic details live in [epics/](epics/).

## Common Commands

```bash
# Install dependencies
pnpm install

# Development (starts both frontend port 5173 and backend port 3000)
pnpm run dev

# Build / lint / typecheck (all via Turborepo)
pnpm run build
pnpm run lint
pnpm run typecheck

# Formatting
pnpm format            # write
pnpm format:check      # check only

# Backend tests (Jest)
cd apps/api
pnpm run test                        # all unit tests
pnpm run test -- --testPathPattern=pull-requests  # single module
pnpm run test:e2e                    # E2E tests

# Frontend tests (Vitest)
cd apps/web
pnpm run test                        # all tests
pnpm run test:watch                  # watch mode

# Database (from apps/api)
pnpm run db:migrate          # create + apply migration (interactive)
pnpm run db:migrate:deploy   # apply pending migrations (CI/prod)
pnpm run db:generate         # regenerate Prisma client
pnpm run db:studio           # visual DB explorer

# Local Postgres
docker compose up -d         # start
docker compose down -v       # reset data
```

## Architecture

### Monorepo (Turborepo + pnpm workspaces)

- **apps/api** — NestJS 11 backend (Fastify adapter), Prisma ORM, PostgreSQL
- **apps/web** — React 18 + Vite 6, MUI 6, TanStack Query 5, Zustand 5
- **packages/shared** — Shared TypeScript types between frontend and backend

### Backend Module Pattern

Each feature module in `apps/api/src/modules/{feature}/` follows:

```text
{feature}.module.ts        → NestJS module registration
{feature}.controller.ts    → HTTP handlers + route definitions
{feature}.service.ts       → Business logic
{feature}.repository.ts    → Data access (one repository per DB model)
models/
  {feature}.models.ts      → Domain interfaces
  {feature}.response.ts    → API response DTOs
  {feature}-query.dto.ts   → Query parameter DTOs
```

Controllers handle HTTP only. Services contain business logic. Repositories abstract all Prisma queries. Models are always in separate files from logic.

Current modules: organizations, repositories, pull-requests, commits, contributors, pr-reviews, metrics, webhooks.

### Frontend Data Flow

```text
api/{feature}.api.ts  →  hooks/use{Feature}.ts  →  pages/{Feature}Page.tsx
    (HTTP calls)         (TanStack Query)           (UI rendering)
```

- **api/** — Typed HTTP client + endpoint functions per feature, with separate `.types.ts` files
- **hooks/** — TanStack Query hooks for server state
- **store/** — Zustand stores for UI state (filters, sidebar)
- **components/** — Reusable UI components (layout, tables, metrics)
- **pages/** — Route-level page components

The frontend uses `@` path alias resolving to `apps/web/src/`.

### API Design

REST endpoints prefixed with `/api/v1`. Cursor-based pagination (not offset). Vite dev server proxies `/api` to `localhost:3000`.

Key routes: `/organizations`, `/organizations/:orgId/repositories`, `/repositories/:repoId/pull-requests`, `/organizations/:orgId/metrics/merge-frequency`.

Metrics endpoints accept: `from`, `to`, `groupBy` (day/week/month), `repositories` (comma-separated IDs).

### Database

Prisma schema at `apps/api/prisma/schema.prisma`. Prisma client is generated to `apps/api/src/generated/prisma`.

Central entity is `pull_requests` with lifecycle timestamps (`github_created_at`, `first_commit_at`, `first_review_at`, `approved_at`, `merged_at`). Cycle time metrics are calculated at query time from these timestamps.

### Webhook Pipeline

`POST /api/v1/webhooks/github` receives events, verified via HMAC-SHA256 (`WebhookSignatureGuard`). Routes by `X-GitHub-Event` header. Upserts data atomically from webhook payloads — no API enrichment calls at MVP.

## Environment

Backend config validated at startup via Zod (`apps/api/src/config/config.schema.ts`):

- `DATABASE_URL` — PostgreSQL connection string
- `GITHUB_WEBHOOK_SECRET` — Required for webhook signature verification
- `PORT` — defaults to 3000
- `NODE_ENV` — development/production/test

Copy `.env.example` files for both root and `apps/api/`.

## Code Style

- **Prettier**: single quotes, trailing commas, 100 char width, semicolons
- **ESLint**: `@typescript-eslint/consistent-type-imports` enforced (use `import type`), `no-explicit-any` warned. API app has `no-console` and `consistent-type-imports` disabled
- Generated code (`**/generated/**`) is excluded from linting
