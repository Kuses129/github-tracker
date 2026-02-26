import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import type { InjectOptions, Response } from 'light-my-request';
import { WebhooksController } from '../webhooks.controller';
import { WebhooksService } from '../webhooks.service';
import { computeSignature } from '../../../test/webhook.helpers';

const TEST_SECRET = 'integration-test-secret';

describe('Webhooks HTTP pipeline (integration)', () => {
  let app: NestFastifyApplication;
  let adapter: FastifyAdapter;

  function inject(opts: InjectOptions): Promise<Response> {
    return adapter.inject(opts) as Promise<Response>;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ GITHUB_WEBHOOK_SECRET: TEST_SECRET })],
          ignoreEnvFile: true,
        }),
      ],
      controllers: [WebhooksController],
      providers: [
        {
          provide: WebhooksService,
          useValue: { route: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    adapter = new FastifyAdapter();
    app = moduleRef.createNestApplication<NestFastifyApplication>(adapter, {
      rawBody: true,
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects request with missing signature header with 401', async () => {
    const body = JSON.stringify({ action: 'created' });

    const response = await inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: { 'content-type': 'application/json', 'x-github-event': 'push' },
      body,
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects request with wrong signature with 401', async () => {
    const body = JSON.stringify({ action: 'created' });
    const wrongSignature = computeSignature('wrong-secret', body);

    const response = await inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'push',
        'x-hub-signature-256': wrongSignature,
      },
      body,
    });

    expect(response.statusCode).toBe(401);
  });

  it('accepts request with valid signature with 200', async () => {
    const body = JSON.stringify({ action: 'created' });
    const signature = computeSignature(TEST_SECRET, body);

    const response = await inject({
      method: 'POST',
      url: '/webhooks/github',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'push',
        'x-hub-signature-256': signature,
      },
      body,
    });

    expect(response.statusCode).toBe(200);
  });
});
