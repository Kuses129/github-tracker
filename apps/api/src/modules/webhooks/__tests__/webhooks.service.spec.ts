import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { InstallationHandler } from '../handlers/installation.handler';
import { PullRequestHandler } from '../handlers/pull-request.handler';
import { PullRequestReviewHandler } from '../handlers/pull-request-review.handler';
import { PushHandler } from '../handlers/push.handler';
import { WebhooksService } from '../webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let installationHandler: InstallationHandler;
  let pullRequestHandler: PullRequestHandler;
  let pullRequestReviewHandler: PullRequestReviewHandler;
  let pushHandler: PushHandler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: InstallationHandler,
          useValue: {
            handleInstallation: jest.fn().mockResolvedValue(undefined),
            handleInstallationRepositories: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PullRequestHandler,
          useValue: { handle: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: PullRequestReviewHandler,
          useValue: { handle: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: PushHandler,
          useValue: { handle: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    installationHandler = module.get<InstallationHandler>(InstallationHandler);
    pullRequestHandler = module.get<PullRequestHandler>(PullRequestHandler);
    pullRequestReviewHandler = module.get<PullRequestReviewHandler>(PullRequestReviewHandler);
    pushHandler = module.get<PushHandler>(PushHandler);
  });

  it('delegates "installation" to installationHandler.handleInstallation', async () => {
    const payload = { action: 'created', installation: { id: 1, account: { id: 10, login: 'user' } } };
    await service.route('installation', payload);
    expect(installationHandler.handleInstallation).toHaveBeenCalledWith(payload);
  });

  it('delegates "installation_repositories" to installationHandler.handleInstallationRepositories', async () => {
    const payload = { action: 'added', installation: { id: 1, account: { id: 10, login: 'user' } }, repositories_added: [], repositories_removed: [] };
    await service.route('installation_repositories', payload);
    expect(installationHandler.handleInstallationRepositories).toHaveBeenCalledWith(payload);
  });

  it('delegates "pull_request" to pullRequestHandler.handle', async () => {
    const payload = { action: 'opened', pull_request: { id: 1 }, repository: {} };
    await service.route('pull_request', payload);
    expect(pullRequestHandler.handle).toHaveBeenCalledWith(payload);
  });

  it('delegates "pull_request_review" to pullRequestReviewHandler.handle', async () => {
    const payload = { action: 'submitted', review: { id: 1 }, pull_request: { id: 2 }, repository: {} };
    await service.route('pull_request_review', payload);
    expect(pullRequestReviewHandler.handle).toHaveBeenCalledWith(payload);
  });

  it('delegates "push" to pushHandler.handle', async () => {
    const payload = { ref: 'refs/heads/main', before: 'abc', after: 'def', commits: [], repository: {}, sender: {} };
    await service.route('push', payload);
    expect(pushHandler.handle).toHaveBeenCalledWith(payload);
  });

  it('does not throw for an unhandled event type', async () => {
    await expect(service.route('unknown' as never, {})).resolves.toBeUndefined();
  });
});
