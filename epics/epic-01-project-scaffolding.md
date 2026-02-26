# Epic 1: Project Scaffolding (Week 1)

---

## US-001: Monorepo Setup

Set up the Turborepo monorepo with shared TypeScript configuration, linting, and formatting.

**Parallel:** None — this is the first story. Everything depends on it.

**Recommended Agents:** `platform-engineer`, `typescript-pro`

---

### Implementation Details

**Step 1 — Initialize the repository and package manager**

Create the root `package.json` with `"private": true` and define all three workspaces. Use pnpm workspaces throughout — no npm or yarn.

```
package.json                    # root — workspaces, scripts, devDependencies
pnpm-workspace.yaml             # lists apps/*, packages/*
.npmrc                          # shamefully-hoist=true to avoid phantom deps with NestJS
```

**Step 2 — Turborepo configuration**

`turbo.json` at the root defines four pipelines. Each pipeline should declare its `dependsOn`, `outputs` (for caching), and `inputs` where relevant:

- `build`: depends on `^build` (upstream workspaces must build first), outputs `dist/**`
- `dev`: no `dependsOn`, persistent process
- `lint`: no cache (always re-runs), no `dependsOn`
- `typecheck`: no `dependsOn`, outputs `[]` (type checking has no meaningful artifact)

**Step 3 — TypeScript base configuration**

```
tsconfig.base.json              # root — shared compiler options
  compilerOptions:
    target: ES2022
    module: NodeNext
    moduleResolution: NodeNext
    strict: true
    esModuleInterop: true
    skipLibCheck: true
    declaration: true
    declarationMap: true
    sourceMap: true
```

Each workspace extends this base:

```
apps/api/tsconfig.json          # extends ../../tsconfig.base.json, adds paths, rootDir/outDir
apps/web/tsconfig.json          # extends ../../tsconfig.base.json, adds lib: [DOM], jsx: react-jsx
packages/shared/tsconfig.json   # extends ../../tsconfig.base.json, minimal config for a pure-types package
```

**Step 4 — ESLint + Prettier**

Install at root; workspaces inherit via the root `eslint.config.mjs` (flat config format for ESLint v9+). Do not duplicate config per workspace.

```
.eslintrc is replaced by:
eslint.config.mjs               # flat config — applies to all workspaces
  rules:
    @typescript-eslint/no-explicit-any: warn
    @typescript-eslint/consistent-type-imports: error
    no-console: warn (except apps/api which uses Winston)

.prettierrc                     # root — single source of truth
  singleQuote: true
  trailingComma: 'all'
  printWidth: 100
  semi: true

.prettierignore                 # dist/, node_modules/, *.generated.*
```

**Step 5 — `packages/shared` scaffold**

This package exists only to export types and pure utility functions shared between `apps/api` and `apps/web`. It must not import from either app.

```
packages/shared/
  package.json                  # name: "@repo/shared", exports: ./src/index.ts
  tsconfig.json
  src/
    index.ts                    # re-exports everything
    types/
      pagination.types.ts       # PaginatedResponse<T>, CursorPaginationParams
      health.types.ts           # HealthResponse (used by both apps for type safety)
```

The `HealthResponse` type serves as the concrete example imported by both workspaces in the DoD:

```typescript
// packages/shared/src/types/health.types.ts
export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
}
```

**Step 6 — `.gitignore`**

Single root-level `.gitignore` covering all workspaces:

```
node_modules/
dist/
.turbo/
.env
.env.local
*.tsbuildinfo
```

---

### Testing Details

US-001 has no runtime code and therefore no unit/integration tests. Validation is done through build pipeline execution.

**Verification commands (run in CI, not test files):**

- `pnpm install --frozen-lockfile` — validates lockfile is committed and complete
- `pnpm turbo typecheck` — validates all three tsconfigs compile cleanly with zero errors
- `pnpm turbo lint` — validates ESLint config parses and runs across all workspaces
- `pnpm turbo build` — validates build pipeline outputs `dist/` for `packages/shared`

**Smoke test for shared type import:**

```
apps/api/src/shared-import.check.ts   # temporary file — import { HealthResponse } from '@repo/shared'; const _: HealthResponse = { status: 'ok', timestamp: '' };
apps/web/src/shared-import.check.ts   # same import — confirms web workspace resolves the package
```

These files are removed once the type resolution is confirmed by the `typecheck` pipeline passing in CI.

---

### Definition of Done

- [ ] Turborepo initialized with `apps/web`, `apps/api`, `packages/shared` workspaces
- [ ] Root `tsconfig.json` with path aliases, per-workspace `tsconfig.json` extending base
- [ ] ESLint + Prettier configured at root, shared config across workspaces
- [ ] `packages/shared` exports a sample TypeScript type, imported by both `apps/web` and `apps/api`
- [ ] `turbo.json` defines `build`, `dev`, `lint`, `typecheck` pipelines
- [ ] `pnpm install` + `pnpm turbo build` succeeds from fresh clone
- [ ] `.gitignore` covers `node_modules`, `dist`, `.env`, `.turbo`

---

## US-002: Backend Skeleton

Scaffold the NestJS backend with Fastify adapter, config module, health check, Winston logging, and global error handling.

**Parallel:** After US-001. Can run in parallel with US-003, US-004, US-005.

**Recommended Agents:** `backend-developer`, `typescript-pro`

---

### Implementation Details

**Folder structure — final state of this story**

```
apps/api/
  src/
    main.ts                             # bootstrap, Fastify adapter, global pipes
    app.module.ts                       # root module — imports ConfigModule, HealthModule
    config/
      config.module.ts                  # re-exports NestJS ConfigModule with Zod validation
      config.schema.ts                  # Zod schema for all env vars
      config.types.ts                   # typed interface derived from Zod schema (AppConfig)
    health/
      health.module.ts
      health.controller.ts              # GET /health
      health.service.ts                 # returns HealthResponse from @repo/shared
      models/
        health-response.model.ts        # maps HealthResponse to NestJS response DTO
    common/
      filters/
        all-exceptions.filter.ts        # global exception filter
      interceptors/
        correlation-id.interceptor.ts   # attaches x-correlation-id to every response
      logger/
        logger.module.ts                # Winston logger as a NestJS provider
        logger.service.ts               # wraps Winston, exposes log/warn/error/debug
        logger.factory.ts               # builds the Winston transport configuration
  prisma/                               # created in US-003 — leave empty for now
  test/
    app.e2e-spec.ts                     # end-to-end test for /health
  package.json
  tsconfig.json
```

**`main.ts` — key decisions**

- Use `@nestjs/platform-fastify` with `FastifyAdapter`
- Register global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true`
- Register `AllExceptionsFilter` globally via `useGlobalFilters`
- Set `app.setGlobalPrefix('api/v1')` — all routes are prefixed, except `/health` which is excluded from the prefix via a `@Controller` option
- Read port from `ConfigService`, defaulting to `3000`

```typescript
// apps/api/src/main.ts (outline)
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }), // Winston handles logging, not Fastify's built-in
  );
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new AllExceptionsFilter(app.get(LoggerService)));
  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
}
```

**`config/config.schema.ts` — Zod validation**

```typescript
// apps/api/src/config/config.schema.ts
import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  CORRELATION_ID_HEADER: z.string().default('x-correlation-id'),
});

export type AppConfig = z.infer<typeof configSchema>;
```

The `ConfigModule` is initialized with a `validate` function that calls `configSchema.parse(process.env)` and throws on the first error, crashing the process at startup — intentional fail-fast behavior.

**`health/health.controller.ts`**

- Route: `GET /health` (excluded from `api/v1` prefix)
- Returns `HealthResponse` from `@repo/shared` with `status: 'ok'` and current ISO timestamp
- No authentication guard — health check must be publicly accessible for Railway health checks

**`common/filters/all-exceptions.filter.ts`**

Catches all unhandled exceptions and returns a consistent error envelope:

```typescript
// Shape of every error response from this API
interface ErrorResponse {
  statusCode: number;
  message: string;
  correlationId: string;
  timestamp: string;
  path: string;
}
```

- `HttpException` instances: use their built-in status and message
- All other errors: return `500` with `'Internal server error'` — never leak stack traces or raw error messages in production

**`common/interceptors/correlation-id.interceptor.ts`**

- Reads `x-correlation-id` from the incoming request header
- If absent, generates a UUID v4
- Attaches it to the response header and stores it in `AsyncLocalStorage` so the logger can include it in every log line from that request

**`common/logger/logger.service.ts`**

Winston configuration:

```typescript
// Transport decisions:
// - development: colorized console output for readability
// - production: JSON-only console (Railway captures stdout)
// - test: silent (no log noise during test runs)

// Log format always includes:
{
  level, message, timestamp,
  correlationId,   // from AsyncLocalStorage
  context,         // passed by the caller (class name)
  ...meta          // any additional fields
}
```

The `LoggerService` is a NestJS provider with `log(message, context?, meta?)`, `warn(...)`, `error(message, stack?, context?)`, `debug(...)` methods. It implements NestJS's `LoggerService` interface so it can replace the default Nest logger.

---

### Testing Details

**Test file locations:**

```
apps/api/src/health/health.controller.spec.ts   # unit test
apps/api/src/health/health.service.spec.ts      # unit test
apps/api/test/app.e2e-spec.ts                    # integration test
```

**`health.controller.spec.ts` — unit test**

Test using NestJS `Test.createTestingModule`. Mock `HealthService` to return a fixed `HealthResponse`.

Scenarios:
- `GET /health` calls `healthService.getHealth()` and returns its result
- The returned object has `status: 'ok'` and a `timestamp` string
- HTTP status is `200`

Mock setup: `HealthService` is provided as `{ provide: HealthService, useValue: { getHealth: jest.fn().mockReturnValue({ status: 'ok', timestamp: '2026-02-26T00:00:00.000Z' }) } }`

**`health.service.spec.ts` — unit test**

No dependencies to mock.

Scenarios:
- `getHealth()` returns an object matching the `HealthResponse` interface
- `status` is always `'ok'`
- `timestamp` is a valid ISO 8601 string (verify with `new Date(result.timestamp).toISOString() === result.timestamp`)

**`app.e2e-spec.ts` — integration test**

Uses `@nestjs/testing` + `supertest` with Fastify adapter. Starts the full application against a test configuration (DATABASE_URL points to test DB or is mocked via Prisma mock).

Scenarios:
- `GET /health` returns `200` with `{ status: 'ok', timestamp: <string> }`
- `GET /nonexistent-route` returns `404` with the standard error envelope shape (has `statusCode`, `message`, `correlationId`, `timestamp`, `path`)
- A request with `x-correlation-id: test-id-123` header returns a response with `x-correlation-id: test-id-123` header echoed back
- A request without `x-correlation-id` returns a response with a non-empty `x-correlation-id` header (auto-generated UUID)

**What to mock:**

- `PrismaService` is not initialized during these tests — use `jest.mock` or provide a stub `PrismaService` with no-op methods since health does not touch the DB
- Winston transports: override `NODE_ENV=test` so the silent transport is active

**Jest configuration:**

```
apps/api/jest.config.ts
  projects:
    - unit: testMatch **/*.spec.ts, rootDir src/
    - e2e: testMatch **/*.e2e-spec.ts, rootDir test/
```

---

### Definition of Done

- [ ] NestJS app bootstrapped in `apps/api` with Fastify adapter
- [ ] `ConfigModule` loads env vars (validated with Zod or `class-validator`)
- [ ] `GET /health` returns `{ status: 'ok', timestamp }` with 200
- [ ] Winston logger configured (JSON format, correlation ID via request header)
- [ ] Global exception filter catches unhandled errors and returns structured JSON
- [ ] `pnpm --filter api dev` starts the server on configurable port
- [ ] At least 1 unit test for the health endpoint passes

---

## US-003: Database Schema + Prisma Setup

Create the Prisma schema for all core entities and run initial migration.

**Parallel:** After US-001. Can run in parallel with US-002, US-004, US-005.

**Recommended Agents:** `sql-pro`, `backend-developer`

---

### Implementation Details

**File locations**

```
apps/api/
  prisma/
    schema.prisma               # single schema file — all models, enums, datasource, generator
    migrations/
      <timestamp>_init/
        migration.sql           # generated by prisma migrate dev
    seed.ts                     # seed script — 1 org + 1 repo + 1 contributor + 1 PR
  src/
    prisma/
      prisma.module.ts          # global NestJS module — provides PrismaService
      prisma.service.ts         # extends PrismaClient, handles onModuleInit/onModuleDestroy
```

**`prisma/schema.prisma` — full schema**

Datasource: `provider = "postgresql"`, `url = env("DATABASE_URL")`.

Generator: `provider = "prisma-client-js"`, `output = "../src/generated/prisma"` — placing the generated client inside `src/` makes it visible to TypeScript and avoids `node_modules` pollution.

Enums:

```prisma
enum PrState {
  open
  closed
  merged
}
```

Model definitions — key decisions noted per model:

```
organizations
  id              String   @id @default(uuid()) @db.Uuid
  githubId        BigInt   @unique                         // GitHub numeric org ID
  login           String   @unique                         // e.g. "acme-corp"
  avatarUrl       String?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now()) @db.Timestamptz
  updatedAt       DateTime @updatedAt @db.Timestamptz
  repositories    Repository[]

repositories
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @db.Uuid
  organization    Organization @relation(...)
  githubId        BigInt   @unique
  name            String
  fullName        String   @unique                         // "acme-corp/api"
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now()) @db.Timestamptz
  updatedAt       DateTime @updatedAt @db.Timestamptz
  pullRequests    PullRequest[]
  commits         Commit[]
  @@index([organizationId])

contributors
  id              String   @id @default(uuid()) @db.Uuid
  githubId        BigInt   @unique
  login           String   @unique
  avatarUrl       String?
  createdAt       DateTime @default(now()) @db.Timestamptz
  updatedAt       DateTime @updatedAt @db.Timestamptz
  pullRequests    PullRequest[]
  prReviews       PrReview[]
  commits         Commit[]

pull_requests
  id              String   @id @default(uuid()) @db.Uuid
  repositoryId    String   @db.Uuid
  repository      Repository @relation(...)
  authorId        String?  @db.Uuid
  author          Contributor? @relation(...)
  githubId        BigInt
  number          Int
  title           String
  url             String
  state           PrState
  additions       Int      @default(0)
  deletions       Int      @default(0)
  changedFiles    Int      @default(0)
  githubCreatedAt DateTime @db.Timestamptz
  firstCommitAt   DateTime? @db.Timestamptz
  firstReviewAt   DateTime? @db.Timestamptz
  approvedAt      DateTime? @db.Timestamptz
  mergedAt        DateTime? @db.Timestamptz
  createdAt       DateTime @default(now()) @db.Timestamptz
  updatedAt       DateTime @updatedAt @db.Timestamptz
  prReviewers     PrReviewer[]
  prReviews       PrReview[]
  pullRequestCommits PullRequestCommit[]
  @@unique([repositoryId, number])
  @@index([repositoryId, mergedAt])         // covers the dominant cycle-time queries

pr_reviewers
  id              String   @id @default(uuid()) @db.Uuid
  pullRequestId   String   @db.Uuid
  pullRequest     PullRequest @relation(...)
  contributorId   String   @db.Uuid
  contributor     Contributor @relation(...)
  createdAt       DateTime @default(now()) @db.Timestamptz
  @@unique([pullRequestId, contributorId])

pr_reviews
  id              String   @id @default(uuid()) @db.Uuid
  pullRequestId   String   @db.Uuid
  pullRequest     PullRequest @relation(...)
  reviewerId      String   @db.Uuid
  reviewer        Contributor @relation(...)
  githubId        BigInt   @unique
  state           String                                   // APPROVED, CHANGES_REQUESTED, COMMENTED
  submittedAt     DateTime @db.Timestamptz
  createdAt       DateTime @default(now()) @db.Timestamptz
  @@index([reviewerId, submittedAt])

commits
  id              String   @id @default(uuid()) @db.Uuid
  repositoryId    String   @db.Uuid
  repository      Repository @relation(...)
  authorId        String?  @db.Uuid
  author          Contributor? @relation(...)
  sha             String   @unique
  message         String
  committedAt     DateTime @db.Timestamptz
  createdAt       DateTime @default(now()) @db.Timestamptz
  pullRequestCommits PullRequestCommit[]
  @@index([repositoryId, committedAt])

pull_request_commits
  id              String   @id @default(uuid()) @db.Uuid
  pullRequestId   String   @db.Uuid
  pullRequest     PullRequest @relation(...)
  commitId        String   @db.Uuid
  commit          Commit @relation(...)
  @@unique([pullRequestId, commitId])
```

**`prisma/seed.ts`**

Creates deterministic seed data for local development and testing. All IDs are fixed UUIDs so the seed is idempotent via `upsert`:

```typescript
// apps/api/prisma/seed.ts
// 1. Upsert org: { login: 'seed-org', githubId: 999001n }
// 2. Upsert repo: { fullName: 'seed-org/seed-repo', githubId: 999002n }
// 3. Upsert contributor: { login: 'seed-user', githubId: 999003n }
// 4. Upsert PR: { number: 1, title: 'Initial PR', state: 'merged', mergedAt: <fixed date> }
```

Run via `package.json` script: `"db:seed": "ts-node prisma/seed.ts"`.

**`src/prisma/prisma.service.ts`**

```typescript
// apps/api/src/prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`PrismaModule` is marked `@Global()` so every feature module can inject `PrismaService` without re-importing the module.

---

### Testing Details

**Test file locations:**

```
apps/api/src/prisma/prisma.service.spec.ts      # unit test
apps/api/test/database.integration-spec.ts      # integration test (requires DB)
```

**`prisma.service.spec.ts` — unit test**

Scenarios:
- `onModuleInit` calls `this.$connect()` — mock `$connect` and assert it was called
- `onModuleDestroy` calls `this.$disconnect()` — same pattern

These tests do not touch a real database. `PrismaClient` constructor is mocked.

**`database.integration-spec.ts` — integration test (runs against Docker PostgreSQL)**

This test runs only in the local development environment, gated by the `INTEGRATION` environment variable (`if (!process.env.INTEGRATION) return`).

Scenarios:
- After `prisma migrate deploy`, all 8 Phase 1 tables exist in the database — query `information_schema.tables` and assert each table name is present
- `PrismaService.$queryRaw` can execute a trivial `SELECT 1` without throwing
- Seed script can run twice without errors (idempotency check) — run `seed.ts` via `execSync`, run it again, assert no exception

**Migration validation (non-Jest, part of DoD):**

```bash
npx prisma validate              # schema has no syntax errors
npx prisma migrate dev --name init   # creates migration.sql
npx prisma generate              # generates typed client at src/generated/prisma
```

These are run manually or as part of the `db:migrate` npm script, not Jest tests.

---

### Definition of Done

- [ ] Prisma initialized in `apps/api/prisma/schema.prisma`
- [ ] All Phase 1 tables defined: `organizations`, `repositories`, `contributors`, `pull_requests`, `pr_reviewers`, `pr_reviews`, `commits`, `pull_request_commits`
- [ ] Enums defined: `PrState` (open, closed, merged)
- [ ] `pull_requests` table matches ARCHITECTURE.md schema (including `url`, lifecycle timestamps, no pre-computed cycle time)
- [ ] `npx prisma migrate dev` creates all tables successfully against a local PostgreSQL
- [ ] `npx prisma generate` produces a typed Prisma Client
- [ ] Seed script creates 1 sample org + 1 repo + 1 PR (for dev/testing)

---

## US-004: Docker Compose for Local Dev

Set up Docker Compose for local development with PostgreSQL.

**Parallel:** After US-001. Can run in parallel with US-002, US-003, US-005.

**Recommended Agents:** `devops-engineer`

---

### Implementation Details

**File locations**

```
docker-compose.yml              # root of monorepo
.env.example                    # root — template for all env vars
.env                            # gitignored — local copy of .env.example filled in
```

**`docker-compose.yml`**

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-tracker}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-tracker}
      POSTGRES_DB: ${POSTGRES_DB:-github_tracker}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-tracker} -d ${POSTGRES_DB:-github_tracker}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
    driver: local
```

Design decisions:
- `postgres:16-alpine` matches the target PostgreSQL 16 version and keeps the image small
- All values use `${VAR:-default}` syntax so the compose file works without a `.env` file for immediate `docker compose up` convenience
- The named volume `postgres_data` ensures data persists across `docker compose down` (but is removed by `docker compose down -v` which is documented in the README)
- Healthcheck enables dependent services to wait for Postgres to be ready (relevant when a future compose profile starts the API container as well)

**`.env.example`**

Documents every environment variable required by the application. Grouped by concern:

```dotenv
# .env.example

# ── Database (Docker Compose defaults) ──────────────────────────────────────
POSTGRES_USER=tracker
POSTGRES_PASSWORD=tracker
POSTGRES_DB=github_tracker
POSTGRES_PORT=5432
DATABASE_URL=postgresql://tracker:tracker@localhost:5432/github_tracker

# ── API Server ───────────────────────────────────────────────────────────────
PORT=3000
NODE_ENV=development

# ── Logging ──────────────────────────────────────────────────────────────────
CORRELATION_ID_HEADER=x-correlation-id

# ── GitHub App (populated in US-009) ─────────────────────────────────────────
# GITHUB_APP_ID=
# GITHUB_APP_PRIVATE_KEY_BASE64=
# GITHUB_WEBHOOK_SECRET=
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
```

The `DATABASE_URL` value uses the same credentials as the compose service defaults. Developers copy `.env.example` to `.env` and fill in the GitHub App credentials when needed; the database section works out of the box.

**Development workflow (document in a brief inline comment block at the top of `docker-compose.yml`):**

```
# Quick start:
#   cp .env.example .env
#   docker compose up -d
#   pnpm --filter api db:migrate
#   pnpm --filter api db:seed
#   pnpm --filter api dev
```

---

### Testing Details

US-004 has no application code and therefore no Jest tests. Validation is entirely operational.

**Manual verification checklist (part of DoD):**

1. `docker compose up -d` — exits cleanly, `docker compose ps` shows `postgres` as `healthy`
2. `psql postgresql://tracker:tracker@localhost:5432/github_tracker -c "SELECT 1;"` — returns `1`
3. Set `DATABASE_URL=postgresql://tracker:tracker@localhost:5432/github_tracker` in `.env`, run `pnpm --filter api db:migrate` — migration completes without error
4. `docker compose down` then `docker compose up -d` — data seeded before the restart is still present (volume persistence confirmed)
5. `docker compose down -v` removes the volume — `docker compose up -d` starts with a fresh empty database

**CI note:** The CI pipeline (US-022) will use a `services: postgres:` block in GitHub Actions rather than Docker Compose to avoid the Docker-in-Docker complexity on the hosted runner. The `docker-compose.yml` is exclusively for local development.

---

### Definition of Done

- [ ] `docker-compose.yml` at repo root with PostgreSQL 16 service
- [ ] `.env.example` with all required env vars documented
- [ ] `docker compose up` starts PostgreSQL, accessible on `localhost:5432`
- [ ] Backend can connect to the Docker PostgreSQL with env vars from `.env.example`
- [ ] Data persists across `docker compose down` / `up` (named volume)

---

## US-005: Frontend Scaffold

Scaffold the React + Vite frontend with MUI, React Router, and the app shell placeholder.

**Parallel:** After US-001. Can run in parallel with US-002, US-003, US-004.

**Recommended Agents:** `react-specialist`, `ui-designer`

---

### Implementation Details

**Folder structure — final state of this story**

```
apps/web/
  index.html
  vite.config.ts
  tsconfig.json
  tsconfig.node.json              # for vite.config.ts itself
  package.json
  src/
    main.tsx                      # ReactDOM.createRoot, QueryClientProvider, RouterProvider
    App.tsx                       # BrowserRouter wrapper (if not using RouterProvider)
    theme/
      theme.ts                    # MUI createTheme — palette, typography, component overrides
    router/
      routes.tsx                  # all route definitions in one place
    store/
      filter.store.ts             # Zustand — date range, repos, contributors, teams
      ui.store.ts                 # Zustand — sidebar open/closed state
    api/
      api-client.ts               # configured axios or fetch wrapper — base URL from env
    components/
      layout/
        AppLayout.tsx             # root layout: sidebar + top bar + content area
        Sidebar.tsx               # nav links, collapse toggle
        TopBar.tsx                # logo, user avatar placeholder, logout stub
        ContentArea.tsx           # <Outlet /> wrapper with max-width constraint
    pages/
      DashboardPage.tsx           # placeholder
      PullRequestsPage.tsx        # placeholder
      CommitsPage.tsx             # placeholder
      ContributorsPage.tsx        # placeholder
      RepositoriesPage.tsx        # placeholder
      TeamsPage.tsx               # placeholder
      NotFoundPage.tsx            # 404 fallback
```

**`src/main.tsx`**

```tsx
// apps/web/src/main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from './theme/theme';
import { router } from './router/routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
```

**`src/theme/theme.ts`**

```typescript
// apps/web/src/theme/theme.ts
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
  },
  typography: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
    fontFamilyMono: '"JetBrains Mono", "Courier New", monospace', // custom token for numbers
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      `,
    },
  },
});
```

**`src/router/routes.tsx`**

Uses `createBrowserRouter` from React Router v6 with the data router API (enables `loader`/`action` later):

```tsx
// apps/web/src/router/routes.tsx
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'pull-requests', element: <PullRequestsPage /> },
      { path: 'commits', element: <CommitsPage /> },
      { path: 'contributors', element: <ContributorsPage /> },
      { path: 'repositories', element: <RepositoriesPage /> },
      { path: 'teams', element: <TeamsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
```

**`src/store/filter.store.ts`**

```typescript
// apps/web/src/store/filter.store.ts
import { create } from 'zustand';

interface FilterState {
  fromDate: string | null;
  toDate: string | null;
  repositoryIds: string[];
  contributorIds: string[];
  teamIds: string[];
  setDateRange: (from: string | null, to: string | null) => void;
  setRepositoryIds: (ids: string[]) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  fromDate: null,
  toDate: null,
  repositoryIds: [],
  contributorIds: [],
  teamIds: [],
  setDateRange: (fromDate, toDate) => set({ fromDate, toDate }),
  setRepositoryIds: (repositoryIds) => set({ repositoryIds }),
  reset: () => set({ fromDate: null, toDate: null, repositoryIds: [], contributorIds: [], teamIds: [] }),
}));
```

**`src/store/ui.store.ts`**

```typescript
// apps/web/src/store/ui.store.ts
interface UiState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
```

**`src/components/layout/Sidebar.tsx`**

Static nav links for this story — no dynamic data. Uses MUI `Drawer` (persistent variant) with `width: 240px` when open and `width: 64px` when collapsed. Nav items defined as a typed array of `{ label, path, icon }` — not hardcoded JSX repetition.

```typescript
// Nav items — defined once, rendered via .map()
const NAV_ITEMS = [
  { label: 'Overview', path: '/', icon: <DashboardIcon /> },
  { label: 'Pull Requests', path: '/pull-requests', icon: <MergeTypeIcon /> },
  { label: 'Commits', path: '/commits', icon: <CommitIcon /> },
  { label: 'Contributors', path: '/contributors', icon: <PeopleIcon /> },
  { label: 'Repositories', path: '/repositories', icon: <FolderIcon /> },
  { label: 'Teams', path: '/teams', icon: <GroupsIcon /> },
] as const;
```

**Placeholder pages**

Each page is a single functional component that renders the page name in an MUI `Typography` heading inside an MUI `Box`. No logic. These are replaced in later stories.

```tsx
// apps/web/src/pages/DashboardPage.tsx
export function DashboardPage() {
  return <Typography variant="h4">Overview</Typography>;
}
```

**`vite.config.ts`**

```typescript
// apps/web/vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

The proxy routes API calls from the Vite dev server to the NestJS backend, avoiding CORS issues during local development.

---

### Testing Details

**Test file locations:**

```
apps/web/src/components/layout/Sidebar.spec.tsx         # unit test
apps/web/src/store/filter.store.spec.ts                  # unit test
apps/web/src/store/ui.store.spec.ts                      # unit test
apps/web/src/router/routes.spec.tsx                      # integration test
```

**Testing setup**

Uses Vitest (not Jest) — matches Vite's build tooling. Configure in `vite.config.ts`:

```typescript
test: {
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  globals: true,
}
```

`src/test/setup.ts` imports `@testing-library/jest-dom` for custom matchers.

**`filter.store.spec.ts` — unit test**

Tests run against a fresh store instance per test (`beforeEach` resets state by calling `store.getState().reset()`).

Scenarios:
- Initial state has `fromDate: null`, `toDate: null`, empty arrays
- `setDateRange('2026-01-01', '2026-01-31')` updates `fromDate` and `toDate`
- `setRepositoryIds(['id-1', 'id-2'])` updates `repositoryIds`
- `reset()` restores all fields to their initial values

**`ui.store.spec.ts` — unit test**

Scenarios:
- Initial `sidebarOpen` is `true`
- `toggleSidebar()` sets `sidebarOpen` to `false`
- Calling `toggleSidebar()` again sets it back to `true`

**`Sidebar.spec.tsx` — unit test**

Render with `MemoryRouter` wrapping. Mock `useUiStore` to control `sidebarOpen` state.

Scenarios:
- When `sidebarOpen: true`, all 6 nav link labels are visible
- When `sidebarOpen: false`, nav link labels are not rendered (icon-only mode)
- Each nav link renders an `<a>` element with the correct `href`
- The active route (matched by `useMatch`) applies an active style — verify via `aria-current="page"` or a CSS class

**`routes.spec.tsx` — integration test**

Uses `createMemoryRouter` + `RouterProvider` to test navigation without a browser.

Scenarios:
- Rendering `/` mounts `DashboardPage` — verify by finding the "Overview" heading
- Rendering `/pull-requests` mounts `PullRequestsPage`
- Rendering `/nonexistent` mounts `NotFoundPage`

**What to mock:**

- MUI `ThemeProvider` is provided for real (not mocked) — tests render within the actual theme
- `QueryClientProvider` wraps all component tests with a fresh `QueryClient` per test
- No API calls occur in this story — `api-client.ts` is never called by scaffold components

---

### Definition of Done

- [ ] Vite + React 18 + TypeScript initialized in `apps/web`
- [ ] MUI installed and configured with a base theme (default palette, Inter font)
- [ ] React Router v6 with route stubs for: `/`, `/pull-requests`, `/commits`, `/contributors`, `/repositories`, `/teams`
- [ ] Placeholder layout: sidebar (hardcoded nav links) + top bar + content area
- [ ] TanStack Query provider + Zustand store skeleton (empty filter store)
- [ ] `pnpm --filter web dev` starts dev server with HMR
- [ ] Navigating between routes renders correct placeholder pages
