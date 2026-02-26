import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );

    configureApp(app);

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok and timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ status: string; timestamp: string }>();
      expect(body.status).toBe('ok');
      expect(typeof body.timestamp).toBe('string');
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it('echoes x-correlation-id header when provided', async () => {
      const correlationId = 'test-correlation-id-123';
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-correlation-id': correlationId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-correlation-id']).toBe(correlationId);
    });

    it('generates a UUID correlation id when none provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const header = response.headers['x-correlation-id'] as string;
      expect(header).toBeDefined();
      expect(header).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('GET /nonexistent-route', () => {
    it('returns 404 with error envelope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent-route',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<{
        statusCode: number;
        message: string;
        correlationId: string;
        timestamp: string;
        path: string;
      }>();
      expect(body.statusCode).toBe(404);
      expect(typeof body.message).toBe('string');
      expect(typeof body.correlationId).toBe('string');
      expect(typeof body.timestamp).toBe('string');
      expect(body.path).toBe('/nonexistent-route');
    });
  });
});
