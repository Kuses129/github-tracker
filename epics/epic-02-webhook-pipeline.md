# Epic 2: Webhook Pipeline (Week 2-3)

This epic delivers the real-time data ingestion layer. A single HTTP endpoint receives all GitHub App webhook events, verifies their authenticity, and routes them to dedicated handlers that upsert data into PostgreSQL. Every handler is idempotent — replaying an event produces the same database state.

US-009 is the gateway and must be completed before the four handler stories (US-010 through US-013), which can then proceed in parallel.

---

## US-009: GitHub App + Webhook Endpoint

Register a GitHub App and create the webhook receiver with signature verification.

**Parallel:** After US-002 and US-003. This is the gateway — US-010 through US-013 depend on it.

**Recommended Agents:** `backend-developer`, `api-designer`

### Implementation Details

**GitHub App registration (manual step, documented in `.env.example`):**

Register the GitHub App in GitHub Settings with these permissions:
- `pull_requests: read`
- `contents: read`
- `metadata: read`

Subscribe to events: `installation`, `pull_request`, `pull_request_review`, `push`.

Set the webhook URL to `https://<your-domain>/api/v1/webhooks/github`. For local development use a tunnel (e.g. smee.io or ngrok). Store the webhook secret as `GITHUB_WEBHOOK_SECRET` in `.env`.

**NestJS module scaffold:**

Create the webhooks module at `apps/api/src/modules/webhooks/`. The module structure follows the project convention: module → controller → service → repository → `/models/`.

```
apps/api/src/modules/webhooks/
  webhooks.module.ts
  webhooks.controller.ts
  webhooks.service.ts
  models/
    webhook-event.models.ts        # Payload type aliases & discriminated unions
```

**`apps/api/src/modules/webhooks/models/webhook-event.models.ts`**

Define narrow payload types for the four routed event types. Do not model every GitHub field — only the fields consumed by the handlers in this epic.

```typescript
export type GitHubEventType =
  | 'installation'
  | 'installation_repositories'
  | 'pull_request'
  | 'pull_request_review'
  | 'push';

export interface GitHubUserPayload {
  id: number;
  login: string;
  avatar_url: string;
}

export interface GitHubRepositoryPayload {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
}

export interface InstallationPayload {
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend' | 'new_permissions_accepted';
  installation: {
    id: number;
    account: GitHubUserPayload;
  };
  repositories?: GitHubRepositoryPayload[];
}

export interface InstallationRepositoriesPayload {
  action: 'added' | 'removed';
  installation: {
    id: number;
    account: GitHubUserPayload;
  };
  repositories_added: GitHubRepositoryPayload[];
  repositories_removed: GitHubRepositoryPayload[];
}

// PullRequestPayload, PullRequestReviewPayload, PushPayload defined in US-011/012/013
```

**`apps/api/src/modules/webhooks/webhooks.controller.ts`**

The controller has a single `POST /` route (the module is mounted at `/api/v1/webhooks/github`). It applies a `WebhookSignatureGuard`, reads `X-GitHub-Event`, and delegates to `WebhooksService.route()`.

```typescript
import { Controller, Post, Headers, Body, HttpCode } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { WebhookSignatureGuard } from '../../common/guards/webhook-signature.guard';
import { WebhooksService } from './webhooks.service';
import { GitHubEventType } from './models/webhook-event.models';

@Controller()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)
  async handleWebhook(
    @Headers('x-github-event') event: GitHubEventType,
    @Body() payload: unknown,
  ): Promise<void> {
    await this.webhooksService.route(event, payload);
  }
}
```

**`apps/api/src/common/guards/webhook-signature.guard.ts`**

The guard reads the raw request body (Fastify provides it as `Buffer`) and computes HMAC-SHA256 against `GITHUB_WEBHOOK_SECRET`. It rejects mismatches with `UnauthorizedException` before the controller method runs.

Key points:
- Use `crypto.timingSafeEqual` to prevent timing attacks.
- The guard must access the raw body bytes, not the parsed JSON object. Configure Fastify to keep the raw body accessible: set `addContentTypeParser` with `parseAs: 'buffer'` in `main.ts`, or use the `rawBody` option on the NestJS Fastify adapter.
- Read the secret from `ConfigService`, never from `process.env` directly.

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-hub-signature-256'] as string | undefined;

    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const secret = this.config.getOrThrow<string>('GITHUB_WEBHOOK_SECRET');
    const rawBody: Buffer = request.rawBody;

    const expected = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')}`;

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
```

**`apps/api/src/modules/webhooks/webhooks.service.ts`**

The service is a router only at this stage. Stub handlers return immediately; they will be replaced in US-010 through US-013.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { GitHubEventType } from './models/webhook-event.models';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  async route(event: GitHubEventType, payload: unknown): Promise<void> {
    this.logger.log({ event }, 'Webhook received');

    switch (event) {
      case 'installation':
        return this.handleInstallation(payload);
      case 'installation_repositories':
        return this.handleInstallationRepositories(payload);
      case 'pull_request':
        return this.handlePullRequest(payload);
      case 'pull_request_review':
        return this.handlePullRequestReview(payload);
      case 'push':
        return this.handlePush(payload);
      default:
        this.logger.log({ event }, 'Unhandled webhook event — ignoring');
    }
  }

  private async handleInstallation(_payload: unknown): Promise<void> {}
  private async handleInstallationRepositories(_payload: unknown): Promise<void> {}
  private async handlePullRequest(_payload: unknown): Promise<void> {}
  private async handlePullRequestReview(_payload: unknown): Promise<void> {}
  private async handlePush(_payload: unknown): Promise<void> {}
}
```

**`apps/api/src/modules/webhooks/webhooks.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
```

Mount the module at `apps/api/src/app.module.ts` and register the route prefix:

```typescript
// In main.ts bootstrap:
app.setGlobalPrefix('api/v1');
// WebhooksModule controller is then reachable at POST /api/v1/webhooks/github
// because the controller is mounted at the path configured in the module registration:
// RouterModule.register([{ path: 'webhooks/github', module: WebhooksModule }])
```

Use `RouterModule` from `@nestjs/core` to nest the module under `webhooks/github`:

```typescript
// app.module.ts
import { RouterModule } from '@nestjs/core';

@Module({
  imports: [
    RouterModule.register([
      { path: 'webhooks/github', module: WebhooksModule },
    ]),
    WebhooksModule,
  ],
})
export class AppModule {}
```

**`apps/api/src/main.ts` — raw body access for Fastify:**

```typescript
import fastifyRawBody from 'fastify-raw-body';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  await app.register(fastifyRawBody, {
    field: 'rawBody',
    global: true,
    encoding: false, // keep as Buffer
    runFirst: true,
  });
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
```

**Environment variables** — add to `.env.example`:

```
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
```

### Testing Details

**Test files:**

```
apps/api/src/modules/webhooks/
  __tests__/
    webhooks.controller.spec.ts
    webhooks.service.spec.ts

apps/api/src/common/guards/
  __tests__/
    webhook-signature.guard.spec.ts
```

**`webhook-signature.guard.spec.ts` — unit tests:**

Test the guard in isolation by constructing a mock `ExecutionContext`. No NestJS bootstrapping required.

```typescript
import * as crypto from 'crypto';

const SECRET = 'test-secret';
const PAYLOAD = Buffer.from(JSON.stringify({ action: 'created' }));

function validSignature(secret: string, body: Buffer): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}
```

Scenarios:
- Missing `x-hub-signature-256` header → throws `UnauthorizedException`.
- Header present but computed with a different secret → throws `UnauthorizedException`.
- Header with correct HMAC → returns `true`.
- Header with correct HMAC but modified payload → throws `UnauthorizedException` (confirms body integrity check).

Mock `ConfigService` to return `SECRET` for `GITHUB_WEBHOOK_SECRET`.

**`webhooks.controller.spec.ts` — unit tests:**

Use `@nestjs/testing` `Test.createTestingModule`. Override `WebhookSignatureGuard` with an `AllowAllGuard` so controller logic is tested independently of signature verification.

Scenarios:
- Valid event type in `x-github-event` header → calls `webhooksService.route` with correct arguments and returns 200.
- Unknown event type → still calls `route` (routing decision is in the service) and returns 200.

Mock `WebhooksService.route` to resolve immediately.

**`webhooks.service.spec.ts` — unit tests:**

Scenarios:
- Calling `route('installation', payload)` invokes the installation handler.
- Calling `route('pull_request', payload)` invokes the PR handler.
- Calling `route('push', payload)` invokes the push handler.
- Calling `route` with an unknown event type does not throw.

At this stage the handlers are stubs so these tests simply confirm routing dispatch.

**Integration test — signature rejection:**

Use `supertest` against the full NestJS app (real `WebhookSignatureGuard`, Fastify adapter, raw body plugin) to verify the HTTP contract:

```typescript
// apps/api/src/modules/webhooks/__tests__/webhooks.integration.spec.ts

it('rejects request with missing signature header with 401', async () => {
  await request(app.getHttpServer())
    .post('/api/v1/webhooks/github')
    .set('x-github-event', 'push')
    .send({ ref: 'refs/heads/main' })
    .expect(401);
});

it('rejects request with wrong signature with 401', async () => {
  const body = JSON.stringify({ ref: 'refs/heads/main' });
  await request(app.getHttpServer())
    .post('/api/v1/webhooks/github')
    .set('x-github-event', 'push')
    .set('x-hub-signature-256', 'sha256=invalidsignature')
    .send(body)
    .expect(401);
});

it('accepts request with valid signature with 200', async () => {
  const body = JSON.stringify({ ref: 'refs/heads/main' });
  const sig = `sha256=${crypto
    .createHmac('sha256', TEST_SECRET)
    .update(Buffer.from(body))
    .digest('hex')}`;

  await request(app.getHttpServer())
    .post('/api/v1/webhooks/github')
    .set('x-github-event', 'push')
    .set('x-hub-signature-256', sig)
    .set('content-type', 'application/json')
    .send(body)
    .expect(200);
});
```

Bootstrap the test app with `ConfigModule` providing `GITHUB_WEBHOOK_SECRET=TEST_SECRET`. Use an in-memory `WebhooksService` stub so no database is needed.

### Definition of Done

- [ ] GitHub App registered (manually or via manifest flow) with required permissions: `pull_requests: read`, `contents: read`, `metadata: read`
- [ ] Webhook subscriptions configured: `installation`, `pull_request`, `pull_request_review`, `push`
- [ ] `POST /api/v1/webhooks/github` endpoint receives webhook payloads
- [ ] Signature verification using `X-Hub-Signature-256` header — rejects invalid signatures with 401
- [ ] Routing logic: reads `X-GitHub-Event` header and dispatches to the correct handler (stub handlers return 200 for now)
- [ ] Webhook secret stored as environment variable, not in code
- [ ] Test: sending a request with an invalid signature returns 401
- [ ] Test: sending a request with a valid signature and known event type returns 200

---

## US-010: Installation Event Handler

Handle the `installation` webhook event to upsert organizations and repositories when the GitHub App is installed.

**Parallel:** After US-009. Can run in parallel with US-011, US-012, US-013.

**Recommended Agents:** `backend-developer`

### Implementation Details

**New files:**

```
apps/api/src/modules/organizations/
  organizations.module.ts
  organizations.service.ts
  organizations.repository.ts
  models/
    organization.models.ts

apps/api/src/modules/repositories/
  repositories.module.ts
  repositories.service.ts
  repositories.repository.ts
  models/
    repository.models.ts
```

These modules are created lean for now — only the upsert operations needed by the webhook. Controllers and list endpoints are added in Epic 3 (US-014).

**`apps/api/src/modules/organizations/models/organization.models.ts`**

```typescript
export interface UpsertOrganizationInput {
  githubId: number;
  login: string;
  avatarUrl: string;
}
```

**`apps/api/src/modules/organizations/organizations.repository.ts`**

One repository, one DB model. Uses Prisma Client injected via `PrismaService`.

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertOrganizationInput } from './models/organization.models';
import { Organization } from '@prisma/client';

@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: UpsertOrganizationInput): Promise<Organization> {
    return this.prisma.organization.upsert({
      where: { githubId: input.githubId },
      create: {
        githubId: input.githubId,
        login: input.login,
        avatarUrl: input.avatarUrl,
      },
      update: {
        login: input.login,
        avatarUrl: input.avatarUrl,
      },
    });
  }

  async markInactive(githubId: number): Promise<void> {
    await this.prisma.organization.updateMany({
      where: { githubId },
      data: { isActive: false },
    });
  }
}
```

Note: `isActive` requires a boolean column on the `organizations` table. Add it to the Prisma schema as `isActive Boolean @default(true)` and create a migration.

**`apps/api/src/modules/repositories/models/repository.models.ts`**

```typescript
export interface UpsertRepositoryInput {
  githubId: number;
  organizationId: string;  // UUID of the organization row
  name: string;
  fullName: string;
  isPrivate: boolean;
  htmlUrl: string;
}
```

**`apps/api/src/modules/repositories/repositories.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertRepositoryInput } from './models/repository.models';
import { Repository } from '@prisma/client';

@Injectable()
export class RepositoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: UpsertRepositoryInput): Promise<Repository> {
    return this.prisma.repository.upsert({
      where: { githubId: input.githubId },
      create: {
        githubId: input.githubId,
        organizationId: input.organizationId,
        name: input.name,
        fullName: input.fullName,
        isPrivate: input.isPrivate,
        htmlUrl: input.htmlUrl,
      },
      update: {
        name: input.name,
        fullName: input.fullName,
        isPrivate: input.isPrivate,
        htmlUrl: input.htmlUrl,
      },
    });
  }

  async removeByGithubId(githubId: number): Promise<void> {
    await this.prisma.repository.deleteMany({ where: { githubId } });
  }
}
```

**`apps/api/src/modules/webhooks/handlers/installation.handler.ts`**

Extract each event type's logic into a dedicated handler class. This keeps `WebhooksService` as a thin router and satisfies the single-responsibility principle.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { OrganizationsService } from '../../organizations/organizations.service';
import { RepositoriesService } from '../../repositories/repositories.service';
import {
  InstallationPayload,
  InstallationRepositoriesPayload,
} from '../models/webhook-event.models';

@Injectable()
export class InstallationHandler {
  private readonly logger = new Logger(InstallationHandler.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly repositoriesService: RepositoriesService,
  ) {}

  async handleInstallation(payload: InstallationPayload): Promise<void> {
    const { action, installation, repositories } = payload;

    if (action === 'created') {
      const org = await this.organizationsService.upsert({
        githubId: installation.account.id,
        login: installation.account.login,
        avatarUrl: installation.account.avatar_url,
      });

      for (const repo of repositories ?? []) {
        await this.repositoriesService.upsert({
          githubId: repo.id,
          organizationId: org.id,
          name: repo.name,
          fullName: repo.full_name,
          isPrivate: repo.private,
          htmlUrl: repo.html_url,
        });
      }

      this.logger.log(
        { orgLogin: installation.account.login, repoCount: repositories?.length ?? 0 },
        'Installation created',
      );
    }

    if (action === 'deleted') {
      await this.organizationsService.markInactive(installation.account.id);
      this.logger.log({ orgLogin: installation.account.login }, 'Installation deleted');
    }
  }

  async handleInstallationRepositories(
    payload: InstallationRepositoriesPayload,
  ): Promise<void> {
    const org = await this.organizationsService.upsert({
      githubId: payload.installation.account.id,
      login: payload.installation.account.login,
      avatarUrl: payload.installation.account.avatar_url,
    });

    for (const repo of payload.repositories_added) {
      await this.repositoriesService.upsert({
        githubId: repo.id,
        organizationId: org.id,
        name: repo.name,
        fullName: repo.full_name,
        isPrivate: repo.private,
        htmlUrl: repo.html_url,
      });
    }

    for (const repo of payload.repositories_removed) {
      await this.repositoriesService.removeByGithubId(repo.id);
    }
  }
}
```

Update `WebhooksService` to inject `InstallationHandler` and delegate to it:

```typescript
private async handleInstallation(payload: unknown): Promise<void> {
  await this.installationHandler.handleInstallation(payload as InstallationPayload);
}

private async handleInstallationRepositories(payload: unknown): Promise<void> {
  await this.installationHandler.handleInstallationRepositories(
    payload as InstallationRepositoriesPayload,
  );
}
```

**File layout after this story:**

```
apps/api/src/modules/webhooks/
  handlers/
    installation.handler.ts
    pull-request.handler.ts        # stub, filled in US-011
    pull-request-review.handler.ts # stub, filled in US-012
    push.handler.ts                # stub, filled in US-013
```

### Testing Details

**Test files:**

```
apps/api/src/modules/webhooks/handlers/__tests__/
  installation.handler.spec.ts

apps/api/src/modules/organizations/__tests__/
  organizations.repository.spec.ts

apps/api/src/modules/repositories/__tests__/
  repositories.repository.spec.ts
```

**Fixture — `installation.created` payload** (`apps/api/src/modules/webhooks/__fixtures__/installation-created.fixture.ts`):

```typescript
export const installationCreatedPayload = {
  action: 'created',
  installation: {
    id: 12345,
    account: {
      id: 67890,
      login: 'acme-org',
      avatar_url: 'https://avatars.githubusercontent.com/u/67890',
    },
  },
  repositories: [
    {
      id: 111,
      name: 'backend',
      full_name: 'acme-org/backend',
      private: false,
      html_url: 'https://github.com/acme-org/backend',
    },
    {
      id: 222,
      name: 'frontend',
      full_name: 'acme-org/frontend',
      private: true,
      html_url: 'https://github.com/acme-org/frontend',
    },
  ],
};
```

**`installation.handler.spec.ts` — unit tests:**

Mock both `OrganizationsService` and `RepositoriesService`. Verify calls, not DB state.

Scenarios:
- `handleInstallation` with `action: 'created'` → calls `organizationsService.upsert` once with correct args; calls `repositoriesService.upsert` once per repository in payload.
- `handleInstallation` with `action: 'deleted'` → calls `organizationsService.markInactive` with the installation account's `github_id`; does not call `repositoriesService.upsert`.
- `handleInstallationRepositories` with `action: 'added'` → upserts added repos.
- `handleInstallationRepositories` with `action: 'removed'` → calls `repositoriesService.removeByGithubId` for each removed repo.

**`organizations.repository.spec.ts` — unit tests:**

Mock `PrismaService`. Verify the correct Prisma upsert arguments are passed.

Scenarios:
- `upsert` with a new org → calls `prisma.organization.upsert` with correct `where`, `create`, and `update` fields.
- `upsert` called twice with the same `githubId` → calls `prisma.organization.upsert` twice (idempotency is handled by Prisma's upsert, not the repository class; the test confirms no deduplication logic leaks into the repository).
- `markInactive` → calls `prisma.organization.updateMany` with `where: { githubId }` and `data: { isActive: false }`.

**Integration test — idempotency** (`apps/api/src/modules/webhooks/__tests__/installation.integration.spec.ts`):

Use a real test database (PostgreSQL running in CI via Docker). Bootstrap the full NestJS app. Send the `installationCreatedPayload` fixture twice through the HTTP endpoint with a valid signature.

```typescript
it('creates org and repos from installation.created payload', async () => {
  await sendWebhook('installation', installationCreatedPayload);

  const org = await prisma.organization.findUnique({ where: { githubId: 67890 } });
  expect(org).toMatchObject({ login: 'acme-org', isActive: true });

  const repos = await prisma.repository.findMany({ where: { organizationId: org!.id } });
  expect(repos).toHaveLength(2);
});

it('does not create duplicates when the same payload is sent twice', async () => {
  await sendWebhook('installation', installationCreatedPayload);
  await sendWebhook('installation', installationCreatedPayload);

  const orgs = await prisma.organization.findMany({ where: { githubId: 67890 } });
  expect(orgs).toHaveLength(1);

  const repos = await prisma.repository.findMany();
  expect(repos).toHaveLength(2);
});
```

### Definition of Done

- [ ] On `installation.created`: upsert organization (github_id, login, avatar_url) and all repositories from the payload
- [ ] On `installation.deleted`: mark organization as inactive (soft delete or flag)
- [ ] On `installation_repositories.added` / `installation_repositories.removed`: add/remove repos accordingly
- [ ] All upserts are idempotent (re-processing the same event produces no duplicate data)
- [ ] Test: replaying a sample `installation.created` payload creates the expected org + repos in DB
- [ ] Test: replaying the same payload twice doesn't create duplicates

---

## US-011: Pull Request Event Handler

Handle the `pull_request` webhook event to upsert PRs, contributors, and lifecycle timestamps.

**Parallel:** After US-009. Can run in parallel with US-010, US-012, US-013.

**Recommended Agents:** `backend-developer`

### Implementation Details

**New files:**

```
apps/api/src/modules/contributors/
  contributors.module.ts
  contributors.service.ts
  contributors.repository.ts
  models/
    contributor.models.ts

apps/api/src/modules/pull-requests/
  pull-requests.module.ts
  pull-requests.service.ts
  pull-requests.repository.ts
  models/
    pull-request.models.ts
```

**Extend `webhook-event.models.ts`** with PR payload types:

```typescript
export interface PullRequestPayload {
  action:
    | 'opened'
    | 'closed'
    | 'reopened'
    | 'edited'
    | 'synchronize'
    | 'review_requested'
    | 'review_request_removed'
    | 'labeled'
    | 'unlabeled'
    | 'assigned'
    | 'unassigned'
    | 'ready_for_review'
    | 'converted_to_draft';
  pull_request: {
    id: number;
    number: number;
    title: string;
    html_url: string;
    state: 'open' | 'closed';
    merged: boolean | null;
    additions: number;
    deletions: number;
    changed_files: number;
    created_at: string;
    merged_at: string | null;
    user: GitHubUserPayload;
  };
  repository: GitHubRepositoryPayload & { owner: GitHubUserPayload };
}
```

**`apps/api/src/modules/contributors/models/contributor.models.ts`**

```typescript
export interface UpsertContributorInput {
  githubId: number;
  login: string;
  avatarUrl: string;
}
```

**`apps/api/src/modules/contributors/contributors.repository.ts`**

```typescript
async upsert(input: UpsertContributorInput): Promise<Contributor> {
  return this.prisma.contributor.upsert({
    where: { githubId: input.githubId },
    create: {
      githubId: input.githubId,
      login: input.login,
      avatarUrl: input.avatarUrl,
    },
    update: {
      login: input.login,
      avatarUrl: input.avatarUrl,
    },
  });
}
```

**`apps/api/src/modules/pull-requests/models/pull-request.models.ts`**

```typescript
import { PrState } from '@prisma/client';

export interface UpsertPullRequestInput {
  githubId: number;
  repositoryId: string;
  authorId: string;
  number: number;
  title: string;
  url: string;
  state: PrState;
  additions: number;
  deletions: number;
  changedFiles: number;
  githubCreatedAt: Date;
  mergedAt: Date | null;
}
```

**`apps/api/src/modules/pull-requests/pull-requests.repository.ts`**

The upsert must not overwrite `first_review_at` or `approved_at` if they are already set — those timestamps are managed by the review handler (US-012).

```typescript
async upsert(input: UpsertPullRequestInput): Promise<PullRequest> {
  return this.prisma.pullRequest.upsert({
    where: {
      repositoryId_number: {
        repositoryId: input.repositoryId,
        number: input.number,
      },
    },
    create: {
      githubId: input.githubId,
      repositoryId: input.repositoryId,
      authorId: input.authorId,
      number: input.number,
      title: input.title,
      url: input.url,
      state: input.state,
      additions: input.additions,
      deletions: input.deletions,
      changedFiles: input.changedFiles,
      githubCreatedAt: input.githubCreatedAt,
      mergedAt: input.mergedAt,
    },
    update: {
      title: input.title,
      state: input.state,
      additions: input.additions,
      deletions: input.deletions,
      changedFiles: input.changedFiles,
      mergedAt: input.mergedAt,
    },
  });
}
```

Note: `authorId`, `githubCreatedAt`, and the lifecycle timestamps `first_review_at`/`approved_at`/`first_commit_at` are deliberately excluded from the `update` block. The author and creation date never change on a PR. The review/commit timestamps are owned by their respective handlers.

**`apps/api/src/modules/webhooks/handlers/pull-request.handler.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrState } from '@prisma/client';
import { ContributorsService } from '../../contributors/contributors.service';
import { PullRequestsService } from '../../pull-requests/pull-requests.service';
import { RepositoriesService } from '../../repositories/repositories.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { PullRequestPayload } from '../models/webhook-event.models';

@Injectable()
export class PullRequestHandler {
  private readonly logger = new Logger(PullRequestHandler.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly repositoriesService: RepositoriesService,
    private readonly contributorsService: ContributorsService,
    private readonly pullRequestsService: PullRequestsService,
  ) {}

  async handle(payload: PullRequestPayload): Promise<void> {
    const org = await this.organizationsService.upsert({
      githubId: payload.repository.owner.id,
      login: payload.repository.owner.login,
      avatarUrl: payload.repository.owner.avatar_url,
    });

    const repo = await this.repositoriesService.upsert({
      githubId: payload.repository.id,
      organizationId: org.id,
      name: payload.repository.name,
      fullName: payload.repository.full_name,
      isPrivate: payload.repository.private,
      htmlUrl: payload.repository.html_url,
    });

    const author = await this.contributorsService.upsert({
      githubId: payload.pull_request.user.id,
      login: payload.pull_request.user.login,
      avatarUrl: payload.pull_request.user.avatar_url,
    });

    const state = this.mapState(payload);
    const mergedAt = payload.pull_request.merged_at
      ? new Date(payload.pull_request.merged_at)
      : null;

    await this.pullRequestsService.upsert({
      githubId: payload.pull_request.id,
      repositoryId: repo.id,
      authorId: author.id,
      number: payload.pull_request.number,
      title: payload.pull_request.title,
      url: payload.pull_request.html_url,
      state,
      additions: payload.pull_request.additions,
      deletions: payload.pull_request.deletions,
      changedFiles: payload.pull_request.changed_files,
      githubCreatedAt: new Date(payload.pull_request.created_at),
      mergedAt,
    });

    this.logger.log(
      { repo: payload.repository.full_name, number: payload.pull_request.number, state },
      'Pull request upserted',
    );
  }

  private mapState(payload: PullRequestPayload): PrState {
    if (payload.pull_request.merged) return PrState.merged;
    if (payload.pull_request.state === 'closed') return PrState.closed;
    return PrState.open;
  }
}
```

### Testing Details

**Test files:**

```
apps/api/src/modules/webhooks/handlers/__tests__/
  pull-request.handler.spec.ts

apps/api/src/modules/pull-requests/__tests__/
  pull-requests.repository.spec.ts
```

**Fixture — `pull_request.opened` payload** (`apps/api/src/modules/webhooks/__fixtures__/pull-request-opened.fixture.ts`):

```typescript
export const pullRequestOpenedPayload = {
  action: 'opened',
  pull_request: {
    id: 9001,
    number: 42,
    title: 'feat: add user authentication',
    html_url: 'https://github.com/acme-org/backend/pull/42',
    state: 'open',
    merged: false,
    additions: 120,
    deletions: 15,
    changed_files: 5,
    created_at: '2026-02-10T09:00:00Z',
    merged_at: null,
    user: {
      id: 111,
      login: 'alice',
      avatar_url: 'https://avatars.githubusercontent.com/u/111',
    },
  },
  repository: {
    id: 555,
    name: 'backend',
    full_name: 'acme-org/backend',
    private: false,
    html_url: 'https://github.com/acme-org/backend',
    owner: {
      id: 67890,
      login: 'acme-org',
      avatar_url: 'https://avatars.githubusercontent.com/u/67890',
    },
  },
};

export const pullRequestMergedPayload = {
  ...pullRequestOpenedPayload,
  action: 'closed',
  pull_request: {
    ...pullRequestOpenedPayload.pull_request,
    state: 'closed',
    merged: true,
    merged_at: '2026-02-12T14:30:00Z',
  },
};
```

**`pull-request.handler.spec.ts` — unit tests:**

Mock all four injected services. Assert on the arguments passed to `pullRequestsService.upsert`.

Scenarios:
- `opened` action → `state` is `PrState.open`, `mergedAt` is `null`.
- `closed` action with `merged: false` → `state` is `PrState.closed`, `mergedAt` is `null`.
- `closed` action with `merged: true` → `state` is `PrState.merged`, `mergedAt` is the parsed `merged_at` date.
- Handler calls `organizationsService.upsert`, `repositoriesService.upsert`, `contributorsService.upsert`, then `pullRequestsService.upsert` in that order (org must exist before repo, repo must exist before PR).

**`pull-requests.repository.spec.ts` — unit tests:**

Mock `PrismaService`. Verify the `update` block does not include `authorId` or `githubCreatedAt`.

**Integration test** (`apps/api/src/modules/webhooks/__tests__/pull-request.integration.spec.ts`):

Prerequisites: seed org and repo rows matching the fixture's `repository.owner.id` and `repository.id` (or let the handler create them).

```typescript
it('creates PR with correct fields from pull_request.opened payload', async () => {
  await sendWebhook('pull_request', pullRequestOpenedPayload);

  const pr = await prisma.pullRequest.findFirst({
    where: { number: 42 },
  });
  expect(pr).toMatchObject({
    number: 42,
    title: 'feat: add user authentication',
    state: 'open',
    additions: 120,
    deletions: 15,
    changedFiles: 5,
    mergedAt: null,
  });
});

it('updates state to merged and sets mergedAt from pull_request.closed payload', async () => {
  await sendWebhook('pull_request', pullRequestOpenedPayload);
  await sendWebhook('pull_request', pullRequestMergedPayload);

  const pr = await prisma.pullRequest.findFirst({ where: { number: 42 } });
  expect(pr?.state).toBe('merged');
  expect(pr?.mergedAt).toEqual(new Date('2026-02-12T14:30:00Z'));
});

it('does not create duplicate PR when same payload is sent twice', async () => {
  await sendWebhook('pull_request', pullRequestOpenedPayload);
  await sendWebhook('pull_request', pullRequestOpenedPayload);

  const count = await prisma.pullRequest.count({ where: { number: 42 } });
  expect(count).toBe(1);
});
```

### Definition of Done

- [ ] On `pull_request.*`: upsert repository, upsert contributor (from `pull_request.user`), upsert pull request
- [ ] PR fields stored: `github_id`, `number`, `title`, `url`, `state` (mapped to PrState enum), `additions`, `deletions`, `changed_files`
- [ ] Lifecycle timestamps set: `github_created_at` (always), `merged_at` (on merge event)
- [ ] On `pull_request.closed` with `merged: true`: state set to `merged`, `merged_at` set
- [ ] All upserts are idempotent
- [ ] Test: replaying a sample `pull_request.opened` payload creates the PR in DB with correct fields
- [ ] Test: replaying a `pull_request.closed` (merged) payload updates state to `merged` and sets `merged_at`

---

## US-012: Pull Request Review Event Handler

Handle the `pull_request_review` webhook event to upsert reviews and update PR lifecycle timestamps.

**Parallel:** After US-009. Can run in parallel with US-010, US-011, US-013.

**Recommended Agents:** `backend-developer`

### Implementation Details

**New files:**

```
apps/api/src/modules/pr-reviews/
  pr-reviews.module.ts
  pr-reviews.service.ts
  pr-reviews.repository.ts
  models/
    pr-review.models.ts
```

**Extend `webhook-event.models.ts`:**

```typescript
export interface PullRequestReviewPayload {
  action: 'submitted' | 'edited' | 'dismissed';
  review: {
    id: number;
    state: 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending';
    submitted_at: string;
    user: GitHubUserPayload;
  };
  pull_request: {
    id: number;
    number: number;
    user: GitHubUserPayload;
  };
  repository: GitHubRepositoryPayload & { owner: GitHubUserPayload };
}
```

**`apps/api/src/modules/pr-reviews/models/pr-review.models.ts`**

```typescript
export interface UpsertPrReviewInput {
  githubId: number;
  pullRequestId: string;
  reviewerId: string;
  state: string;
  submittedAt: Date;
}
```

**`apps/api/src/modules/pr-reviews/pr-reviews.repository.ts`**

```typescript
async upsert(input: UpsertPrReviewInput): Promise<PrReview> {
  return this.prisma.prReview.upsert({
    where: { githubId: input.githubId },
    create: {
      githubId: input.githubId,
      pullRequestId: input.pullRequestId,
      reviewerId: input.reviewerId,
      state: input.state,
      submittedAt: input.submittedAt,
    },
    update: {
      state: input.state,
      submittedAt: input.submittedAt,
    },
  });
}

async findEarliestForPullRequest(pullRequestId: string): Promise<PrReview | null> {
  return this.prisma.prReview.findFirst({
    where: { pullRequestId },
    orderBy: { submittedAt: 'asc' },
  });
}
```

**`apps/api/src/modules/pull-requests/pull-requests.repository.ts` — extend with lifecycle update methods:**

```typescript
async setFirstReviewAt(id: string, firstReviewAt: Date): Promise<void> {
  await this.prisma.pullRequest.update({
    where: { id },
    data: { firstReviewAt },
  });
}

async setApprovedAt(id: string, approvedAt: Date): Promise<void> {
  await this.prisma.pullRequest.update({
    where: { id },
    data: { approvedAt },
  });
}

async findByRepositoryAndNumber(
  repositoryId: string,
  number: number,
): Promise<PullRequest | null> {
  return this.prisma.pullRequest.findUnique({
    where: { repositoryId_number: { repositoryId, number } },
  });
}
```

**`apps/api/src/modules/webhooks/handlers/pull-request-review.handler.ts`**

The key constraint: `first_review_at` and `approved_at` must be set **only once** and never decremented. Use conditional updates rather than unconditional ones.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ContributorsService } from '../../contributors/contributors.service';
import { PrReviewsService } from '../../pr-reviews/pr-reviews.service';
import { PullRequestsRepository } from '../../pull-requests/pull-requests.repository';
import { RepositoriesService } from '../../repositories/repositories.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { PullRequestReviewPayload } from '../models/webhook-event.models';

@Injectable()
export class PullRequestReviewHandler {
  private readonly logger = new Logger(PullRequestReviewHandler.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly repositoriesService: RepositoriesService,
    private readonly contributorsService: ContributorsService,
    private readonly prReviewsService: PrReviewsService,
    private readonly pullRequestsRepository: PullRequestsRepository,
  ) {}

  async handle(payload: PullRequestReviewPayload): Promise<void> {
    if (payload.action !== 'submitted') return;

    const org = await this.organizationsService.upsert({
      githubId: payload.repository.owner.id,
      login: payload.repository.owner.login,
      avatarUrl: payload.repository.owner.avatar_url,
    });

    const repo = await this.repositoriesService.upsert({
      githubId: payload.repository.id,
      organizationId: org.id,
      name: payload.repository.name,
      fullName: payload.repository.full_name,
      isPrivate: payload.repository.private,
      htmlUrl: payload.repository.html_url,
    });

    const reviewer = await this.contributorsService.upsert({
      githubId: payload.review.user.id,
      login: payload.review.user.login,
      avatarUrl: payload.review.user.avatar_url,
    });

    const pr = await this.pullRequestsRepository.findByRepositoryAndNumber(
      repo.id,
      payload.pull_request.number,
    );

    if (!pr) {
      this.logger.warn(
        { repo: payload.repository.full_name, number: payload.pull_request.number },
        'PR not found for review event — skipping',
      );
      return;
    }

    const submittedAt = new Date(payload.review.submitted_at);

    await this.prReviewsService.upsert({
      githubId: payload.review.id,
      pullRequestId: pr.id,
      reviewerId: reviewer.id,
      state: payload.review.state,
      submittedAt,
    });

    if (!pr.firstReviewAt) {
      await this.pullRequestsRepository.setFirstReviewAt(pr.id, submittedAt);
    }

    if (payload.review.state === 'approved' && !pr.approvedAt) {
      await this.pullRequestsRepository.setApprovedAt(pr.id, submittedAt);
    }

    this.logger.log(
      { prId: pr.id, reviewState: payload.review.state },
      'Pull request review upserted',
    );
  }
}
```

### Testing Details

**Test files:**

```
apps/api/src/modules/webhooks/handlers/__tests__/
  pull-request-review.handler.spec.ts

apps/api/src/modules/pr-reviews/__tests__/
  pr-reviews.repository.spec.ts
```

**Fixture** (`apps/api/src/modules/webhooks/__fixtures__/pull-request-review.fixture.ts`):

```typescript
export const prReviewSubmittedPayload = {
  action: 'submitted',
  review: {
    id: 5001,
    state: 'commented',
    submitted_at: '2026-02-11T10:00:00Z',
    user: {
      id: 222,
      login: 'bob',
      avatar_url: 'https://avatars.githubusercontent.com/u/222',
    },
  },
  pull_request: {
    id: 9001,
    number: 42,
    user: {
      id: 111,
      login: 'alice',
      avatar_url: 'https://avatars.githubusercontent.com/u/111',
    },
  },
  repository: {
    id: 555,
    name: 'backend',
    full_name: 'acme-org/backend',
    private: false,
    html_url: 'https://github.com/acme-org/backend',
    owner: {
      id: 67890,
      login: 'acme-org',
      avatar_url: 'https://avatars.githubusercontent.com/u/67890',
    },
  },
};

export const prReviewApprovedPayload = {
  ...prReviewSubmittedPayload,
  review: {
    ...prReviewSubmittedPayload.review,
    id: 5002,
    state: 'approved',
    submitted_at: '2026-02-11T11:00:00Z',
  },
};

export const prReviewSecondCommentPayload = {
  ...prReviewSubmittedPayload,
  review: {
    ...prReviewSubmittedPayload.review,
    id: 5003,
    submitted_at: '2026-02-11T12:00:00Z',
  },
};
```

**`pull-request-review.handler.spec.ts` — unit tests:**

Mock all services. Pre-configure `pullRequestsRepository.findByRepositoryAndNumber` to return a mock PR with `firstReviewAt: null` and `approvedAt: null` by default.

Scenarios:
- First review submitted → `setFirstReviewAt` is called with `submittedAt`.
- Second review for the same PR (PR now has `firstReviewAt` set) → `setFirstReviewAt` is NOT called again.
- Review with `state: 'approved'` and PR has no `approvedAt` → `setApprovedAt` is called.
- Review with `state: 'approved'` and PR already has `approvedAt` → `setApprovedAt` is NOT called.
- Review with `state: 'commented'` → `setApprovedAt` is never called regardless of PR state.
- Event with `action: 'edited'` (not 'submitted') → no service calls made.
- PR not found in DB → method returns without throwing, logs a warning.

**Integration test** (`apps/api/src/modules/webhooks/__tests__/pull-request-review.integration.spec.ts`):

Seed a PR row (use the `pullRequestOpenedPayload` webhook or insert directly via Prisma) before running review tests.

```typescript
it('sets first_review_at on first review', async () => {
  await sendWebhook('pull_request_review', prReviewSubmittedPayload);

  const pr = await prisma.pullRequest.findFirst({ where: { number: 42 } });
  expect(pr?.firstReviewAt).toEqual(new Date('2026-02-11T10:00:00Z'));
});

it('does not overwrite first_review_at on second review', async () => {
  await sendWebhook('pull_request_review', prReviewSubmittedPayload);
  await sendWebhook('pull_request_review', prReviewSecondCommentPayload);

  const pr = await prisma.pullRequest.findFirst({ where: { number: 42 } });
  expect(pr?.firstReviewAt).toEqual(new Date('2026-02-11T10:00:00Z'));
});

it('sets approved_at on approved review', async () => {
  await sendWebhook('pull_request_review', prReviewApprovedPayload);

  const pr = await prisma.pullRequest.findFirst({ where: { number: 42 } });
  expect(pr?.approvedAt).toEqual(new Date('2026-02-11T11:00:00Z'));
});
```

### Definition of Done

- [ ] On `pull_request_review.submitted`: upsert contributor (reviewer), upsert review record (state, submitted_at)
- [ ] If this is the first review on the PR: set `pull_request.first_review_at`
- [ ] If review state is `approved` and PR has no `approved_at` yet: set `pull_request.approved_at`
- [ ] All upserts are idempotent
- [ ] Test: replaying a review payload sets `first_review_at` on the PR
- [ ] Test: replaying a second review does NOT overwrite `first_review_at`
- [ ] Test: an `approved` review sets `approved_at`

---

## US-013: Push Event Handler

Handle the `push` webhook event to upsert commits and contributors.

**Parallel:** After US-009. Can run in parallel with US-010, US-011, US-012.

**Recommended Agents:** `backend-developer`

### Implementation Details

**New files:**

```
apps/api/src/modules/commits/
  commits.module.ts
  commits.service.ts
  commits.repository.ts
  models/
    commit.models.ts
```

**Extend `webhook-event.models.ts`:**

```typescript
export interface PushEventCommit {
  id: string;          // SHA
  message: string;
  timestamp: string;
  author: {
    name: string;
    email: string;
    username?: string; // may be absent for bots or unlinked accounts
  };
}

export interface PushPayload {
  ref: string;
  before: string;
  after: string;
  commits: PushEventCommit[];
  repository: GitHubRepositoryPayload & { owner: GitHubUserPayload };
  sender: GitHubUserPayload;
}
```

Note: `push` events carry `commit.author` as a name/email object rather than the `id`/`login`/`avatar_url` structure present in PR events. A contributor cannot be reliably upserted by `github_id` here because the GitHub user ID is not in the push commit payload. Use `login` (the `username` field) as the lookup key when present, otherwise fall back to creating a record keyed by email.

**`apps/api/src/modules/commits/models/commit.models.ts`**

```typescript
export interface UpsertCommitInput {
  sha: string;
  repositoryId: string;
  authorId: string | null;
  message: string;
  committedAt: Date;
}
```

**`apps/api/src/modules/commits/commits.repository.ts`**

```typescript
async upsert(input: UpsertCommitInput): Promise<Commit> {
  return this.prisma.commit.upsert({
    where: { sha: input.sha },
    create: {
      sha: input.sha,
      repositoryId: input.repositoryId,
      authorId: input.authorId,
      message: input.message,
      committedAt: input.committedAt,
    },
    update: {
      message: input.message,
      committedAt: input.committedAt,
    },
  });
}
```

The `sha` field must have a `@unique` constraint in the Prisma schema.

**`apps/api/src/modules/contributors/contributors.repository.ts` — extend:**

```typescript
async upsertByLogin(login: string, fallbackData: Partial<UpsertContributorInput>): Promise<Contributor> {
  return this.prisma.contributor.upsert({
    where: { login },
    create: {
      githubId: fallbackData.githubId ?? 0,  // 0 sentinel when ID unavailable from push payload
      login,
      avatarUrl: fallbackData.avatarUrl ?? '',
    },
    update: {},  // Don't overwrite existing data with potentially less complete push data
  });
}
```

**`apps/api/src/modules/webhooks/handlers/push.handler.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ContributorsService } from '../../contributors/contributors.service';
import { CommitsService } from '../../commits/commits.service';
import { RepositoriesService } from '../../repositories/repositories.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { PushPayload } from '../models/webhook-event.models';

@Injectable()
export class PushHandler {
  private readonly logger = new Logger(PushHandler.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly repositoriesService: RepositoriesService,
    private readonly contributorsService: ContributorsService,
    private readonly commitsService: CommitsService,
  ) {}

  async handle(payload: PushPayload): Promise<void> {
    if (!payload.commits?.length) return;

    const org = await this.organizationsService.upsert({
      githubId: payload.repository.owner.id,
      login: payload.repository.owner.login,
      avatarUrl: payload.repository.owner.avatar_url,
    });

    const repo = await this.repositoriesService.upsert({
      githubId: payload.repository.id,
      organizationId: org.id,
      name: payload.repository.name,
      fullName: payload.repository.full_name,
      isPrivate: payload.repository.private,
      htmlUrl: payload.repository.html_url,
    });

    for (const commit of payload.commits) {
      let authorId: string | null = null;

      if (commit.author.username) {
        const author = await this.contributorsService.upsertByLogin(commit.author.username, {});
        authorId = author.id;
      }

      await this.commitsService.upsert({
        sha: commit.id,
        repositoryId: repo.id,
        authorId,
        message: commit.message,
        committedAt: new Date(commit.timestamp),
      });
    }

    this.logger.log(
      { repo: payload.repository.full_name, commitCount: payload.commits.length },
      'Push event processed',
    );
  }
}
```

### Testing Details

**Test files:**

```
apps/api/src/modules/webhooks/handlers/__tests__/
  push.handler.spec.ts

apps/api/src/modules/commits/__tests__/
  commits.repository.spec.ts
```

**Fixture** (`apps/api/src/modules/webhooks/__fixtures__/push.fixture.ts`):

```typescript
export const pushPayload = {
  ref: 'refs/heads/main',
  before: 'abc123',
  after: 'def456',
  commits: [
    {
      id: 'sha-commit-001',
      message: 'fix: correct null pointer in auth middleware',
      timestamp: '2026-02-10T08:00:00Z',
      author: { name: 'Alice Smith', email: 'alice@example.com', username: 'alice' },
    },
    {
      id: 'sha-commit-002',
      message: 'refactor: extract token validation logic',
      timestamp: '2026-02-10T08:05:00Z',
      author: { name: 'Alice Smith', email: 'alice@example.com', username: 'alice' },
    },
    {
      id: 'sha-commit-003',
      message: 'test: add coverage for token expiry',
      timestamp: '2026-02-10T08:10:00Z',
      author: { name: 'Bob Jones', email: 'bob@example.com', username: 'bob' },
    },
  ],
  repository: {
    id: 555,
    name: 'backend',
    full_name: 'acme-org/backend',
    private: false,
    html_url: 'https://github.com/acme-org/backend',
    owner: {
      id: 67890,
      login: 'acme-org',
      avatar_url: 'https://avatars.githubusercontent.com/u/67890',
    },
  },
  sender: {
    id: 111,
    login: 'alice',
    avatar_url: 'https://avatars.githubusercontent.com/u/111',
  },
};
```

**`push.handler.spec.ts` — unit tests:**

Mock all injected services.

Scenarios:
- Payload with 3 commits → `commitsService.upsert` is called exactly 3 times with correct SHA values.
- Each commit with a `username` → `contributorsService.upsertByLogin` is called per distinct author.
- Commit without `username` → `contributorsService.upsertByLogin` is not called for that commit; `commitsService.upsert` is called with `authorId: null`.
- Payload with empty `commits` array → no calls to `commitsService.upsert`, method returns early.

**`commits.repository.spec.ts` — unit tests:**

Mock `PrismaService`. Verify that `upsert` uses `sha` as the unique key. Verify that a second call with the same SHA does not error.

**Integration test** (`apps/api/src/modules/webhooks/__tests__/push.integration.spec.ts`):

```typescript
it('creates 3 commit records from push payload with 3 commits', async () => {
  await sendWebhook('push', pushPayload);

  const commits = await prisma.commit.findMany({
    where: { sha: { in: ['sha-commit-001', 'sha-commit-002', 'sha-commit-003'] } },
  });
  expect(commits).toHaveLength(3);
});

it('does not create duplicate commits when same payload is sent twice', async () => {
  await sendWebhook('push', pushPayload);
  await sendWebhook('push', pushPayload);

  const commits = await prisma.commit.findMany({
    where: { sha: { in: ['sha-commit-001', 'sha-commit-002', 'sha-commit-003'] } },
  });
  expect(commits).toHaveLength(3);
});

it('links commits to the correct repository', async () => {
  await sendWebhook('push', pushPayload);

  const repo = await prisma.repository.findUnique({ where: { githubId: 555 } });
  const commits = await prisma.commit.findMany({ where: { repositoryId: repo!.id } });
  expect(commits).toHaveLength(3);
});
```

### Definition of Done

- [ ] On `push`: upsert repository, then for each commit in `event.commits`: upsert contributor (from `commit.author`), upsert commit (sha, message, timestamp)
- [ ] Link commits to the repository
- [ ] All upserts are idempotent (re-processing same push creates no duplicates, using SHA as unique key)
- [ ] Test: replaying a push payload with 3 commits creates 3 commit records
- [ ] Test: replaying the same payload again creates no additional records
