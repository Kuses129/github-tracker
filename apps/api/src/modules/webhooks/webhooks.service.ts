import { Injectable, Logger } from '@nestjs/common';
import { InstallationHandler } from './handlers/installation.handler';
import { PullRequestHandler } from './handlers/pull-request.handler';
import { PullRequestReviewHandler } from './handlers/pull-request-review.handler';
import { PushHandler } from './handlers/push.handler';
import type {
  GitHubEventType,
  InstallationPayload,
  InstallationRepositoriesPayload,
  PullRequestPayload,
  PullRequestReviewPayload,
  PushPayload,
} from './models/webhook-event.models';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly installationHandler: InstallationHandler,
    private readonly pullRequestHandler: PullRequestHandler,
    private readonly pullRequestReviewHandler: PullRequestReviewHandler,
    private readonly pushHandler: PushHandler,
  ) {}

  async route(event: GitHubEventType, payload: unknown): Promise<void> {
    this.logger.log({ event }, 'Webhook received');

    switch (event) {
      case 'installation':
        return this.installationHandler.handleInstallation(
          payload as InstallationPayload,
        );
      case 'installation_repositories':
        return this.installationHandler.handleInstallationRepositories(
          payload as InstallationRepositoriesPayload,
        );
      case 'pull_request':
        return this.pullRequestHandler.handle(payload as PullRequestPayload);
      case 'pull_request_review':
        return this.pullRequestReviewHandler.handle(
          payload as PullRequestReviewPayload,
        );
      case 'push':
        return this.pushHandler.handle(payload as PushPayload);
      default:
        this.logger.log({ event }, 'Unhandled webhook event — ignoring');
    }
  }
}
