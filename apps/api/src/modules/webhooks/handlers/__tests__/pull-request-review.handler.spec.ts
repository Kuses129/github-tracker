import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ContributorsService } from '../../../contributors/contributors.service';
import { OrganizationsService } from '../../../organizations/organizations.service';
import { PrReviewsService } from '../../../pr-reviews/pr-reviews.service';
import { PullRequestsRepository } from '../../../pull-requests/pull-requests.repository';
import { RepositoriesService } from '../../../repositories/repositories.service';
import { mockOrg, mockRepo, repository } from '../../../../test/webhook.helpers';
import { PullRequestReviewHandler } from '../pull-request-review.handler';

const mockReviewer = { id: 'reviewer-uuid' };
const reviewUser = { id: 601, login: 'reviewer-bob' };
const prUser = { id: 501, login: 'dev-jane' };

const mockPr = { id: 'pr-uuid', firstReviewAt: null as Date | null, approvedAt: null as Date | null };

function buildPayload(state: string, action = 'submitted') {
  return {
    action,
    review: {
      id: 8001,
      state,
      submitted_at: '2026-01-16T12:00:00Z',
      user: reviewUser,
    },
    pull_request: { id: 9001, number: 42, user: prUser },
    repository,
  };
}

describe('PullRequestReviewHandler', () => {
  let handler: PullRequestReviewHandler;
  let organizationsService: jest.Mocked<OrganizationsService>;
  let repositoriesService: jest.Mocked<RepositoriesService>;
  let contributorsService: jest.Mocked<ContributorsService>;
  let prReviewsService: jest.Mocked<PrReviewsService>;
  let pullRequestsRepository: jest.Mocked<PullRequestsRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PullRequestReviewHandler,
        {
          provide: OrganizationsService,
          useValue: { upsert: jest.fn().mockResolvedValue(mockOrg) },
        },
        {
          provide: RepositoriesService,
          useValue: { upsert: jest.fn().mockResolvedValue(mockRepo) },
        },
        {
          provide: ContributorsService,
          useValue: { upsert: jest.fn().mockResolvedValue(mockReviewer) },
        },
        {
          provide: PrReviewsService,
          useValue: { upsert: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: PullRequestsRepository,
          useValue: {
            findByRepositoryAndNumber: jest.fn().mockResolvedValue({ ...mockPr }),
            setFirstReviewAt: jest.fn().mockResolvedValue(undefined),
            setApprovedAt: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    handler = module.get<PullRequestReviewHandler>(PullRequestReviewHandler);
    organizationsService = module.get(OrganizationsService);
    repositoriesService = module.get(RepositoriesService);
    contributorsService = module.get(ContributorsService);
    prReviewsService = module.get(PrReviewsService);
    pullRequestsRepository = module.get(PullRequestsRepository);
  });

  it('does nothing when action is not submitted', async () => {
    await handler.handle(buildPayload('commented', 'edited') as any);

    expect(organizationsService.upsert).not.toHaveBeenCalled();
    expect(prReviewsService.upsert).not.toHaveBeenCalled();
  });

  it('returns without throwing when PR is not found', async () => {
    pullRequestsRepository.findByRepositoryAndNumber.mockResolvedValue(null);

    await expect(handler.handle(buildPayload('commented') as any)).resolves.toBeUndefined();
    expect(prReviewsService.upsert).not.toHaveBeenCalled();
  });

  it('calls setFirstReviewAt on the first review', async () => {
    pullRequestsRepository.findByRepositoryAndNumber.mockResolvedValue({ ...mockPr, firstReviewAt: null } as any);

    await handler.handle(buildPayload('commented') as any);

    expect(pullRequestsRepository.setFirstReviewAt).toHaveBeenCalledTimes(1);
    expect(pullRequestsRepository.setFirstReviewAt).toHaveBeenCalledWith(
      mockPr.id,
      new Date('2026-01-16T12:00:00Z'),
    );
  });

  it('does not call setFirstReviewAt when PR already has firstReviewAt', async () => {
    pullRequestsRepository.findByRepositoryAndNumber.mockResolvedValue({
      ...mockPr,
      firstReviewAt: new Date('2026-01-15T09:00:00Z'),
    } as any);

    await handler.handle(buildPayload('commented') as any);

    expect(pullRequestsRepository.setFirstReviewAt).not.toHaveBeenCalled();
  });

  it('calls setApprovedAt when state is approved and no prior approvedAt', async () => {
    pullRequestsRepository.findByRepositoryAndNumber.mockResolvedValue({ ...mockPr, approvedAt: null } as any);

    await handler.handle(buildPayload('approved') as any);

    expect(pullRequestsRepository.setApprovedAt).toHaveBeenCalledTimes(1);
    expect(pullRequestsRepository.setApprovedAt).toHaveBeenCalledWith(
      mockPr.id,
      new Date('2026-01-16T12:00:00Z'),
    );
  });

  it('does not call setApprovedAt when PR already has approvedAt', async () => {
    pullRequestsRepository.findByRepositoryAndNumber.mockResolvedValue({
      ...mockPr,
      approvedAt: new Date('2026-01-15T11:00:00Z'),
    } as any);

    await handler.handle(buildPayload('approved') as any);

    expect(pullRequestsRepository.setApprovedAt).not.toHaveBeenCalled();
  });

  it('does not call setApprovedAt when state is commented', async () => {
    await handler.handle(buildPayload('commented') as any);

    expect(pullRequestsRepository.setApprovedAt).not.toHaveBeenCalled();
  });

  it('upserts the review with correct fields', async () => {
    await handler.handle(buildPayload('changes_requested') as any);

    expect(prReviewsService.upsert).toHaveBeenCalledWith({
      githubId: 8001,
      pullRequestId: mockPr.id,
      reviewerId: mockReviewer.id,
      state: 'changes_requested',
      submittedAt: new Date('2026-01-16T12:00:00Z'),
    });
  });
});
