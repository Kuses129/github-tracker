import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { WebhookSignatureGuard } from '../../../common/guards/webhook-signature.guard';
import { WebhooksController } from '../webhooks.controller';
import { WebhooksService } from '../webhooks.service';

class AllowAllGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let webhooksService: WebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: WebhooksService,
          useValue: { route: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    })
      .overrideGuard(WebhookSignatureGuard)
      .useClass(AllowAllGuard)
      .compile();

    controller = module.get<WebhooksController>(WebhooksController);
    webhooksService = module.get<WebhooksService>(WebhooksService);
  });

  it('routes a known event type to the service', async () => {
    const payload = { action: 'created' };
    await controller.handleWebhook('installation', payload);
    expect(webhooksService.route).toHaveBeenCalledWith('installation', payload);
  });

  it('routes an unknown event type to the service without throwing', async () => {
    const payload = { action: 'unknown_action' };
    await controller.handleWebhook('push', payload);
    expect(webhooksService.route).toHaveBeenCalledWith('push', payload);
  });
});
