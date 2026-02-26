import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  const mockResponse = { status: 'ok' as const, timestamp: new Date().toISOString() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: { getHealth: jest.fn().mockReturnValue(mockResponse) },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  it('returns health response from service', () => {
    const result = controller.getHealth();
    expect(result).toEqual(mockResponse);
    expect(service.getHealth).toHaveBeenCalledTimes(1);
  });

  it('returns status ok', () => {
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
  });

  it('returns a timestamp string', () => {
    const result = controller.getHealth();
    expect(typeof result.timestamp).toBe('string');
  });
});
