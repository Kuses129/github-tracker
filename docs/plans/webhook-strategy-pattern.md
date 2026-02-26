# Refactor Webhook Routing to Strategy Pattern

## Context
The `WebhooksService.route()` method uses a switch statement to dispatch events to handlers. Adding new event types requires modifying the service. A strategy pattern makes this open for extension without modification.

## Approach

### 1. Create `WebhookHandler` interface
- **File**: `apps/api/src/modules/webhooks/handlers/webhook-handler.interface.ts`
- Define: `handle(payload: unknown): Promise<void>`

### 2. Split `InstallationHandler` into two handlers
Currently handles both `installation` and `installation_repositories` with separate methods. Split into:
- `InstallationHandler` — keeps `handleInstallation` logic, renames method to `handle`
- `InstallationRepositoriesHandler` (new file) — gets `handleInstallationRepositories` logic as `handle`
- Both implement `WebhookHandler`

### 3. Update existing handlers to implement `WebhookHandler`
- `PullRequestHandler` — already has `handle()`, just add `implements WebhookHandler`
- `PullRequestReviewHandler` — same
- `PushHandler` — same

### 4. Refactor `WebhooksService`
- Build a `Map<GitHubEventType, WebhookHandler>` in the constructor from injected handlers
- Replace switch with map lookup

### 5. Update `WebhooksModule`
- Register `InstallationRepositoriesHandler` as a new provider

### 6. Update tests
- `installation.handler.spec.ts` — split into two test files or update to test the two handlers separately
- `webhooks.service.spec.ts` — update provider mocks and assertions

## Files to modify
- `apps/api/src/modules/webhooks/handlers/installation.handler.ts` — remove `handleInstallationRepositories`
- `apps/api/src/modules/webhooks/handlers/webhook-handler.interface.ts` — new
- `apps/api/src/modules/webhooks/handlers/installation-repositories.handler.ts` — new
- `apps/api/src/modules/webhooks/handlers/pull-request.handler.ts` — add `implements`
- `apps/api/src/modules/webhooks/handlers/pull-request-review.handler.ts` — add `implements`
- `apps/api/src/modules/webhooks/handlers/push.handler.ts` — add `implements`
- `apps/api/src/modules/webhooks/webhooks.service.ts` — map-based routing
- `apps/api/src/modules/webhooks/webhooks.module.ts` — add new provider
- `apps/api/src/modules/webhooks/handlers/__tests__/installation.handler.spec.ts` — update
- `apps/api/src/modules/webhooks/handlers/__tests__/installation-repositories.handler.spec.ts` — new
- `apps/api/src/modules/webhooks/__tests__/webhooks.service.spec.ts` — update

## Verification
- Run existing tests: `npx jest --testPathPattern=webhooks`
