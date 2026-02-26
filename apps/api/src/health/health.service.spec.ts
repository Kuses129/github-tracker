import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  it('returns status ok', () => {
    const result = service.getHealth();
    expect(result.status).toBe('ok');
  });

  it('returns a valid ISO timestamp', () => {
    const result = service.getHealth();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
