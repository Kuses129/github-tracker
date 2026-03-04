import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { MetricsRepository } from '../metrics.repository';
import { MetricsService } from '../metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;
  let repository: jest.Mocked<MetricsRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: MetricsRepository,
          useValue: {
            getMergeFrequency: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
    repository = module.get(MetricsRepository);
  });

  describe('getMergeFrequency', () => {
    it('returns data with empty array when repository returns no rows', async () => {
      repository.getMergeFrequency.mockResolvedValue([]);

      const result = await service.getMergeFrequency({
        from: '2024-01-01T00:00:00Z',
        to: '2024-02-01T00:00:00Z',
        groupBy: 'day',
      });

      expect(result).toEqual({ data: [] });
    });

    it('maps bigint count to number in response', async () => {
      repository.getMergeFrequency.mockResolvedValue([
        { period: new Date('2024-01-15T00:00:00Z'), count: BigInt(5) },
      ]);

      const result = await service.getMergeFrequency({
        from: '2024-01-01T00:00:00Z',
        to: '2024-02-01T00:00:00Z',
        groupBy: 'day',
      });

      expect(result.data[0].count).toBe(5);
      expect(typeof result.data[0].count).toBe('number');
    });

    it('formats period as YYYY-MM-DD date string', async () => {
      repository.getMergeFrequency.mockResolvedValue([
        { period: new Date('2024-01-15T00:00:00Z'), count: BigInt(3) },
      ]);

      const result = await service.getMergeFrequency({
        from: '2024-01-01T00:00:00Z',
        to: '2024-02-01T00:00:00Z',
        groupBy: 'week',
      });

      expect(result.data[0].period).toBe('2024-01-15');
    });

    it('passes correct Date objects to repository', async () => {
      repository.getMergeFrequency.mockResolvedValue([]);

      await service.getMergeFrequency({
        from: '2024-01-01T00:00:00Z',
        to: '2024-02-01T00:00:00Z',
        groupBy: 'month',
      }, 'org-uuid-1');

      expect(repository.getMergeFrequency).toHaveBeenCalledWith(
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-02-01T00:00:00Z'),
        'month',
        undefined,
        'org-uuid-1',
      );
    });

    it('parses comma-separated repositories string into array', async () => {
      repository.getMergeFrequency.mockResolvedValue([]);

      await service.getMergeFrequency({
        from: '2024-01-01T00:00:00Z',
        to: '2024-02-01T00:00:00Z',
        groupBy: 'day',
        repositories: 'repo-uuid-1,repo-uuid-2,repo-uuid-3',
      });

      expect(repository.getMergeFrequency).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        'day',
        ['repo-uuid-1', 'repo-uuid-2', 'repo-uuid-3'],
        undefined,
      );
    });

    it('passes undefined repositoryIds when no repositories param is provided', async () => {
      repository.getMergeFrequency.mockResolvedValue([]);

      await service.getMergeFrequency({
        from: '2024-01-01T00:00:00Z',
        to: '2024-02-01T00:00:00Z',
        groupBy: 'day',
      });

      expect(repository.getMergeFrequency).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        'day',
        undefined,
        undefined,
      );
    });

    it('maps multiple rows correctly', async () => {
      repository.getMergeFrequency.mockResolvedValue([
        { period: new Date('2024-01-01T00:00:00Z'), count: BigInt(2) },
        { period: new Date('2024-01-02T00:00:00Z'), count: BigInt(8) },
      ]);

      const result = await service.getMergeFrequency({
        from: '2024-01-01T00:00:00Z',
        to: '2024-01-03T00:00:00Z',
        groupBy: 'day',
      });

      expect(result.data).toEqual([
        { period: '2024-01-01', count: 2 },
        { period: '2024-01-02', count: 8 },
      ]);
    });
  });
});
