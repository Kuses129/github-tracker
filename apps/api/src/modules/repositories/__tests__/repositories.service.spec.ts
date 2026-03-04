import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RepositoriesRepository } from '../repositories.repository';
import { RepositoriesService } from '../repositories.service';

const makeRepo = (overrides: Partial<{
  id: string;
  githubId: bigint;
  name: string;
  organizationId: string;
  createdAt: Date;
}> = {}) => ({
  id: 'repo-uuid-1',
  githubId: BigInt(99),
  name: 'backend',
  organizationId: 'org-uuid-1',
  createdAt: new Date('2024-02-01T00:00:00Z'),
  ...overrides,
});

const makeRepoWithStats = (overrides: Partial<{
  id: string;
  githubId: bigint;
  name: string;
  organizationId: string;
  createdAt: Date;
  totalPullRequests: number;
  mergedPullRequests: number;
  openPullRequests: number;
}> = {}) => ({
  ...makeRepo(overrides),
  totalPullRequests: 10,
  mergedPullRequests: 7,
  openPullRequests: 3,
  ...overrides,
});

describe('RepositoriesService', () => {
  let service: RepositoriesService;
  let repository: jest.Mocked<RepositoriesRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepositoriesService,
        {
          provide: RepositoriesRepository,
          useValue: {
            upsert: jest.fn(),
            removeByGithubId: jest.fn(),
            findAll: jest.fn(),
            findByOrgId: jest.fn(),
            findWithStats: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RepositoriesService>(RepositoriesService);
    repository = module.get(RepositoriesRepository);
  });

  describe('listRepositories', () => {
    it('returns mapped DTOs without stats', async () => {
      const repo = makeRepo();
      repository.findAll.mockResolvedValue([repo] as any);

      const result = await service.listRepositories();

      expect(result).toEqual([
        {
          id: repo.id,
          githubId: 99,
          name: repo.name,
          organizationId: repo.organizationId,
          createdAt: '2024-02-01T00:00:00.000Z',
        },
      ]);
    });

    it('returns empty array when no repositories exist', async () => {
      repository.findAll.mockResolvedValue([]);

      const result = await service.listRepositories();

      expect(result).toEqual([]);
    });
  });

  describe('getRepository', () => {
    it('returns DTO with stats when repository is found', async () => {
      const repo = makeRepoWithStats();
      repository.findWithStats.mockResolvedValue(repo as any);

      const result = await service.getRepository('repo-uuid-1');

      expect(result).toEqual({
        id: repo.id,
        githubId: 99,
        name: repo.name,
        organizationId: repo.organizationId,
        createdAt: '2024-02-01T00:00:00.000Z',
        totalPullRequests: 10,
        mergedPullRequests: 7,
        openPullRequests: 3,
      });
    });

    it('converts BigInt githubId to number', async () => {
      const repo = makeRepoWithStats({ githubId: BigInt(9999999999) });
      repository.findWithStats.mockResolvedValue(repo as any);

      const result = await service.getRepository('repo-uuid-1');

      expect(result.githubId).toBe(9999999999);
    });

    it('throws NotFoundException when repository is not found', async () => {
      repository.findWithStats.mockResolvedValue(null);

      await expect(service.getRepository('unknown-id')).rejects.toThrow(NotFoundException);
    });
  });
});
