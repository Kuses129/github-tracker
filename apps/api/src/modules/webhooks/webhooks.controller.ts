import { Controller, Post, Headers, Body, HttpCode, UseGuards } from '@nestjs/common';
import { WebhookSignatureGuard } from '../../common/guards/webhook-signature.guard';
import type { GitHubEventType } from './models/webhook-event.models';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks/github')
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
