import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PullRequestsRepository } from '../pull-requests.repository';
import { PullRequestsService } from '../pull-requests.service';

const makePr = (overrides: Partial<{
  id: string;
  githubId: bigint;
  number: number;
  title: string;
  url: string;
  state: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  repositoryId: string;
  authorId: string | null;
  githubCreatedAt: Date;
  firstCommitAt: Date | null;
  firstReviewAt: Date | null;
  approvedAt: Date | null;
  mergedAt: Date | null;
}> = {}) => ({
  id: 'pr-uuid-1',
  githubId: BigInt(5001),
  number: 42,
  title: 'Add feature X',
  url: 'https://github.com/acme/repo/pull/42',
  state: 'merged',
  additions: 100,
  deletions: 20,
  changedFiles: 5,
  repositoryId: 'repo-uuid-1',
  authorId: 'author-uuid-1',
  githubCreatedAt: new Date('2024-01-10T10:00:00Z'),
  firstCommitAt: new Date('2024-01-08T08:00:00Z'),
  firstReviewAt: new Date('2024-01-11T09:00:00Z'),
  approvedAt: new Date('2024-01-11T14:00:00Z'),
  mergedAt: new Date('2024-01-12T10:00:00Z'),
  ...overrides,
});

describe('PullRequestsService', () => {
  let service: PullRequestsService;
  let repository: jest.Mocked<PullRequestsRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PullRequestsService,
        {
          provide: PullRequestsRepository,
          useValue: {
            upsert: jest.fn(),
            findByRepositoryAndNumber: jest.fn(),
            setFirstReviewAt: jest.fn(),
            setApprovedAt: jest.fn(),
            findByRepository: jest.fn(),
            findDetailById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PullRequestsService>(PullRequestsService);
    repository = module.get(PullRequestsRepository);
  });

  describe('listPullRequests', () => {
    it('returns correct CursorPage structure with data and nextCursor null when no more items', async () => {
      const pr = makePr();
      repository.findByRepository.mockResolvedValue({ items: [pr] as any, hasMore: false });

      const result = await service.listPullRequests('repo-uuid-1', {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('pr-uuid-1');
      expect(result.data[0].cycleTime.totalSeconds).toBe(
        Math.round((new Date('2024-01-12T10:00:00Z').getTime() - new Date('2024-01-08T08:00:00Z').getTime()) / 1000),
      );
      expect(result.nextCursor).toBeNull();
    });

    it('sets nextCursor when hasMore is true', async () => {
      const pr = makePr({ id: 'pr-uuid-last', githubCreatedAt: new Date('2024-01-10T10:00:00Z') });
      repository.findByRepository.mockResolvedValue({ items: [pr] as any, hasMore: true });

      const result = await service.listPullRequests('repo-uuid-1', {});

      const expectedCursor = Buffer.from('2024-01-10T10:00:00.000Z|pr-uuid-last').toString('base64');
      expect(result.nextCursor).toBe(expectedCursor);
    });

    it('decodes compound cursor and passes date + id to repository', async () => {
      repository.findByRepository.mockResolvedValue({ items: [], hasMore: false });
      const encodedCursor = Buffer.from('2024-01-10T10:00:00.000Z|some-pr-id').toString('base64');

      await service.listPullRequests('repo-uuid-1', { cursor: encodedCursor });

      expect(repository.findByRepository).toHaveBeenCalledWith(
        'repo-uuid-1',
        expect.objectContaining({
          cursorDate: new Date('2024-01-10T10:00:00.000Z'),
          cursorId: 'some-pr-id',
        }),
      );
    });

    it('passes filter params to repository', async () => {
      repository.findByRepository.mockResolvedValue({ items: [], hasMore: false });

      await service.listPullRequests('repo-uuid-1', {
        from: '2024-01-01T00:00:00Z',
        to: '2024-02-01T00:00:00Z',
        state: 'merged',
        limit: 50,
      });

      expect(repository.findByRepository).toHaveBeenCalledWith(
        'repo-uuid-1',
        expect.objectContaining({
          from: new Date('2024-01-01T00:00:00Z'),
          to: new Date('2024-02-01T00:00:00Z'),
          state: 'merged',
          limit: 50,
        }),
      );
    });

    it('maps BigInt githubId to number in response', async () => {
      const pr = makePr({ githubId: BigInt(9876543210) });
      repository.findByRepository.mockResolvedValue({ items: [pr] as any, hasMore: false });

      const result = await service.listPullRequests('repo-uuid-1', {});

      expect(result.data[0].githubId).toBe(9876543210);
    });
  });

  describe('getPullRequest', () => {
    it('returns detail DTO with computed cycle time when all lifecycle timestamps are set', async () => {
      const pr = makePr({
        firstCommitAt: new Date('2024-01-08T08:00:00Z'),
        githubCreatedAt: new Date('2024-01-10T10:00:00Z'),
        firstReviewAt: new Date('2024-01-11T09:00:00Z'),
        approvedAt: new Date('2024-01-11T14:00:00Z'),
        mergedAt: new Date('2024-01-12T10:00:00Z'),
      });
      repository.findDetailById.mockResolvedValue(pr as any);

      const result = await service.getPullRequest('pr-uuid-1');

      // codingTimeSeconds: githubCreatedAt - firstCommitAt = Jan 10 10:00 - Jan 8 08:00 = 2*86400 + 2*3600 = 180000 + 7200 = 187200
      expect(result.cycleTime.codingTimeSeconds).toBe(
        Math.round((new Date('2024-01-10T10:00:00Z').getTime() - new Date('2024-01-08T08:00:00Z').getTime()) / 1000),
      );
      // pickupTimeSeconds: firstReviewAt - githubCreatedAt
      expect(result.cycleTime.pickupTimeSeconds).toBe(
        Math.round((new Date('2024-01-11T09:00:00Z').getTime() - new Date('2024-01-10T10:00:00Z').getTime()) / 1000),
      );
      // reviewTimeSeconds: approvedAt - firstReviewAt
      expect(result.cycleTime.reviewTimeSeconds).toBe(
        Math.round((new Date('2024-01-11T14:00:00Z').getTime() - new Date('2024-01-11T09:00:00Z').getTime()) / 1000),
      );
      // deployTimeSeconds: mergedAt - approvedAt
      expect(result.cycleTime.deployTimeSeconds).toBe(
        Math.round((new Date('2024-01-12T10:00:00Z').getTime() - new Date('2024-01-11T14:00:00Z').getTime()) / 1000),
      );
      // totalSeconds: mergedAt - firstCommitAt
      expect(result.cycleTime.totalSeconds).toBe(
        Math.round((new Date('2024-01-12T10:00:00Z').getTime() - new Date('2024-01-08T08:00:00Z').getTime()) / 1000),
      );
    });

    it('returns null cycle time fields when lifecycle timestamps are missing', async () => {
      const pr = makePr({
        firstCommitAt: null,
        firstReviewAt: null,
        approvedAt: null,
        mergedAt: null,
      });
      repository.findDetailById.mockResolvedValue(pr as any);

      const result = await service.getPullRequest('pr-uuid-1');

      expect(result.cycleTime.codingTimeSeconds).toBeNull();
      expect(result.cycleTime.pickupTimeSeconds).toBeNull();
      expect(result.cycleTime.reviewTimeSeconds).toBeNull();
      expect(result.cycleTime.deployTimeSeconds).toBeNull();
      expect(result.cycleTime.totalSeconds).toBeNull();
    });

    it('throws NotFoundException when pull request is not found', async () => {
      repository.findDetailById.mockResolvedValue(null);

      await expect(service.getPullRequest('unknown-id')).rejects.toThrow(NotFoundException);
    });

    it('includes all PR fields in the detail DTO', async () => {
      const pr = makePr();
      repository.findDetailById.mockResolvedValue(pr as any);

      const result = await service.getPullRequest('pr-uuid-1');

      expect(result.id).toBe('pr-uuid-1');
      expect(result.githubId).toBe(5001);
      expect(result.number).toBe(42);
      expect(result.state).toBe('merged');
      expect(result.repositoryId).toBe('repo-uuid-1');
      expect(result.authorId).toBe('author-uuid-1');
      expect(typeof result.cycleTime).toBe('object');
    });
  });
});
