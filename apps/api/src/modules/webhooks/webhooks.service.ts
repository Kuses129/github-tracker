import { Injectable, Logger } from '@nestjs/common';
import { InstallationRepositoriesHandler } from './handlers/installation-repositories.handler';
import { InstallationHandler } from './handlers/installation.handler';
import { PullRequestHandler } from './handlers/pull-request.handler';
import { PullRequestReviewHandler } from './handlers/pull-request-review.handler';
import { PushHandler } from './handlers/push.handler';
import type { WebhookHandler } from './handlers/webhook-handler.interface';
import type { GitHubEventType } from './models/webhook-event.models';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly handlers: Map<GitHubEventType, WebhookHandler>;

  constructor(
    installationHandler: InstallationHandler,
    installationRepositoriesHandler: InstallationRepositoriesHandler,
    pullRequestHandler: PullRequestHandler,
    pullRequestReviewHandler: PullRequestReviewHandler,
    pushHandler: PushHandler,
  ) {
    this.handlers = new Map<GitHubEventType, WebhookHandler>([
      ['installation', installationHandler],
      ['installation_repositories', installationRepositoriesHandler],
      ['pull_request', pullRequestHandler],
      ['pull_request_review', pullRequestReviewHandler],
      ['push', pushHandler],
    ]);
  }

  async route(event: GitHubEventType, payload: unknown): Promise<void> {
    this.logger.log({ event }, 'Webhook received');

    const handler = this.handlers.get(event);

    if (!handler) {
      this.logger.log({ event }, 'Unhandled webhook event — ignoring');
      return;
    }

    return handler.handle(payload);
  }
}
